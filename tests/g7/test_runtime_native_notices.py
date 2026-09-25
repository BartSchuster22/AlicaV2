"""Real cached input tests. No fabricated compiler/source responses."""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
R=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('notices',R/'tools/g7-runtime-native-notices.py')
assert spec is not None and spec.loader is not None
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Pinned member-name/content set from the actual old/current ELF + archive audit:
# g7-native-source-delta-bpzj52dc, public manifest a88cd87ab2d3e4dba9e18ff6e8fd537251cc9eaeff8318342eed980e22a9628f.
# Includes containment's eventfd/pthread/signal headers; not a count or legal approval.
EXPECTED_COMPILER_SET_SHA256='1caca5e2da1de9c2ceba2e8d3aa1eb6ab397777c2c9d286479a1ac526c6a50a6'
def compiler_set_hash(compiler):
    members=sorted((s['sourceMember'],s['sha256']) for s in compiler)
    return hashlib.sha256(json.dumps(members,separators=(',',':')).encode()).hexdigest()

class NativeNotices(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result=m.observe(R)

    def test_actual_source_coverage(self):
        r=self.result
        self.assertEqual(len(r['artifacts']),3)
        compiler=[s for s in r['sources'].values() if 'sourceMember' in s and not s['sourceMember'].endswith('/LICENSES')]
        self.assertEqual(compiler_set_hash(compiler),EXPECTED_COMPILER_SET_SHA256)
        for s in compiler:
            b=base64.b64decode(r['files'][s['licenses'][0]])
            self.assertEqual(m.sha(b),s['sha256'])
        init=next(s for s in compiler if s['sourceMember'].endswith('/csu/init.c'))
        self.assertFalse(init['explicitLinkException'])
        fstat=next(s for s in compiler if s['sourceMember'].endswith('/io/fstat-2.32.c'))
        self.assertTrue(fstat['explicitLinkException'])

    def test_expected_set_rejects_missing_added_or_substituted_member(self):
        compiler=[dict(s) for s in self.result['sources'].values() if 'sourceMember' in s and not s['sourceMember'].endswith('/LICENSES')]
        self.assertEqual(compiler_set_hash(compiler),EXPECTED_COMPILER_SET_SHA256)
        self.assertNotEqual(compiler_set_hash(compiler[1:]),EXPECTED_COMPILER_SET_SHA256)
        self.assertNotEqual(compiler_set_hash(compiler+[compiler[0]]),EXPECTED_COMPILER_SET_SHA256)
        compiler[0]['sha256']='0'*64
        self.assertNotEqual(compiler_set_hash(compiler),EXPECTED_COMPILER_SET_SHA256)

    def test_staging_limits(self):
        for p in self.result['files']:
            p='releases/'+'0'*64+'/'+p
            self.assertLessEqual(len(p),240)
            self.assertLessEqual(len(p.split('/')),16)

    def test_changed_binding_denied(self):
        d=R/'evidence/g7/runtime-assembly/native-attribution-inputs'
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            entries=json.loads((d/'binding.json').read_bytes())
            entries[0]['sha256']='0'*64
            (p/'binding.json').write_text(json.dumps(entries))
            with self.assertRaises(AssertionError):m.observe(R,mapped=p)

    def test_changed_map_denied(self):
        d=R/'evidence/g7/runtime-assembly/native-attribution-inputs'
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            (p/'binding.json').write_bytes((d/'binding.json').read_bytes())
            (p/'bridge.node.map').write_bytes(b'changed map')
            with self.assertRaises(AssertionError):m.observe(R,mapped=p)

if __name__=='__main__':unittest.main()
