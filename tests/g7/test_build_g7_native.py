"""Synthetic subprocess-boundary tests ONLY; no native compilation/evidence.
Fixtures are retained under G7_SYNTHETIC_ROOT when supplied by the operator.
"""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

BUILDER = Path(__file__).resolve().parents[2] / 'tools/build-g7-native.py'
PIN = '2858dc89dbbfdd08cceda1b841e7fd0a793a1a67b49f150bc3d0d1de44ed7f51'

class BuilderTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='synthetic-', dir=os.environ.get('G7_SYNTHETIC_ROOT')))
        for name, data in {'native/g7/ownership.c': b'SYNTHETIC source', 'native/g6/toolchain.lock.json': json.dumps({'bytes': 1, 'sha256': hashlib.sha256(b'x').hexdigest(), 'version': '0.15.2'}).encode(), 'toolchain.lock.json': b'{}', '.tools/g6-zig.tar.xz': b'x', '.tools/zig-x86_64-linux-0.15.2/zig': b'SYNTHETIC compiler', '.tools/node/include/node/test.h': b'SYNTHETIC header', 'tools/build-g7-native.py': BUILDER.read_bytes()}.items():
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
        self.recipe = self.root / 'tools/build-g7-native.py'
        spec = importlib.util.spec_from_file_location('synthetic_builder', self.recipe)
        self.m = importlib.util.module_from_spec(spec)
        with patch('subprocess.run', side_effect=RuntimeError('import executed subprocess')), patch('subprocess.check_output', side_effect=RuntimeError('import executed subprocess')), patch('subprocess.Popen', side_effect=RuntimeError('import executed subprocess')):
            spec.loader.exec_module(self.m)
        self.out = self.root / 'out'; self.out.mkdir()
        self.calls = []
        self.change = None
        self.log_override = None
        self.rc = 0
        self.killed = False

    def version(self, args, **kw):
        self.calls.append(('version', args, kw)); return '0.15.2\n'

    def fake_run(self, args, **kw):
        self.calls.append(('run', args, kw))
        if args[1] == 'ld.lld':
            Path(next(s[5:] for s in args if s.startswith('-Map='))).write_bytes(b'SYNTHETIC map')
            if self.change == 'elf': (self.out/'ownership.node').write_bytes(b'changed')
            if self.change == 'input': (self.root/'native/g7/ownership.c').write_bytes(b'changed')
        else:
            Path(args[args.index('-o')+1]).write_bytes(b'SYNTHETIC not ELF')

    def popen(self, args, **kw):
        self.calls.append(('popen', args, kw))
        output = Path(args[args.index('-o')+1]); output.write_bytes(b'SYNTHETIC not ELF')
        log = self.log_override if self.log_override is not None else ('ld.lld -shared -o '+str(output)+' x.o\n').encode()
        class Process:
            stdout = io.BytesIO(log)
            def wait(p): return self.rc
            def kill(p): self.killed = True
        return Process()

    def invoke(self, argv, pin=True, cli=False):
        real_sha = self.m.sha
        def sha(p): return PIN if pin and p.name == 'zig' else real_sha(p)
        with patch.object(self.m, 'sha', sha), patch('subprocess.check_output', self.version), patch('subprocess.run', self.fake_run), patch('subprocess.Popen', self.popen), contextlib.redirect_stdout(io.StringIO()) as capture:
            if cli:
                with patch('sys.argv', [str(self.recipe)]): runpy.run_path(str(self.recipe), run_name='__main__')
            else: self.m.main(argv)
        return capture.getvalue()

    def test_noargs_cli_default_contract(self):
        build = self.root/'native/g7/build'; build.mkdir(); (build/'receipt.json').write_text('old')
        (build/'ownership.node').write_bytes(b'old')
        receipt = json.loads(self.invoke([], cli=True))
        self.assertEqual([c[0] for c in self.calls], ['version', 'run'])
        _, args, kw = self.calls[-1]
        self.assertEqual(kw, dict(cwd=self.root, check=True, env={**os.environ, 'ZIG_GLOBAL_CACHE_DIR': str(self.root/'.tools/zig-global-cache'), 'ZIG_LOCAL_CACHE_DIR': str(self.root/'.tools/zig-local-cache')}))
        self.assertEqual(args[-2:], ['-o', str(build/'ownership.node')]); self.assertNotIn('-v', args)
        self.assertEqual(set(receipt), {'qualification','command','compilerArchiveSha256','compilerExecutableSha256','inputs','outputSha256'})
        self.assertEqual(receipt, json.loads((build/'receipt.json').read_text()))
        self.assertEqual(receipt['qualification'], 'HOST-OWNERSHIP-ONLY')
        self.assertFalse((build/'ownership.node.map').exists())

    def test_fresh_provenance_and_environment(self):
        self.invoke(['--output-directory', str(self.out)])
        r = json.loads((self.out/'receipt.json').read_text())
        self.assertEqual(r['sourceProvenance'], {'ownershipSha256': self.m.sha(self.root/'native/g7/ownership.c'), 'recipeSha256': self.m.sha(self.recipe)})
        self.assertTrue(r['mapRelinkSameElf'])
        self.assertEqual(r['qualification'], 'HOST-OWNERSHIP-ONLY')
        self.assertEqual(set(r['environment']), {'PATH','LANG','HOME','TMPDIR','ZIG_LIB_DIR','ZIG_GLOBAL_CACHE_DIR','ZIG_LOCAL_CACHE_DIR'})
        self.assertEqual(self.calls[-1][1][:2], [str(self.root/'.tools/zig-x86_64-linux-0.15.2/zig'), 'ld.lld'])
        self.assertEqual(self.calls[-1][2]['env'], r['environment'])
        self.assertEqual(r['command'][-1], '-v')

    def test_admission(self):
        for p in [self.root/'missing', self.root/'toolchain.lock.json']:
            with self.assertRaises(OSError): self.invoke(['--output-directory', str(p)])
        (self.out/'.hidden').write_text('occupied')
        with self.assertRaisesRegex(SystemExit, 'Fresh empty'): self.invoke(['--output-directory', str(self.out)])
        self.assertEqual(self.calls, [])

    def test_pins(self):
        with self.assertRaisesRegex(SystemExit, 'installed compiler'): self.invoke(['--output-directory', str(self.out)], pin=False)
        (self.root/'.tools/g6-zig.tar.xz').write_bytes(b'z')
        with self.assertRaisesRegex(SystemExit, 'archive mismatch'): self.invoke(['--output-directory', str(self.out)])
        self.assertEqual(self.calls, [])

    def test_parser(self):
        valid = b'ld.lld -o /out/a x.o\n'
        self.assertEqual(self.m.linker_command(valid, '/pinned/zig', '/out/a'), ['/pinned/zig','ld.lld','-o','/out/a','x.o'])
        for bad in [b'', valid+valid, b'ld.lld -o /wrong x.o', b'ld.lld -o', b'ld.lld -o /out/a -o /wrong', b'/untrusted/ld.lld -o /out/a', b'echo ld.lld -o /out/a']:
            with self.subTest(bad=bad), self.assertRaises(SystemExit): self.m.linker_command(bad, '/pinned/zig', '/out/a')

    def test_same_elf_guard(self):
        self.change = 'elf'
        with self.assertRaisesRegex(SystemExit, 'changed ELF'): self.invoke(['--output-directory', str(self.out)])
        self.assertFalse((self.out/'receipt.json').exists())

    def test_input_integrity_guard(self):
        self.change = 'input'
        with self.assertRaisesRegex(SystemExit, 'inputs changed'): self.invoke(['--output-directory', str(self.out)])
        self.assertFalse((self.out/'receipt.json').exists())

    def test_capture_bound(self):
        self.log_override = b'x'*65537
        with self.assertRaisesRegex(SystemExit, 'overflow'): self.invoke(['--output-directory', str(self.out)])
        self.assertTrue(self.killed); self.assertFalse((self.out/'receipt.json').exists())

    def test_compiler_failure(self):
        self.rc = 7
        with self.assertRaises(SystemExit) as raised: self.invoke(['--output-directory', str(self.out)])
        self.assertEqual(raised.exception.code, 7)
        self.assertTrue((self.out/'compiler.log').exists()); self.assertFalse((self.out/'receipt.json').exists())

if __name__ == '__main__':
    unittest.main()
