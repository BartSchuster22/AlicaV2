"""SYNTHETIC pure-parser tests; NOT native/compiler/provenance qualification.

Authoring only: execution requires separate authority. All ELF-shaped bytes are
constructed in memory, never presented as production fixtures. No cache inputs.
"""
import importlib.util
from pathlib import Path
import struct
import unittest
from unittest.mock import patch


def load_parser():
    path = Path(__file__).resolve().parents[2] / 'tools/g7-runtime-native-debug.py'
    spec = importlib.util.spec_from_file_location('synthetic_native_debug', path)
    if spec is None or spec.loader is None:
        raise RuntimeError('parser loader unavailable')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def uleb(value):
    out = bytearray()
    while True:
        byte = value & 127
        value >>= 7
        out.append(byte | (128 if value else 0))
        if not value:
            return bytes(out)


def entry(name=b'a.c', directory=1, metadata=b'\0\0'):
    return name + b'\0' + uleb(directory) + metadata


def ext(opcode, payload=b''):
    return b'\0' + uleb(len(payload) + 1) + bytes([opcode]) + payload


END = ext(1)
LENGTHS = bytes((0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 1))


def unit(program=END, files=None, directories=b'src\0\0', lengths=LENGTHS):
    if files is None:
        files = entry()
    header = bytes((1, 1, 1, 251, 14, 13)) + lengths + directories + files + b'\0'
    body = struct.pack('<HI', 4, len(header)) + header + program
    return struct.pack('<I', len(body)) + body


def synthetic_elf(debug):
    names = b'\0.shstrtab\0.debug_line\0'
    data = bytearray(64)
    data[:6] = b'\x7fELF\x02\x01'
    names_offset = len(data)
    data.extend(names)
    debug_offset = len(data)
    data.extend(debug)
    table = len(data)
    struct.pack_into('<Q', data, 40, table)
    struct.pack_into('<HHH', data, 58, 64, 3, 1)
    data.extend(bytes(64))
    data.extend(struct.pack('<IIQQQQIIQQ', 1, 3, 0, 0, names_offset, len(names), 0, 0, 1, 0))
    data.extend(struct.pack('<IIQQQQIIQQ', 11, 1, 0, 0, debug_offset, len(debug), 0, 0, 1, 0))
    return bytes(data)


class SyntheticParser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = load_parser()

    def parse(self, debug):
        return self.m.source_paths(synthetic_elf(debug))

    def reject(self, debug):
        with self.assertRaises(ValueError):
            self.parse(debug)

    def test_static_dynamic_and_duplicate_indices(self):
        program = ext(3, entry(b'b.c')) + ext(3, entry()) + b'\4\3\1' + END
        result = self.parse(unit(program))
        self.assertEqual(result['paths'], ['src/a.c', 'src/b.c'])
        self.assertEqual(result['units'][0]['files'], ['src/a.c', 'src/b.c', 'src/a.c'])
        self.assertEqual(len(self.parse(unit() + unit())['units']), 2)

    def test_dynamic_paths_and_directory_indices(self):
        for name in (b'', b'..', b'.', b'a/b', b'\xff'):
            with self.subTest(name=name):
                self.reject(unit(ext(3, entry(name)) + END))
        self.reject(unit(ext(3, entry(directory=2)) + END))
        self.reject(unit(directories=b'../src\0\0'))
        self.assertEqual(self.parse(unit(files=entry(directory=0)))['paths'], ['a.c'])

    def test_file_selection_and_termination(self):
        for program in (b'\4\0' + END, b'\4\2' + END,
                        b'\4\2' + ext(3, entry(b'b.c')) + END,
                        b'\1', ext(3, entry(b'b.c')), END + b'\1'):
            with self.subTest(program=program):
                self.reject(unit(program))
        # Empty program does not manufacture a default file/row; header required.
        self.assertEqual(self.parse(unit(b''))['paths'], ['src/a.c'])
        self.reject(unit(files=b''))
        self.reject(unit(ext(3, entry(b'b.c')) + b'\4\2' + END + b'\4\3' + END))
        self.parse(unit(ext(3, entry(b'b.c')) + b'\4\2' + END + b'\1' + END))

    def test_payload_and_unit_boundaries(self):
        for program in (b'\0\0', b'\0\x80', b'\0\2\1', ext(1, b'x'),
                        ext(2, bytes(7)), ext(2, bytes(9)), ext(4), ext(4, b'\0\0'),
                        ext(3, b'x\0\1\0'), ext(3, entry() + b'x'), b'\2\x80', b'\11\0'):
            with self.subTest(program=program):
                self.reject(unit(program))
        valid = unit()
        self.reject(valid[:-1])
        self.reject(valid + b'\0')
        # A continuation cannot borrow bytes from the next unit.
        self.reject(unit(b'\2\x80') + unit())

    def test_declared_counts_and_unknown_extensions(self):
        for index in range(12):
            counts = bytearray(LENGTHS)
            counts[index] += 1
            self.reject(unit(lengths=bytes(counts)))
        for opcode in (0, 5, 127, 255):
            self.reject(unit(ext(opcode) + END))
        # Every supported standard operand kind and known extension.
        self.parse(unit(ext(2, bytes(8)) + ext(4, b'\0') +
                        b'\1\2\0\3\x7f\4\1\5\0\6\7\10\11\0\0\12\13\14\0\15' + END))

    def test_64_bit_leb_boundaries_and_overflow(self):
        unsigned = ((b'\0', 0), (b'\xff' * 9 + b'\1', (1 << 64) - 1))
        signed = ((b'\x7f', -1), (b'\xff' * 9 + b'\0', (1 << 63) - 1),
                  (b'\x80' * 9 + b'\x7f', -(1 << 63)))
        for is_signed, examples in ((False, unsigned), (True, signed)):
            for encoded, expected in examples:
                reader = self.m.Reader(encoded, 0, len(encoded))
                self.assertEqual(reader.leb(is_signed), expected)
                self.assertEqual(reader.pos, len(encoded))
        bad_unsigned = (b'\xff' * 9 + b'\2', b'\x80' * 10 + b'\0')
        bad_signed = (b'\x80' * 9 + b'\1', b'\xff' * 9 + b'\x7e', b'\x80' * 10)
        for encoded in bad_unsigned:
            self.reject(unit(files=entry(metadata=encoded + b'\0')))
            self.reject(unit(ext(3, entry(metadata=encoded + b'\0')) + END))
            self.reject(unit(b'\2' + encoded + END))
            self.reject(unit(ext(4, encoded) + END))
        for encoded in bad_signed:
            self.reject(unit(b'\3' + encoded + END))
        for encoded, _ in unsigned:
            self.parse(unit(files=entry(metadata=encoded + b'\0')))
            self.parse(unit(b'\2' + encoded + END))
        for encoded, _ in signed:
            self.parse(unit(b'\3' + encoded + END))

    def test_emission_edges_charge_duplicates_and_units(self):
        # 'src/a.c' = 7 encoded bytes; twice per definition even when duplicate.
        with patch.object(self.m, 'MAX_EMITTED_PATH_BYTES', 14):
            self.parse(unit())
            self.reject(unit(ext(3, entry()) + END))
            self.reject(unit() + unit())
        with patch.object(self.m, 'MAX_EMITTED_PATH_BYTES', 28):
            self.parse(unit(ext(3, entry()) + END))
            self.parse(unit() + unit())
        with patch.object(self.m, 'MAX_EMITTED_PATH_BYTES', 13):
            self.reject(unit())
        with patch.object(self.m, 'MAX_PATH_BYTES', 6):
            self.reject(unit())

    def test_utf8_budgets_are_bytes_and_profiles_fail_closed(self):
        debug = unit(files=entry('é.c'.encode()))  # four bytes, not three
        with patch.object(self.m, 'MAX_NAME_BYTES', 3):
            self.reject(debug)
        with patch.object(self.m, 'MAX_NAME_BYTES', 4):
            self.parse(debug)
        with patch.object(self.m, 'MAX_EMITTED_PATH_BYTES', 15):
            self.reject(debug)
        with patch.object(self.m, 'MAX_EMITTED_PATH_BYTES', 16):
            self.parse(debug)
        for base in (0, 12, 14):
            changed = bytearray(unit())
            changed[15] = base
            self.reject(bytes(changed))
        for version in (3, 5):
            changed = bytearray(unit())
            struct.pack_into('<H', changed, 4, version)
            self.reject(bytes(changed))

    def test_count_name_and_scan_edges(self):
        with patch.object(self.m, 'MAX_FILES', 1):
            self.parse(unit())
            self.reject(unit(ext(3, entry()) + END))
            self.reject(unit() + unit())
        with patch.object(self.m, 'MAX_DIRECTORIES', 1):
            self.parse(unit())
            self.reject(unit() + unit())
        with patch.object(self.m, 'MAX_UNITS', 1):
            self.parse(unit())
            self.reject(unit() + unit())
        with patch.object(self.m, 'MAX_NAME_BYTES', 3):
            self.parse(unit())
            self.reject(unit(files=entry(b'ab.c')))
        with patch.object(self.m, 'MAX_NAME_TOTAL', 6):
            self.parse(unit())
            self.reject(unit(ext(3, entry()) + END))
        debug = unit()
        for constant, exact in (('MAX_DEBUG_BYTES', len(debug)),
                                ('MAX_ELF_BYTES', len(synthetic_elf(debug))),
                                ('MAX_HEADER_BYTES', len(debug) - 10 - len(END))):
            with patch.object(self.m, constant, exact):
                self.parse(debug)
            with patch.object(self.m, constant, exact - 1):
                self.reject(debug)


if __name__ == '__main__':
    unittest.main()
