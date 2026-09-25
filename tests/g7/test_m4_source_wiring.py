"""Synthetic SOURCE wiring. No real payload/archive/native code required.
Whole ordinary consumers with I/O/ELF/archive/hash boundary doubles. These tests
exercise selection and propagation, NOT cryptography, native or legal admission.
"""
from contextlib import ExitStack
from pathlib import Path
from types import ModuleType, SimpleNamespace
import json
import unittest
from unittest.mock import patch

ROOT = Path(__file__).absolute().parents[2]
R = Path('/synthetic/project')
O = 'native/g7/build/ownership.node'
ROLES = ('native/g6/build/bridge.node', 'native/g6/build/launcher', O)
LOCATIONS = {'ownershipDirectory': '/synthetic/fresh', 'attributionDirectory': '/synthetic/maps'}


def load(name, optimize=0):
    p = ROOT/'tools'/name
    m = ModuleType('synthetic_m4')
    exec(compile(p.read_text(), str(p), 'exec', optimize=optimize), m.__dict__)
    return m


class Wiring(unittest.TestCase):
    def test_closed_lexical_contract_and_early_rejection(self):
        for mode in (0, 1, 2):
            n = load('g7-runtime-native-notices.py', mode)
            b = load('g7-runtime-binary-inputs.py', mode)
            defaults, mapped = n.select_native_inputs(R)
            self.assertEqual(defaults, n.select_artifact_paths(R))
            self.assertEqual(mapped, R/'evidence/g7/runtime-assembly/native-attribution-inputs')
            bad = [None, {}, [], {'ownershipDirectory': '/synthetic/fresh'},
                   dict(LOCATIONS, extra='no')]
            for value in (None, 1, '', 'relative', '/', '//synthetic/new',
                          '/synthetic/../new', '/synthetic//new', '/synthetic/./new',
                          '/synthetic/new/', str(R), str(R/'new'), 'bad\0path'):
                for key in LOCATIONS:
                    bad.append(dict(LOCATIONS, **{key: value}))
            # Binary selection loads the real ordinary notice module, not payloads.
            # Loader is doubled to retain this optimization-mode instance.
            loader = SimpleNamespace(exec_module=lambda module: None)
            spec = SimpleNamespace(loader=loader)
            with patch.object(b.importlib.util, 'spec_from_file_location', return_value=spec), \
                 patch.object(b.importlib.util, 'module_from_spec', return_value=n), \
                 patch.object(Path, 'read_bytes', side_effect=AssertionError('unexpected I/O')) as read:
                for value in bad:
                    with self.subTest(mode=mode, value=value):
                        with self.assertRaises(AssertionError): n.observe(R, native_locations=value)
                        with self.assertRaises(AssertionError): b.observe(R, value)
                with self.assertRaises(AssertionError): n.observe(R, artifact_locations={O: '/synthetic/fresh'})
                with self.assertRaises(AssertionError): n.observe(R, artifact_locations={O: '/synthetic/fresh'}, mapped='')
                with self.assertRaises(AssertionError): n.observe(R, mapped='/synthetic/maps', native_locations=LOCATIONS)
                read.assert_not_called()
                module, paths, kwargs, _ = b.native_selection(R, LOCATIONS)
                self.assertIs(module, n)
                self.assertEqual(kwargs, {'native_locations': LOCATIONS})
                self.assertEqual(paths[O], (Path('/synthetic/fresh/ownership.node'), Path('/synthetic/fresh/receipt.json')))

    def test_actual_notice_and_binary_native_stage_no_fallback(self):
        for mode in (0, 1, 2):
            for explicit in (False, True):
                for failure in (None, 'missing-output', 'missing-receipt', 'missing-binding', 'missing-map',
                                'elf-binding', 'map-digest', 'receipt-digest', 'membership'):
                    with self.subTest(mode=mode, explicit=explicit, failure=failure):
                        n = load('g7-runtime-native-notices.py', mode)
                        b = load('g7-runtime-binary-inputs.py', mode)
                        paths, mapped = n.select_native_inputs(R, LOCATIONS) if explicit else n.select_native_inputs(R)
                        binding = [{'path': p, 'sha256': 'pin', 'mapSha256': 'pin'} for p in ROLES]
                        if failure == 'membership': binding.pop()
                        if failure == 'elf-binding': binding[-1]['sha256'] = 'bad'
                        if failure == 'map-digest': binding[-1]['mapSha256'] = 'bad'
                        data = {R/'native/g6/toolchain.lock.json': json.dumps({'version': '1', 'sha256': 'pin'}).encode(),
                                mapped/'binding.json': json.dumps(binding).encode(),
                                R/'tools/g7-runtime-native-notices.py': b'synthetic helper token'}
                        for role, (artifact, receipt) in paths.items():
                            data[artifact] = b'synthetic binary token'
                            data[receipt] = json.dumps({'sources': {}, 'artifacts': {'bridge.node': 'pin', 'launcher': 'pin'},
                                                       'outputSha256': 'bad' if failure == 'receipt-digest' and role == O else 'pin'}).encode()
                            data[mapped/(Path(role).name+'.map')] = b'header\n0 0 1 0 synthetic.o:(text)\n'
                        missing = {'missing-output': paths[O][0], 'missing-receipt': paths[O][1],
                                   'missing-binding': mapped/'binding.json', 'missing-map': mapped/'ownership.node.map'}
                        if failure in missing: del data[missing[failure]]
                        reads = []
                        def read(p):
                            reads.append(p)
                            if p not in data: raise FileNotFoundError(str(p))
                            return data[p]
                        debug = SimpleNamespace(source_paths=lambda _: {'paths': [], 'debugLineSha256': 'pin'})
                        loader = SimpleNamespace(exec_module=lambda module: None)
                        member = 'zig-x86_64-linux-1/lib/libc/glibc/LICENSES'
                        kwargs = {'native_locations': LOCATIONS} if explicit else {}
                        selection = (n, paths, kwargs, R/'tools/g7-runtime-native-notices.py')
                        with ExitStack() as s:
                            s.enter_context(patch.object(Path, 'read_bytes', read))
                            s.enter_context(patch.object(n, 'sha', return_value='pin'))
                            s.enter_context(patch.object(b, 'sha', return_value='pin'))
                            s.enter_context(patch.object(b, 'elf', return_value={'sha256': 'pin'}))
                            archive = s.enter_context(patch.object(
                                n, 'archive_members', return_value={member: b'synthetic notice token'}))
                            s.enter_context(patch.object(n.importlib.util, 'spec_from_file_location', return_value=SimpleNamespace(loader=loader)))
                            s.enter_context(patch.object(n.importlib.util, 'module_from_spec', return_value=debug))
                            if failure:
                                with self.assertRaises((AssertionError, FileNotFoundError)):
                                    b.observe_native(R, selection)
                                archive.assert_not_called()
                            else:
                                attribution, artifacts = b.observe_native(R, selection)
                                archive.assert_called_once_with(R/'.tools/g6-zig.tar.xz', 'pin', {member})
                                self.assertEqual(set(artifacts), {'runtime/'+p for p in ROLES})
                                self.assertEqual({a['path'] for a in attribution['artifacts']}, set(artifacts))
                                for p in paths[O]: self.assertIn(p, reads)
                                self.assertIn(mapped/'binding.json', reads)
                                self.assertIn(mapped/'ownership.node.map', reads)
                            if explicit:
                                self.assertNotIn(R/O, reads)
                                self.assertNotIn(R/'native/g7/build/receipt.json', reads)
                                self.assertFalse(any(p.is_relative_to(R/'evidence/g7/runtime-assembly/native-attribution-inputs') for p in reads))


if __name__ == '__main__':
    unittest.main()
