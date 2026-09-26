"""Pure stdlib extraction tests; no signing, native code, or suite discovery.

Load only the extract function AST from the exact candidate. Runtime helper
imports are stdlib-only. Synthetic byte transport is NOT signed-host evidence.
"""
import ast
import hashlib
import importlib.util
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('runtime', ROOT / 'tools/g7-runtime-bootstrap.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
source = ast.parse((ROOT / 'tools/g7-signed-bootstrap.py').read_text())
function = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == 'extract')
namespace = dict(Path=Path, os=os, stat=__import__('stat'), hashlib=hashlib,
                 runtime=runtime, require=runtime.require, FLAGS=runtime.FLAGS)
exec(compile(ast.Module(body=[function], type_ignores=[]), '<candidate extract>', 'exec'), namespace)
extract = namespace['extract']


class ExtractDescriptors(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='extract-unit-', dir=ROOT)
        self.addCleanup(self.temp.cleanup)
        self.destination = Path(self.temp.name) / 'destination'
        self.data = b'non-native extraction regression\n'
        self.archive = types.SimpleNamespace(
            entries=[dict(path='runtime/tools/payload.txt', bytes=len(self.data),
                          digest='sha256:' + hashlib.sha256(self.data).hexdigest(), position=0)],
            unchanged=lambda: None,
            read=lambda offset, length: self.data[offset:offset + length])

    def test_regular_extraction_bytes_and_no_descriptor_leak(self):
        before = set(os.listdir('/proc/self/fd'))
        extract(self.archive, str(self.destination))
        self.assertEqual((self.destination / 'runtime/tools/payload.txt').read_bytes(), self.data)
        self.assertEqual(set(os.listdir('/proc/self/fd')), before)

    def test_close_error_transfers_child_and_does_not_retry_parent(self):
        # Model Linux close semantics: FD is released even when close reports
        # an error. Fail the parent close immediately after opening a child.
        real_open, real_close = os.open, os.close
        child = parent = None
        calls = []
        before = set(os.listdir('/proc/self/fd'))

        def opened(path, flags, *args, **kwargs):
            nonlocal child, parent
            fd = real_open(path, flags, *args, **kwargs)
            if path == 'runtime':
                child, parent = fd, kwargs['dir_fd']
            return fd

        def closed(fd):
            if child is not None:
                calls.append(fd)
            real_close(fd)
            if fd == parent and calls.count(fd) == 1:
                raise OSError('injected released-parent close failure')

        try:
            with patch.object(os, 'open', side_effect=opened), patch.object(os, 'close', side_effect=closed):
                with self.assertRaisesRegex(OSError, 'injected released-parent close failure'):
                    extract(self.archive, str(self.destination))
            self.assertIsNotNone(child)
            self.assertEqual(calls.count(parent), 1, 'released parent must not be retried')
            self.assertEqual(calls.count(child), 1, 'new child must be closed on failure')
            self.assertEqual(set(os.listdir('/proc/self/fd')), before)
            self.assertFalse((self.destination / 'runtime/tools/payload.txt').exists())
            self.assertTrue((self.destination / 'runtime').is_dir(), 'failure residue is preserved')
        finally:
            # Test-owned failure cleanup only; do not mask the old implementation
            # leak or leave that intentionally reproduced descriptor behind.
            if child is not None:
                try:
                    os.fstat(child)
                except OSError:
                    pass
                else:
                    real_close(child)


if __name__ == '__main__':
    unittest.main(verbosity=2)
