"""Synthetic-only ordinary consumer regressions; no real-input suite imports.

Future execution compiles WHOLE ordinary modules at optimize=0/1/2 (the
assert-removal modes of normal Python/-O/-OO), then isolates external boundaries.
No native/helper loading, archive creation, binary generation or payload reads.
This does not qualify archive/ELF parsing, authenticity, or runtime admission.
"""
from contextlib import ExitStack
from pathlib import Path
from types import ModuleType, SimpleNamespace
import sys
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
NAMES = ('g7-runtime-binary-inputs.py', 'g7-runtime-node-source.py')


def load_whole(name, optimize, main=False):
    source = ROOT/'tools'/name
    module = ModuleType('__main__' if main else 'synthetic_consumer')
    module.__file__ = str(source)
    # No extraction, AST rewriting or replacement of consumer functions.
    exec(compile(source.read_text(), str(source), 'exec', optimize=optimize), module.__dict__)
    return module


class SyntheticValidation(unittest.TestCase):
    def rejected(self, call):
        with self.assertRaises(AssertionError) as caught:
            call()
        self.assertEqual(caught.exception.args, ())

    def test_member_checks_and_success_in_all_modes(self):
        for mode in (0, 1, 2):
            m = load_whole(NAMES[0], mode)
            for case in ('type', 'size', 'stream', 'length', 'valid'):
                with self.subTest(mode=mode, case=case):
                    member = SimpleNamespace(isfile=Mock(return_value=case != 'type'),
                                             size=268435457 if case == 'size' else 1)
                    stream = Mock()
                    stream.read.return_value = b'' if case == 'length' else b'x'
                    archive = Mock()
                    archive.getmember.return_value = member
                    archive.extractfile.return_value = None if case == 'stream' else stream
                    call = lambda: m.member_bytes(archive, 'synthetic')
                    if case == 'valid':
                        self.assertEqual(call(), b'x')
                    else:
                        self.rejected(call)
                    archive.getmember.assert_called_once_with('synthetic')
                    if case in ('type', 'size'):
                        archive.extractfile.assert_not_called()
                        stream.read.assert_not_called()
                    elif case == 'stream':
                        stream.read.assert_not_called()
                    else:
                        stream.read.assert_called_once_with()

    def test_elf_short_circuit_and_section_bound_in_all_modes(self):
        for mode in (0, 1, 2):
            m = load_whole(NAMES[0], mode)
            with self.subTest(mode=mode), patch.object(m.struct, 'unpack_from') as unpack:
                # An invalid marker must reject before attempting header reads.
                self.rejected(lambda: m.elf(b'not ELF'))
                unpack.assert_not_called()
                # Boundary double, not constructed ELF bytes.
                unpack.side_effect = [(0,), (63, 0)]
                symbols = Mock()
                self.rejected(lambda: m.fdlibm_symbols(b'', symbols))
                symbols.decode.assert_not_called()
                self.assertEqual(unpack.call_count, 2)

    def test_binary_identity_checks_before_helper_loading(self):
        for mode in (0, 1, 2):
            for case in ('archive', 'installed', 'version'):
                with self.subTest(mode=mode, case=case):
                    m = load_whole(NAMES[0], mode)
                    root = Mock()
                    path = root.__truediv__ = Mock()
                    lock_path, archive, installed = Mock(), Mock(), Mock()
                    path.side_effect = [lock_path, archive, installed, installed]
                    archive.read_bytes.return_value = b'archive-token'
                    installed.read_bytes.return_value = b'other' if case == 'installed' else b'node-token'
                    tar = Mock()
                    tar.__enter__ = Mock(return_value=tar)
                    tar.__exit__ = Mock(return_value=False)
                    with ExitStack() as stack:
                        stack.enter_context(patch.object(m, 'Path', return_value=root))
                        stack.enter_context(patch.object(m.json, 'loads', side_effect=[
                            {'node': {'version': 'v1', 'sha256': 'pin'}}, {'node': '2'}]))
                        stack.enter_context(patch.object(m, 'sha', return_value='wrong' if case == 'archive' else 'pin'))
                        opened = stack.enter_context(patch.object(m.tarfile, 'open', return_value=tar))
                        stack.enter_context(patch.object(m, 'member_bytes', side_effect=[b'node-token', b'license-token']))
                        child = stack.enter_context(patch.object(m.subprocess, 'check_output'))
                        helper = stack.enter_context(patch.object(m.importlib.util, 'spec_from_file_location'))
                        self.rejected(lambda: m.observe('synthetic-root'))
                        helper.assert_not_called()
                        if case == 'archive':
                            opened.assert_not_called()
                            installed.read_bytes.assert_not_called()
                        if case != 'version':
                            child.assert_not_called()
                        else:
                            child.assert_called_once()

    def test_source_identity_size_and_member_checks(self):
        for mode in (0, 1, 2):
            for case in ('metadata', 'binary', 'size', 'archive', 'member_type', 'member_size', 'stream', 'length'):
                with self.subTest(mode=mode, case=case):
                    m = load_whole(NAMES[1], mode)
                    root, directory = Mock(), Mock()
                    lock_path, receipt_path, sums_path, archive = Mock(), Mock(), Mock(), Mock()
                    root.__truediv__ = Mock(return_value=lock_path)
                    directory.__truediv__ = Mock(side_effect=[receipt_path, sums_path, archive])
                    archive.name = 'node-v1.tar.xz'
                    archive.stat.return_value.st_size = 2 if case == 'size' else 1
                    archive.read_bytes.return_value = b'archive-token'
                    sums_path.read_bytes.return_value = b'bin-pin node-v1-linux-x64.tar.xz\nsrc-pin node-v1.tar.xz\n'
                    receipt = {'metadata': {'sha256': 'meta-pin'},
                               'binaryArchiveSha256': 'wrong' if case == 'binary' else 'bin-pin',
                               'source': {'bytes': 1, 'sha256': 'src-pin'}}
                    member = SimpleNamespace(isfile=Mock(return_value=case != 'member_type'),
                                             size=16777217 if case == 'member_size' else 1)
                    stream = Mock()
                    stream.read.return_value = b''
                    tar = Mock()
                    tar.__enter__ = Mock(return_value=tar)
                    tar.__exit__ = Mock(return_value=False)
                    tar.getmember.return_value = member
                    tar.extractfile.return_value = None if case == 'stream' else stream
                    with ExitStack() as stack:
                        stack.enter_context(patch.object(m, 'Path', side_effect=[root, directory]))
                        stack.enter_context(patch.object(m.json, 'loads', side_effect=[
                            {'node': {'version': 'v1', 'sha256': 'bin-pin'}}, receipt]))
                        stack.enter_context(patch.object(m, 'sha', side_effect=[
                            'wrong' if case == 'metadata' else 'meta-pin',
                            'wrong' if case == 'archive' else 'src-pin']))
                        decompress = stack.enter_context(patch.object(m.lzma, 'decompress', return_value=b''))
                        opened = stack.enter_context(patch.object(m.tarfile, 'open', return_value=tar))
                        self.rejected(lambda: m.observe('synthetic-root', 'synthetic-source'))
                        if case in ('metadata', 'binary', 'size', 'archive'):
                            decompress.assert_not_called()
                            opened.assert_not_called()
                        else:
                            tar.getmember.assert_called_once_with('node-v1/deps/sqlite/sqlite3.h')
                            if case in ('member_type', 'member_size'):
                                tar.extractfile.assert_not_called()
                                stream.read.assert_not_called()
                            elif case == 'stream':
                                stream.read.assert_not_called()
                            else:
                                stream.read.assert_called_once_with()
                        if case in ('metadata', 'binary', 'size'):
                            archive.read_bytes.assert_not_called()

    def test_cli_arity_rejects_before_observation_in_all_modes(self):
        for mode in (0, 1, 2):
            for name in NAMES:
                with self.subTest(mode=mode, name=name), patch.object(sys, 'argv', [name]):
                    self.rejected(lambda: load_whole(name, mode, main=True))


if __name__ == '__main__':
    unittest.main()
