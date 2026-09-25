"""Actual pinned source-archive tests. Not pinned-binary qualification."""
import base64
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
R=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('node_source',R/'tools/g7-runtime-node-source.py')
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
D=R/'evidence/g7/runtime-assembly/node-source-inputs'


class SourceNotices(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result=m.observe(R,D)

    def test_actual_sqlite_notice(self):
        result=self.result
        self.assertEqual(result['sqlite']['version'],'3.53.4')
        b=base64.b64decode(result['files'][result['sqlite']['licenses'][0]])
        self.assertIn(b'The author disclaims copyright',b)
        self.assertIn(b'header file defines the interface',b)
        self.assertTrue(all(e['sha256'] and e['bytes']>0 for e in result['sourceMembers']))

    def test_nested_notice_superset(self):
        r=self.result
        for suffix in ['deps/v8/LICENSE.fdlibm','deps/v8/third_party/rapidhash-v8/LICENSE','deps/v8/third_party/utf8-decoder/LICENSE']:
            n=next(n for n in r['upstreamNoticeSuperset'] if n['sourceMember'].endswith('/'+suffix))
            b=base64.b64decode(r['files'][n['output']])
            self.assertEqual(m.sha(b),n['sha256'])
            self.assertIn('unestablished',n['basis'])
        self.assertIn(b'Developed at SunSoft',base64.b64decode(r['files'][r['fdlibm']['licenses'][0]]))
        for p in r['files']:
            staged='releases/'+'0'*64+'/'+p
            self.assertLessEqual(len(staged),240)
            self.assertLessEqual(len(staged.split('/')),16)

    def test_deterministic_actual_source(self):
        self.assertEqual(self.result,m.observe(R,D))

    def test_changed_checksums_denied(self):
        with tempfile.TemporaryDirectory() as name:
            p=Path(name)
            (p/'receipt.json').write_bytes((D/'receipt.json').read_bytes())
            (p/'SHASUMS256.txt').write_bytes((D/'SHASUMS256.txt').read_bytes()+b' ')
            with self.assertRaises(AssertionError):m.observe(R,p)

    def test_changed_binary_link_denied(self):
        with tempfile.TemporaryDirectory() as name:
            p=Path(name)
            receipt=json.loads((D/'receipt.json').read_bytes())
            receipt['binaryArchiveSha256']='0'*64
            (p/'receipt.json').write_text(json.dumps(receipt))
            (p/'SHASUMS256.txt').write_bytes((D/'SHASUMS256.txt').read_bytes())
            with self.assertRaises(AssertionError):m.observe(R,p)


if __name__=='__main__':unittest.main()
