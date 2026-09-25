"""M1 path metadata only; never call observe or read native inputs."""
import importlib.util
from pathlib import Path
import sys
import unittest
sys.implementation.cache_tag = None
P = Path(__file__).absolute().parents[2]/'tools/g7-runtime-native-notices.py'
S = importlib.util.spec_from_file_location('notices_locations', P)
M = importlib.util.module_from_spec(S)
S.loader.exec_module(M)
R = Path('/fixture/project')
O = 'native/g7/build/ownership.node'
B = 'native/g6/build/bridge.node'
L = 'native/g6/build/launcher'


class Locations(unittest.TestCase):
    def test_default(self):
        self.assertEqual(M.select_artifact_paths(R),
                         {p: (R/p, R/Path(p).parent/'receipt.json') for p in (B, L, O)})

    def test_override(self):
        mapping = {O: '/fixture/exclusive'}
        before = M.select_artifact_paths(R)
        after = M.select_artifact_paths(R, mapping)
        self.assertEqual(set(after), set(before))
        self.assertEqual(after[O], (Path('/fixture/exclusive/ownership.node'),
                                    Path('/fixture/exclusive/receipt.json')))
        for p in (B, L): self.assertEqual(after[p], before[p])
        self.assertEqual(mapping, {O: '/fixture/exclusive'})
        self.assertEqual(M.select_artifact_paths(R), before)

    def test_non_single_slash_anchors(self):
        cases = [(R, '//fixture/project/new'),
                 (Path('//fixture/project'), '/fixture/project/new'),
                 (R, '//')]
        for root, destination in cases:
            with self.subTest(root=root, destination=destination):
                with self.assertRaises(AssertionError):
                    M.select_artifact_paths(root, {O: destination})
        # No override retains the original lexical default, including //.
        root = Path('//fixture/project')
        self.assertEqual(M.select_artifact_paths(root),
                         {p: (root/p, root/Path(p).parent/'receipt.json') for p in (B, L, O)})

    def test_invalid(self):
        bad = [{}, [], {B: '/fixture/new'}, {'unknown': '/fixture/new'},
               {O: '/fixture/new', L: '/fixture/new'}]
        bad += [{O: x} for x in (None, {}, [], 1, '', 'relative', '/',
                 '/fixture/../new', '/fixture//new', '/fixture/new/',
                 '/fixture/./new', '/fixture/project', '/fixture/project/new', '\x00')]
        for mapping in bad:
            with self.subTest(mapping=mapping), self.assertRaises(AssertionError):
                M.select_artifact_paths(R, mapping)


if __name__ == '__main__': unittest.main()
