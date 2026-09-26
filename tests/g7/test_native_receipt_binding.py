"""SYNTHETIC tokens, not ELF/build/runtime qualification. Retained fixtures."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

P = Path(__file__).resolve().parents[2]/'tools/g7-runtime-native-notices.py'
S = importlib.util.spec_from_file_location('binding', P)
M = importlib.util.module_from_spec(S)
S.loader.exec_module(M)
H = lambda b: hashlib.sha256(b).hexdigest()

class ReceiptBinding(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='synthetic-', dir=os.environ.get('G7_SYNTHETIC_ROOT')))
        self.maps = self.root/'maps'
        self.roles = ['native/g6/build/bridge.node', 'native/g6/build/launcher', 'native/g7/build/ownership.node']
        self.put('.tools/g6-zig.tar.xz', b'synthetic archive')
        self.put('.tools/zig-x86_64-linux-test/zig', b'synthetic compiler')
        self.js('native/g6/toolchain.lock.json', {'version':'test','sha256':H(b'synthetic archive')})
        self.put('native/g6/bridge.c', b'synthetic g6 source')
        self.put('native/g7/ownership.c', b'synthetic g7 source')
        self.put('tools/build-g7-native.py', b'synthetic recipe')
        common = {'compilerArchiveSha256':H(b'synthetic archive'), 'compilerExecutableSha256':H(b'synthetic compiler')}
        self.g6 = dict(common, sources={'native/g6/bridge.c':H(b'synthetic g6 source')}, artifacts={})
        self.g7 = dict(common, inputs={'native/g7/ownership.c':H(b'synthetic g7 source'),'tools/build-g7-native.py':H(b'synthetic recipe')})
        for p in ('native/g6/launcher.c', 'native/g6/sandbox.c', 'toolchain.lock.json'):
            self.put(p, b'synthetic required input')
        for p in ('native/g6/launcher.c', 'native/g6/sandbox.c', 'toolchain.lock.json', 'native/g6/toolchain.lock.json'):
            self.g6['sources'][p] = H((self.root/p).read_bytes())
        for p in ('toolchain.lock.json', 'native/g6/toolchain.lock.json'):
            self.g7['inputs'][p] = H((self.root/p).read_bytes())
        self.binding = []
        for role in self.roles:
            name = Path(role).name; data = ('synthetic '+name).encode(); mp = ('synthetic map '+name).encode()
            self.put(role, data); self.put('maps/'+name+'.map',mp)
            self.binding.append({'path':role,'sha256':H(data),'mapSha256':H(mp)})
            if 'g6' in role: self.g6['artifacts'][name] = H(data)
            else: self.g7.update(outputSha256=H(data),mapSha256=H(mp),sourceProvenance={'ownershipSha256':H(b'synthetic g7 source'),'recipeSha256':H(b'synthetic recipe')})
        self.save()
    def put(self,p,b):
        f=self.root/p;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(b)
    def js(self,p,v): self.put(p,json.dumps(v).encode())
    def save(self):
        self.js('native/g6/build/receipt.json',self.g6);self.js('native/g7/build/receipt.json',self.g7);self.js('maps/binding.json',self.binding)
    def check(self): return M.validate_native_binding(self.root,M.select_artifact_paths(self.root),self.maps)
    def retain_case(self, label, path):
        self.put('rejections/'+label+'.json', path.read_bytes())

    def test_declared_inputs_cannot_be_shadowed(self):
        for receipt, canonical, other, rel in (
                (self.g7, 'inputs', 'sources', 'native/g7/build/receipt.json'),
                (self.g6, 'sources', 'inputs', 'native/g6/build/receipt.json')):
            original = dict(receipt)
            for reverse in (False, True):
                for variant in ('equal', 'conflicting', 'null', 'wrong-field-only'):
                    with self.subTest(role=canonical, reverse=reverse, variant=variant):
                        receipt.clear(); receipt.update(original)
                        receipt[other] = (None if variant == 'null' else
                                          {} if variant == 'conflicting' else dict(receipt[canonical]))
                        if variant == 'wrong-field-only': del receipt[canonical]
                        if reverse:
                            items = list(receipt.items())[::-1]; receipt.clear(); receipt.update(items)
                        self.save(); self.retain_case(canonical+str(reverse)+variant, self.root/rel)
                        with self.assertRaisesRegex(AssertionError, 'ambiguous native receipt inputs|native receipt inputs'):
                            self.check()
            receipt.clear(); receipt.update(original); self.save()
        # Original review reproduction, including unchanged provenance and stale recipe.
        self.g7['sources'] = dict(self.g7['inputs'])
        del self.g7['sources']['tools/build-g7-native.py']
        self.put('tools/build-g7-native.py', b'changed recipe NOT MATCHING declared inputs')
        self.save(); self.retain_case('original-shadow', self.root/'native/g7/build/receipt.json')
        with self.assertRaisesRegex(AssertionError, 'ambiguous native receipt inputs'): self.check()

    def test_duplicate_receipt_key_rejected(self):
        cases = (
            ('native/g7/build/receipt.json', 'outputSha256'),
            ('native/g7/build/receipt.json', 'native/g7/ownership.c'),
            ('native/g7/build/receipt.json', 'recipeSha256'),
            ('native/g6/build/receipt.json', 'launcher'),
            ('native/g6/build/receipt.json', 'native/g6/bridge.c'),
            ('maps/binding.json', 'sha256'),
            ('maps/binding.json', 'path'),
            ('native/g6/toolchain.lock.json', 'version'),
        )
        for index, (rel, key) in enumerate(cases):
            p = self.root/rel; original = p.read_bytes()
            for reverse in (False, True):
                with self.subTest(site=rel, key=key, reverse=reverse):
                    text = original.decode(); token = json.dumps(key)+': '
                    start = text.index(token)+len(token)
                    value, end = json.JSONDecoder().raw_decode(text[start:])
                    valid = text[start:start+end]
                    duplicate = ('"wrong", '+token+valid if not reverse else valid+', '+token+'"wrong"')
                    p.write_text(text[:start]+duplicate+text[start+end:])
                    self.retain_case('duplicate-'+str(index)+'-'+str(reverse), p)
                    with self.assertRaisesRegex(AssertionError, 'duplicate JSON key'): self.check()
                    if 'lock' in rel:
                        with self.assertRaisesRegex(AssertionError, 'duplicate JSON key'): M.observe(self.root, mapped=self.maps)
                    p.write_bytes(original)
        # Nested unknown objects must not conceal duplicates at any decode site.
        for index, rel in enumerate(('native/g7/build/receipt.json', 'native/g6/build/receipt.json',
                                     'maps/binding.json', 'native/g6/toolchain.lock.json')):
            with self.subTest(nested=rel):
                p = self.root/rel; original = p.read_bytes()
                p.write_text(original.decode().replace('{', '{"extra":{"x":1,"x":2},', 1))
                self.retain_case('nested-'+str(index), p)
                with self.assertRaisesRegex(AssertionError, 'duplicate JSON key'): self.check()
                p.write_bytes(original)

    def test_noncanonical_declared_source_rejected(self):
        for receipt, field, source, rel in (
                (self.g6, 'sources', 'native/g6/bridge.c', 'native/g6/build/receipt.json'),
                (self.g7, 'inputs', 'native/g7/ownership.c', 'native/g7/build/receipt.json')):
            variants = ('', '/'+source, '//'+source, './'+source, source+'/',
                        source.replace('/', '//', 1), source.replace('/', '/./', 1),
                        'native/../'+source, source+'\x00', '.')
            for index, alias in enumerate(variants):
                with self.subTest(field=field, alias=alias):
                    receipt[field][alias] = receipt[field][source]; self.save()
                    self.retain_case(field+'-path-'+str(index), self.root/rel)
                    with self.assertRaisesRegex(AssertionError, 'native receipt source path'): self.check()
                    del receipt[field][alias]
            # An alias never supplies mandatory exact membership.
            receipt[field][source.replace('/', '//', 1)] = receipt[field].pop(source); self.save()
            with self.assertRaisesRegex(AssertionError, 'required source membership'): self.check()
            receipt[field][source] = receipt[field].pop(source.replace('/', '//', 1)); self.save()

    def test_archive_override(self):
        archive = self.root/'.tools/g6-zig.tar.xz'
        override = self.root/'override.xz'
        archive.rename(override)
        self.assertEqual(len(M.validate_native_binding(self.root, M.select_artifact_paths(self.root), self.maps, override)[1]), 3)
    def test_valid_existing_schema(self): self.assertEqual(len(self.check()[1]),3)
    def test_no_nonexistent_header_requirement(self):
        self.assertFalse((self.root/'native/g6/sandbox.h').exists())
        self.assertNotIn('native/g6/sandbox.h', self.g6['sources'])
        self.assertEqual(len(self.check()[1]), 3)
    def test_missing_required_role_source(self):
        for receipt, field, name in (
                *((self.g6, 'sources', p) for p in (
                    'native/g6/bridge.c', 'native/g6/sandbox.c', 'native/g6/launcher.c',
                    'native/g6/toolchain.lock.json', 'toolchain.lock.json')),
                *((self.g7, 'inputs', p) for p in (
                    'native/g7/ownership.c', 'native/g6/toolchain.lock.json', 'toolchain.lock.json'))):
            value = receipt[field].pop(name); self.save()
            with self.assertRaisesRegex(AssertionError, 'required source membership'): self.check()
            receipt[field][name] = value
    def test_changed_source(self):
        self.put('native/g7/ownership.c',b'changed')
        with self.assertRaisesRegex(AssertionError,'stale native source'):self.check()
    def test_changed_recipe(self):
        self.put('tools/build-g7-native.py',b'changed')
        with self.assertRaisesRegex(AssertionError,'stale native source'):self.check()
    def test_wrong_elf(self):
        self.put(self.roles[0],b'wrong ELF token')
        with self.assertRaisesRegex(AssertionError,'output digest'):self.check()
    def test_missing_map(self):
        (self.maps/'launcher.map').rename(self.maps/'launcher.map.retained')
        with self.assertRaises(FileNotFoundError):self.check()
    def test_missing_receipt(self):
        p=self.root/'native/g7/build/receipt.json';p.rename(p.with_suffix('.retained'))
        with self.assertRaises(FileNotFoundError):self.check()
    def test_three_role_mismatch(self):
        self.binding[2]=self.binding[0];self.save()
        with self.assertRaisesRegex(AssertionError,'binding membership'):self.check()
    def test_receipt_map_mismatch(self):
        self.g7['mapSha256']='0'*64;self.save()
        with self.assertRaisesRegex(AssertionError,'receipt map'):self.check()
    def test_receipt_output_mismatch(self):
        self.g6['artifacts']['launcher']='0'*64;self.save()
        with self.assertRaisesRegex(AssertionError,'output digest'):self.check()
    def test_receipt_provenance_mismatch(self):
        self.g7['sourceProvenance']['recipeSha256']='0'*64;self.save()
        with self.assertRaisesRegex(AssertionError,'source provenance'):self.check()
    def test_observe_rejects_before_debug_import_or_archive(self):
        self.put('native/g7/ownership.c',b'changed')
        with patch.object(M.importlib.util,'spec_from_file_location') as loader, patch.object(M,'archive_members') as archive:
            with self.assertRaisesRegex(AssertionError,'stale native source'):M.observe(self.root,mapped=self.maps)
            loader.assert_not_called();archive.assert_not_called()
    def test_legacy_no_additional_receipt_fields(self):
        self.g7.pop('mapSha256');self.g7.pop('sourceProvenance');self.save();self.check()

if __name__ == '__main__': unittest.main()
