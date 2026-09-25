import importlib.util
from pathlib import Path
import struct
import sys
import unittest
import hashlib
import os
import tempfile

# Test-only Ubuntu installed-package audit bytes. Never a runtime dependency.
AUDIT_PINS = {
    'readelf': '04db0000749aff89e4af21429340b00b536fc6f80e811c872c006507881a5560',
    'libctf-nobfd.so.0': 'd46fc30938410e5fe6861c608f57b5fb60bb34d1f8af9e5b0bbbb0ecbb806792',
    'libz.so.1': '64c206f0146cc58bbddc4f22054436f4ff278f5a554aa3ce6921ddf7e9133370',
}

def verified_audit_bundle(directory, pins=None):
    directory = Path(directory)
    if not directory.is_absolute():
        raise ValueError('audit bundle path must be absolute')
    for name, expected in (AUDIT_PINS if pins is None else pins).items():
        path = directory/name
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError('audit tool/dependency hash mismatch: ' + name)
    env = dict(os.environ)
    env.pop('LD_PRELOAD', None)
    env['LD_LIBRARY_PATH'] = str(directory)
    return str(directory/'readelf'), env

def audit_tool():
    directory = os.environ.get('G7_TEST_READELF_DIR')
    if directory is not None:
        return verified_audit_bundle(directory)
    return '/usr/bin/readelf', None

p = Path(__file__).resolve().parents[2]/'tools/g7-runtime-binary-inputs.py'
spec = importlib.util.spec_from_file_location('binary_inputs', p)
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ElfTests(unittest.TestCase):
    def test_build_audit_default_and_fail_closed(self):
        from unittest.mock import patch
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(module.build_audit_tool(), ('/usr/bin/readelf', {'PATH': '/usr/bin:/bin', 'LANG': 'C'}))
        with tempfile.TemporaryDirectory() as tmp:
            for directory in ['relative', tmp]:
                with patch.dict(os.environ, {'G7_TEST_READELF_DIR': directory}):
                    with self.assertRaises(ValueError):
                        module.build_audit_tool()
            (Path(tmp)/'readelf').write_bytes(b'wrong bytes')
            with patch.dict(os.environ, {'G7_TEST_READELF_DIR': tmp}):
                with self.assertRaises(ValueError):
                    module.build_audit_tool()

    def test_build_audit_real_bundle_matches_independent_test_tool(self):
        # Mandatory actual GNU readelf execution also exercises the build selector.
        import subprocess
        before = dict(os.environ)
        tool, env = module.build_audit_tool()
        self.assertNotIn('LD_PRELOAD', env)
        self.assertEqual(dict(os.environ), before)
        independent_tool, independent_env = audit_tool()
        binary = str(Path(sys.executable).resolve())
        self.assertEqual(subprocess.check_output([tool, '-Ws', '--wide', binary], env=env),
                         subprocess.check_output([independent_tool, '-Ws', '--wide', binary], env=independent_env))

    def test_audit_bundle_rejects_changed_or_missing_dependency(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = b'hash validation fixture, never executed'
            pins = {name: hashlib.sha256(data).hexdigest() for name in AUDIT_PINS}
            for name in AUDIT_PINS:
                with self.subTest(name=name):
                    for entry in AUDIT_PINS:
                        (Path(tmp)/entry).write_bytes(data)
                    (Path(tmp)/name).unlink()
                    with self.assertRaises(FileNotFoundError):
                        verified_audit_bundle(tmp, pins)
                    (Path(tmp)/name).write_bytes(b'not pinned bytes')
                    with self.assertRaises(ValueError):
                        verified_audit_bundle(tmp, pins)

    def test_audit_bundle_path_and_symlink_fail_closed(self):
        with self.assertRaises(ValueError):
            verified_audit_bundle('relative')
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp)/'readelf').symlink_to('/usr/bin/readelf')
            with self.assertRaises(ValueError):
                verified_audit_bundle(tmp)

    def test_audit_bundle_environment_is_scoped(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = b'validation fixture, never executed'
            (Path(tmp)/'readelf').write_bytes(data)
            before = dict(os.environ)
            tool, env = verified_audit_bundle(tmp, {'readelf': hashlib.sha256(data).hexdigest()})
            self.assertEqual(tool, str(Path(tmp)/'readelf'))
            self.assertEqual(env['LD_LIBRARY_PATH'], tmp)
            self.assertNotIn('LD_PRELOAD', env)
            self.assertEqual(dict(os.environ), before)

    def test_actual_host_elf(self):
        # Actual local OS bytes, not the pinned release Node/native artifacts.
        p = Path(sys.executable).resolve()
        result = module.elf(p.read_bytes())
        self.assertEqual(result['bytes'], p.stat().st_size)
        self.assertTrue(result['interpreter'].startswith('/'))
        self.assertTrue(any(e['tag'] == 'NEEDED' for e in result['dynamicDependencies']))
        self.assertTrue(any(v['name'].startswith('GLIBC_') for e in result['versionRequirements'] for v in e['versions']))
    def test_actual_cached_fdlibm_symbols(self):
        import tarfile
        import subprocess
        import tempfile
        root=p.parents[1]
        binary_input=root/'.tools/node/bin/node'
        if binary_input.is_file():
            data=binary_input.read_bytes()
        else:
            with tarfile.open(root/'evidence/g7/runtime-assembly/fresh-age-signed-milestone/assembled-candidate.tar') as t:
                stream=t.extractfile('runtime/bin/node')
                assert stream is not None
                data=stream.read()
        with tempfile.TemporaryDirectory() as tmp:
            binary=Path(tmp)/'node'
            binary.write_bytes(data)
            tool, env = audit_tool()
            raw=subprocess.check_output([tool,'-Ws','--wide',str(binary)], env=env)
        result=module.fdlibm_symbols(data,raw)
        self.assertEqual(len(result),23)
        self.assertTrue(all(r['bytes'] > 0 for r in result))
        with self.assertRaises(AssertionError):module.fdlibm_symbols(data,b'')

    def test_not_elf(self):
        with self.assertRaises(AssertionError):
            module.elf(b'not ELF')
    def test_wrong_architecture(self):
        data=bytearray(Path(sys.executable).resolve().read_bytes())
        struct.pack_into('<H',data,18,183)
        with self.assertRaises(AssertionError):
            module.elf(data)
    def test_ph_overflow(self):
        data=bytearray(Path(sys.executable).resolve().read_bytes())
        struct.pack_into('<Q',data,32,len(data))
        with self.assertRaises(AssertionError):
            module.elf(data)

if __name__ == '__main__':
    unittest.main()
