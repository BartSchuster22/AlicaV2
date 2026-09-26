"""Verifier unit tests, NOT assembled Cell/production signing qualification."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import call, patch

SOURCE = Path(__file__).resolve().parents[2] / 'tools/g7-runtime-bootstrap.py'
spec = importlib.util.spec_from_file_location('runtime_bootstrap', SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RuntimeDispatch(unittest.TestCase):
    # No candidate fixture: unsupported dispatch must not reach verification.
    def test_unsupported_operation_rejected_before_candidate_io(self):
        for operation in ['admin', 'install-service']:
            with self.subTest(operation=operation), \
                    patch.object(module, 'verify', side_effect=AssertionError('candidate verification reached')) as verify, \
                    patch.object(module.os, 'chdir') as chdir, \
                    patch.object(module.os, 'execve') as execute:
                with self.assertRaisesRegex(ValueError, 'unsupported operation; supported: verify\\|prepare\\|owned'):
                    module.main(['/not-read', 'not-a-pin', operation, 'request'])
                verify.assert_not_called()
                chdir.assert_not_called()
                execute.assert_not_called()


class RuntimeReadAtOwnership(unittest.TestCase):
    # Descriptor doubles only; no fixture, native addon, or OS-close-race claim.
    def test_close_error_transfers_ownership_without_retry(self):
        with patch.object(module.os, 'dup', return_value=10), \
                patch.object(module.os, 'open', return_value=11) as opened, \
                patch.object(module.os, 'close', side_effect=[OSError('close'), None]) as closed, \
                patch.object(module, 'private') as private, \
                patch.object(module.os, 'read') as read:
            with self.assertRaisesRegex(OSError, 'close'):
                module.read_at(9, 'runtime/payload.txt', 64, 0)
            opened.assert_called_once_with('runtime', module.FLAGS | os.O_DIRECTORY, dir_fd=10)
            self.assertEqual(closed.call_args_list, [call(10), call(11)])
            private.assert_not_called()
            read.assert_not_called()

    def test_nested_open_error_releases_current_once(self):
        with patch.object(module.os, 'dup', return_value=10), \
                patch.object(module.os, 'open', side_effect=[11, OSError('open')]) as opened, \
                patch.object(module.os, 'close') as closed, \
                patch.object(module.os, 'fstat', return_value='metadata') as metadata, \
                patch.object(module, 'private') as private, \
                patch.object(module.os, 'read') as read:
            with self.assertRaisesRegex(OSError, 'open'):
                module.read_at(9, 'runtime/tools/payload.txt', 64, 0)
            self.assertEqual(opened.call_args_list, [
                call('runtime', module.FLAGS | os.O_DIRECTORY, dir_fd=10),
                call('tools', module.FLAGS | os.O_DIRECTORY, dir_fd=11)])
            self.assertEqual(closed.call_args_list, [call(10), call(11)])
            metadata.assert_called_once_with(11)
            private.assert_called_once_with('metadata', True)
            read.assert_not_called()

    def test_nested_validation_error_releases_new_once(self):
        with patch.object(module.os, 'dup', return_value=10), \
                patch.object(module.os, 'open', return_value=11) as opened, \
                patch.object(module.os, 'close') as closed, \
                patch.object(module.os, 'fstat', return_value='metadata') as metadata, \
                patch.object(module, 'private', side_effect=ValueError('unsafe directory')) as private, \
                patch.object(module.os, 'read') as read:
            with self.assertRaisesRegex(ValueError, 'unsafe directory'):
                module.read_at(9, 'runtime/payload.txt', 64, 0)
            opened.assert_called_once_with('runtime', module.FLAGS | os.O_DIRECTORY, dir_fd=10)
            self.assertEqual(closed.call_args_list, [call(10), call(11)])
            metadata.assert_called_once_with(11)
            private.assert_called_once_with('metadata', True)
            read.assert_not_called()


class RuntimeAncestors(unittest.TestCase):
    # Controlled descriptor metadata only. Real main -> verify -> helper; no
    # filesystem fixture or inventory read on denial. Not an OS race test.
    def test_unsafe_at_every_depth_denies_before_read_or_exec(self):
        for operation in ['verify', 'prepare', 'owned']:
            for depth in range(4):  # /, safe, parent, candidate
                for uid, mode in [(2002, 0o755), (0, 0o775), (1001, 0o702),
                                  (0, 0o1777), (0, stat.S_IFREG | 0o755)]:
                    metadata = [SimpleNamespace(st_uid=0, st_mode=stat.S_IFDIR | 0o755)
                                for _ in range(4)]
                    metadata[depth] = SimpleNamespace(st_uid=uid, st_mode=(
                        mode if stat.S_IFMT(mode) else stat.S_IFDIR | mode))
                    with self.subTest(operation=operation, depth=depth, uid=uid, mode=mode), \
                            patch.object(module.os, 'getuid', return_value=1001), \
                            patch.object(module.os, 'open', side_effect=[10, 11, 12, 13]) as opened, \
                            patch.object(module.os, 'fstat', side_effect=lambda fd: metadata[fd - 10]), \
                            patch.object(module.os, 'close') as closed, \
                            patch.object(module, 'read_at') as read, \
                            patch.object(module.os, 'chdir') as chdir, \
                            patch.object(module.os, 'execve') as execute:
                        with self.assertRaisesRegex(ValueError, 'unsafe ancestor'):
                            module.main(['/safe/parent/candidate', '0' * 64, operation])
                        self.assertEqual(opened.call_count, depth + 1)
                        self.assertEqual(closed.call_args_list, [call(fd) for fd in range(10, 11 + depth)])
                        read.assert_not_called()
                        chdir.assert_not_called()
                        execute.assert_not_called()

    def test_safe_chain_checks_parent_before_advancing_and_returns_owned_fd(self):
        events = []
        def opened(name, flags, **kwargs):
            self.assertEqual(flags, module.FLAGS | os.O_DIRECTORY)
            index = ['/', 'safe', 'parent', 'candidate'].index(name)
            if index:
                self.assertIn(('stat', 9 + index), events)
                self.assertEqual(kwargs, {'dir_fd': 9 + index})
            else:
                self.assertEqual(kwargs, {})
            events.append(('open', 10 + index))
            return 10 + index
        def metadata(fd):
            events.append(('stat', fd))
            return SimpleNamespace(st_uid=0 if fd < 12 else 1001,
                                   st_mode=stat.S_IFDIR | (0o755 if fd < 12 else 0o700))
        with patch.object(module.os, 'getuid', return_value=1001), \
                patch.object(module.os, 'open', side_effect=opened), \
                patch.object(module.os, 'fstat', side_effect=metadata), \
                patch.object(module.os, 'close') as closed:
            self.assertEqual(module.open_directory('/safe/parent/candidate'), 13)
            self.assertEqual([e for e in events if e[0] == 'stat'],
                             [('stat', fd) for fd in range(10, 14)])
            self.assertEqual(closed.call_args_list, [call(10), call(11), call(12)])

    def test_failures_release_owned_descriptors(self):
        # close failure models Linux's released-FD error, NOT permission to
        # retry a descriptor number which may have been reused.
        for failure in ['open', 'stat', 'close']:
            with self.subTest(failure=failure), \
                    patch.object(module.os, 'getuid', return_value=1001), \
                    patch.object(module.os, 'open', side_effect=[10, OSError('open')] if failure == 'open' else [10, 11]), \
                    patch.object(module.os, 'fstat', side_effect=[
                        SimpleNamespace(st_uid=0, st_mode=stat.S_IFDIR | 0o755), OSError('stat')]), \
                    patch.object(module.os, 'close', side_effect=[OSError('close'), None] if failure == 'close' else None) as closed:
                with self.assertRaises(OSError):
                    module.open_directory('/safe')
                self.assertEqual(closed.call_args_list,
                                 [call(10)] if failure == 'open' else [call(10), call(11)])

    def test_noncanonical_paths_deny_without_open(self):
        for path in ['relative', '//safe', '/safe//parent', '/safe/./parent', '/safe/../parent', '/safe/']:
            with self.subTest(path=path), patch.object(module.os, 'open') as opened:
                with self.assertRaisesRegex(ValueError, 'normalized directory'):
                    module.open_directory(path)
                opened.assert_not_called()


class RuntimeBootstrap(unittest.TestCase):
    def setUp(self):
        # Deliberately not tempfile's shared /tmp default. Validate the actual
        # home ancestry before creating fixtures; unsafe homes fail, not skip.
        parent = str(Path.home())
        os.close(module.open_directory(parent))
        self.temp = tempfile.TemporaryDirectory(prefix='g7-bootstrap-unit-', dir=parent)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'runtime').mkdir(mode=0o700)
        self.payload = self.root / 'runtime/payload.txt'
        self.payload.write_bytes(b'actual verifier unit payload\n')
        self.payload.chmod(0o600)
        data = self.payload.read_bytes()
        self.manifest = {'schemaVersion': 'alica.runtime-inventory/v1',
                         'qualification': 'DEVELOPMENT_RUNTIME_NOT_PRODUCTION_SIGNED',
                         'inventory': [{'path': 'runtime/payload.txt', 'bytes': len(data),
                                        'sha256': hashlib.sha256(data).hexdigest(), 'mode': 0o600}]}
        self.pin()

    def pin(self):
        data = json.dumps(self.manifest).encode()
        self.pin_value = hashlib.sha256(data).hexdigest()
        (self.root / 'runtime-inventory.json').write_bytes(data)
        (self.root / 'runtime-inventory.json').chmod(0o600)

    def verify(self):
        return module.verify(str(self.root), self.pin_value)

    def test_exact_bytes_and_independent_process(self):
        self.assertEqual(self.verify()['verifiedFiles'], 1)
        run = subprocess.run([sys.executable, '-I', str(SOURCE), str(self.root), self.pin_value, 'verify'],
                             cwd='/', env={'PATH': '/usr/bin:/bin', 'NODE_OPTIONS': '--not-real',
                                           'PYTHONPATH': '/nonexistent'}, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertFalse(json.loads(run.stdout)['productionSignature'])

    def test_pin_mismatch(self):
        self.pin_value = '0' * 64
        with self.assertRaisesRegex(ValueError, 'pin mismatch'):
            self.verify()

    def test_tamper(self):
        self.payload.write_bytes(b'x' * self.payload.stat().st_size)
        with self.assertRaisesRegex(ValueError, 'artifact mismatch'):
            self.verify()

    def test_consumed_size(self):
        self.payload.write_bytes(self.payload.read_bytes() + b'x')
        with self.assertRaisesRegex(ValueError, 'file limit'):
            self.verify()

    def test_missing(self):
        self.payload.unlink()
        with self.assertRaises(FileNotFoundError):
            self.verify()

    def test_extra(self):
        extra = self.root / 'extra'
        extra.write_bytes(b'not listed')
        extra.chmod(0o600)
        with self.assertRaisesRegex(ValueError, 'unlisted artifact'):
            self.verify()

    def test_empty_directory(self):
        (self.root / 'extra').mkdir(mode=0o700)
        with self.assertRaisesRegex(ValueError, 'unlisted directory'):
            self.verify()

    def test_symlink_file(self):
        self.payload.unlink()
        self.payload.symlink_to('/etc/passwd')
        with self.assertRaises(OSError):
            self.verify()

    def test_symlink_directory(self):
        self.payload.unlink()
        (self.root / 'runtime').rmdir()
        (self.root / 'runtime').symlink_to('/tmp')
        with self.assertRaises(OSError):
            self.verify()

    def test_hardlink(self):
        os.link(self.payload, self.root / 'alias')
        with self.assertRaisesRegex(ValueError, 'link count'):
            self.verify()

    def test_fifo_does_not_block(self):
        self.payload.unlink()
        os.mkfifo(self.payload, 0o600)
        with self.assertRaisesRegex(ValueError, 'type'):
            self.verify()

    def test_permissions(self):
        self.payload.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'mode'):
            self.verify()

    def test_root_permissions(self):
        self.root.chmod(0o755)
        with self.assertRaisesRegex(ValueError, 'mode'):
            self.verify()

    def test_invalid_entries(self):
        original = self.manifest['inventory'][0].copy()
        for field, value in [('path', '../escape'), ('path', 'runtime/@scope/file'),
                             ('bytes', True), ('bytes', -1), ('bytes', 268435457),
                             ('mode', 0o777), ('sha256', 'invented'), ('extra', True)]:
            with self.subTest(field=field, value=value):
                self.manifest['inventory'] = [{**original, field: value}]
                self.pin()
                with self.assertRaises(ValueError):
                    self.verify()

    def test_duplicates_and_case_aliases(self):
        first = self.manifest['inventory'][0]
        for name in ['runtime/payload.txt', 'runtime/PAYLOAD.txt']:
            self.manifest['inventory'] = [first, {**first, 'path': name}]
            self.pin()
            with self.assertRaisesRegex(ValueError, 'alias'):
                self.verify()

    def test_closed_manifest(self):
        self.manifest['extra'] = True
        self.pin()
        with self.assertRaisesRegex(ValueError, 'unsupported inventory'):
            self.verify()

    def test_duplicate_json_and_depth(self):
        for text in [b'{"x":1,"x":2}', b'[' * 34 + b'0' + b']' * 34,
                     b'{"x":1.5}', b'{"x":NaN}', b'{"x":9007199254740992}']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                module.decode(text)

    def test_deadline(self):
        fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            with self.assertRaisesRegex(ValueError, 'deadline'):
                module.read_at(fd, 'runtime/payload.txt', 1024, 0)
        finally:
            os.close(fd)

    def test_operator_tamper_never_executes(self):
        self.payload.write_bytes(b'altered')
        with patch.object(module.os, 'execve') as execute:
            with self.assertRaises(ValueError):
                module.main([str(self.root), self.pin_value, 'owned', 'serve'])
            execute.assert_not_called()

    def test_operator_unknown_operation_never_executes(self):
        with patch.object(module.os, 'execve') as execute:
            with self.assertRaisesRegex(ValueError, 'unsupported operation'):
                module.main([str(self.root), self.pin_value, 'install-service'])
            execute.assert_not_called()

    def test_operator_host_boundary_never_executes(self):
        with patch.object(module.os, 'execve') as execute, \
                patch.object(module.sys, 'version_info', (3, 11)):
            with self.assertRaisesRegex(ValueError, 'prepared Linux/Python'):
                module.main([str(self.root), self.pin_value, 'owned'])
            execute.assert_not_called()

    def test_operator_environment_contract_mock_only(self):
        # A mocked launcher contract test, explicitly NOT assembled execution.
        for operation, script in [('prepare', 'g7-cell-cli.mjs'),
                                  ('owned', 'g7-owned-cli.mjs')]:
            with self.subTest(operation=operation), \
                    patch.object(module.os, 'execve') as execute, \
                    patch.object(module.os, 'chdir') as chdir, \
                    patch.object(module.sys, 'version_info', (3, 12)), \
                    patch.object(module.sys, 'platform', 'linux'), \
                    patch.dict(os.environ, {'NODE_PATH': '/source/node_modules',
                                            'NODE_OPTIONS': '--require=/source/hook',
                                            'PYTHONPATH': '/source', 'PYTHONHOME': '/source'}):
                module.main([str(self.root), self.pin_value, operation, 'argument'])
                runtime = str(self.root / 'runtime')
                execute.assert_called_once_with(
                    runtime + '/bin/node',
                    [runtime + '/bin/node', '--no-global-search-paths', '--experimental-vm-modules',
                     runtime + '/tools/' + script, 'argument'],
                    {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': str(self.root)})
                chdir.assert_called_once_with(str(self.root))

    def test_inventory_json_size_limit(self):
        data = b' ' * (module.MAX_JSON + 1)
        (self.root / 'runtime-inventory.json').write_bytes(data)
        self.pin_value = hashlib.sha256(data).hexdigest()
        with self.assertRaisesRegex(ValueError, 'file limit'):
            self.verify()

    def test_inventory_count_limit(self):
        self.manifest['inventory'] *= 4097
        self.pin()
        with self.assertRaisesRegex(ValueError, 'inventory count'):
            self.verify()

    def test_non_normalized_root(self):
        for path in ['relative', str(self.root) + '/../escape', str(self.root) + '//runtime']:
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, 'normalized root'):
                module.verify(path, self.pin_value)

    def test_unlisted_symlink_never_follows(self):
        (self.root / 'extra').symlink_to('/etc/passwd')
        with self.assertRaisesRegex(ValueError, 'type'):
            self.verify()

    def test_self_inventory(self):
        self.manifest['inventory'][0]['path'] = 'runtime-inventory.json'
        self.pin()
        with self.assertRaisesRegex(ValueError, 'self inventory'):
            self.verify()


if __name__ == '__main__':
    unittest.main()
