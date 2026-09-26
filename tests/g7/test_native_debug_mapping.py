"""Synthetic structural path tests; no native/build provenance claim."""
import unittest
from test_runtime_native_debug import load_parser, synthetic_elf, unit, entry, ext, END

class ExactMapping(unittest.TestCase):
    def setUp(self):
        self.m = load_parser()
        self.root = '/run/verified'
        self.mapping = {self.root+'/native/g7/ownership.c':'native/g7/ownership.c'}
    def parse(self, name=b'native/g7/ownership.c', directory=1, dirs=b'/run/verified\0\0', program=END, mapping=None):
        return self.m.source_paths(synthetic_elf(unit(program, files=entry(name,directory), directories=dirs)), path_map=self.mapping if mapping is None else mapping)
    def test_actual_r6_format(self):
        self.assertEqual(self.parse()['paths'], ['native/g7/ownership.c'])
    def test_absolute_ignores_directory_but_not_index(self):
        self.assertEqual(self.parse(b'/run/verified/native/g7/ownership.c',dirs=b'/untrusted\0\0')['paths'], ['native/g7/ownership.c'])
        with self.assertRaisesRegex(ValueError,'directory index'): self.parse(b'/run/verified/native/g7/ownership.c',directory=2)
    def test_basename_directory_semantics(self):
        self.assertEqual(self.parse(b'ownership.c', dirs=b'/run/verified/native/g7\0\0')['paths'],['native/g7/ownership.c'])
    def test_wrong_untrusted_traversal_and_noncanonical(self):
        for name in (b'native/g7/wrong.c', b'/untrusted/native/g7/ownership.c', b'../native/g7/ownership.c', b'native//g7/ownership.c', b'native/./g7/ownership.c', b'\xff', b'//run/verified/native/g7/ownership.c'):
            with self.subTest(name=name), self.assertRaises((ValueError,UnicodeError)): self.parse(name)
        for dirs in (b'/run/untrusted\0\0',b'/run/verified/../verified\0\0',b'/run//verified\0\0'):
            with self.assertRaises(ValueError): self.parse(dirs=dirs)
    def test_dynamic_and_index_checks(self):
        r=self.parse(program=ext(3,entry(b'/run/verified/native/g7/ownership.c',0))+b'\4\2'+END)
        self.assertEqual(len(r['units'][0]['files']),2)
        for p in (b'\4\3'+END,ext(3,b'bad\0\1'),ext(3,entry(b'/untrusted/x',0))+END):
            with self.assertRaises(ValueError):self.parse(program=p)
    def test_mapping_collisions_and_spelling(self):
        for m in ({**self.mapping,'/other/x':'native/g7/ownership.c'}, {'/run/verified/../x':'x'}, {'/run/verified/x':'../x'}):
            with self.assertRaises(ValueError):self.parse(mapping=m)
    def test_default_still_rejects_multicomponent(self):
        with self.assertRaisesRegex(ValueError,'file name'):
            self.m.source_paths(synthetic_elf(unit(files=entry(b'native/g7/ownership.c'))))

if __name__ == '__main__': unittest.main()
