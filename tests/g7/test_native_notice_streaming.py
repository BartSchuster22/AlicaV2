"""Synthetic archive regressions; NOT the five-case real native QA suite."""
import hashlib
import importlib.util
import io
import lzma
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

P = Path(__file__).resolve().parents[2]/'tools/g7-runtime-native-notices.py'
S = importlib.util.spec_from_file_location('notices_stream', P)
M = importlib.util.module_from_spec(S)
S.loader.exec_module(M)


def packed(entries):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode='w', format=tarfile.GNU_FORMAT) as t:
        for name, data, kind in entries:
            info = tarfile.TarInfo(name)
            info.type = kind
            info.size = len(data)
            t.addfile(info, io.BytesIO(data))
    return lzma.compress(out.getvalue(), preset=0)


class Streaming(unittest.TestCase):
    def run_archive(self, b, names={'needed'}, digest=None):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/'archive.xz'
            p.write_bytes(b)
            return M.archive_members(p, digest or hashlib.sha256(b).hexdigest(), names)

    def test_exact_and_ignore_unneeded(self):
        b = packed([('ignored', b'x'*100000, tarfile.REGTYPE),
                    ('needed', b'inline notice', tarfile.REGTYPE)])
        self.assertEqual(self.run_archive(b), {'needed': b'inline notice'})

    def test_duplicate_last_wins_like_original(self):
        b = packed([('needed', b'first', tarfile.REGTYPE),
                    ('needed', b'last', tarfile.REGTYPE)])
        self.assertEqual(self.run_archive(b), {'needed': b'last'})

    def test_last_duplicate_invalid_denied(self):
        b = packed([('needed', b'first', tarfile.REGTYPE),
                    ('needed', b'', tarfile.DIRTYPE)])
        with self.assertRaisesRegex(AssertionError, 'type/size'):
            self.run_archive(b)

    def test_earlier_invalid_duplicate_not_selected(self):
        b = packed([('needed', b'', tarfile.DIRTYPE),
                    ('needed', b'last', tarfile.REGTYPE)])
        self.assertEqual(self.run_archive(b), {'needed': b'last'})

    def test_missing_denied(self):
        with self.assertRaisesRegex(KeyError, 'not found'):
            self.run_archive(packed([('other', b'', tarfile.REGTYPE)]))

    def test_oversized_denied(self):
        with self.assertRaisesRegex(AssertionError, 'type/size'):
            self.run_archive(packed([('needed', b'x'*(M.MAX_MEMBER_BYTES+1), tarfile.REGTYPE)]))

    def test_digest_denied(self):
        with self.assertRaisesRegex(AssertionError, 'digest'):
            self.run_archive(packed([('needed', b'x', tarfile.REGTYPE)]), digest='0'*64)

    def test_truncated_and_malformed_denied(self):
        b = packed([('needed', b'x', tarfile.REGTYPE)])
        for bad in (b[:-8], b'not xz', lzma.compress(b'not tar', preset=0)):
            with self.subTest(size=len(bad)), self.assertRaises((AssertionError, lzma.LZMAError, tarfile.TarError)):
                self.run_archive(bad)

    def test_full_stream_verified_after_tar_end(self):
        b = packed([('needed', b'x', tarfile.REGTYPE)])
        bad = bytearray(b)
        bad[-16] ^= 1
        with self.assertRaises((AssertionError, lzma.LZMAError)):
            self.run_archive(bytes(bad))

    def test_metadata_bound_before_longname_allocation(self):
        b = packed([('x'*(M.MAX_TAR_EXTENSION+1), b'', tarfile.REGTYPE)])
        with self.assertRaisesRegex(AssertionError, 'extension bound'):
            self.run_archive(b)

    def test_total_metadata_bound(self):
        b = packed([('x'*3000+str(i), b'', tarfile.REGTYPE) for i in range(23)])
        with self.assertRaisesRegex(AssertionError, 'cumulative extension'):
            self.run_archive(b)

    def test_expansion_and_count_bounds(self):
        b = packed([('needed', b'x', tarfile.REGTYPE)])
        with patch.object(M, 'MAX_TAR_BYTES', 512), self.assertRaisesRegex(AssertionError, 'expansion'):
            self.run_archive(b)
        with patch.object(M, 'MAX_TAR_HEADERS', 0), self.assertRaisesRegex(AssertionError, 'header count'):
            self.run_archive(b)

    def test_selected_total_bound(self):
        b = packed([('needed', b'12345', tarfile.REGTYPE)])
        with patch.object(M, 'MAX_SELECTED_BYTES', 4), self.assertRaisesRegex(AssertionError, 'selected archive bytes'):
            self.run_archive(b)

    def test_no_retained_tar_index(self):
        b = packed([('ignored'+str(i), b'', tarfile.REGTYPE) for i in range(200)] +
                   [('needed', b'notice', tarfile.REGTYPE)])
        original = tarfile.TarFile.next
        lengths = []
        def checked(t):
            lengths.append(len(t.members))
            return original(t)
        with patch.object(tarfile.TarFile, 'next', checked):
            self.assertEqual(self.run_archive(b)['needed'], b'notice')
        self.assertLessEqual(max(lengths), 1)

    def test_symlink_denied(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/'link'
            p.symlink_to('/dev/null')
            with self.assertRaises(OSError):
                M.archive_members(p, '0'*64, {'needed'})


if __name__ == '__main__':
    unittest.main()
