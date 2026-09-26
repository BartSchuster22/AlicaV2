"""Bounded offline ELF64/DWARF32-v4 file-table attribution, not provenance proof.

Includes DW_LNE_define_file. Does not validate the address/line state machine,
resolve compilation directories, prove instruction provenance or preprocessor
closure. Unknown encodings fail closed. Limits below are parser-local policy,
NOT runtime admission, resource-cap increases, or a measured memory budget.
"""
import hashlib
import struct

# Bound input/hash/copy and all scans, including section-name lookups.
MAX_ELF_BYTES = 128 * 1024 * 1024
MAX_DEBUG_BYTES = 16 * 1024 * 1024
MAX_SECTION_NAMES = 1024 * 1024
MAX_SECTION_NAME = 255
MAX_UNITS = 4096
MAX_HEADER_BYTES = 1024 * 1024
MAX_NAME_BYTES = 4096
MAX_PATH_BYTES = 8193
MAX_DIRECTORIES = 16384                 # total explicit directories, all units
MAX_FILES = 65536                       # total definitions, including duplicates
MAX_NAME_TOTAL = 8 * 1024 * 1024         # encoded names, directories + files
MAX_EMITTED_PATH_BYTES = 16 * 1024 * 1024
# Each definition is charged TWICE before expansion: per-unit + global output,
# even if the global set deduplicates it. Sorting adds references, not strings.
STANDARD_LENGTHS = (0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 1)


def need(value, message):
    if not value:
        raise ValueError(message)


class Reader:
    """Every operand is confined to its header, unit, or extension payload."""
    def __init__(self, data, start, end):
        need(0 <= start <= end <= len(data), 'reader bounds')
        self.data, self.pos, self.end = data, start, end

    def take(self, count):
        need(0 <= count <= self.end - self.pos, 'truncated operand')
        start = self.pos
        self.pos += count
        return self.data[start:self.pos]

    def byte(self):
        return self.take(1)[0]

    def leb(self, signed=False):
        result = 0
        for i in range(10):
            b = self.byte()
            payload = b & 127
            if i == 9:
                need(not b & 128 and payload in ((0, 127) if signed else (0, 1)),
                     '64-bit LEB overflow')
            result |= payload << (7 * i)
            if not b & 128:
                if signed and b & 64:
                    result -= 1 << (7 * (i + 1))
                return result
        raise ValueError('64-bit LEB overflow')

    def text(self, remaining):
        need(remaining >= 0, 'cumulative name limit')
        end = self.data.find(b'\0', self.pos,
                             min(self.end, self.pos + min(MAX_NAME_BYTES, remaining) + 1))
        need(end >= self.pos, 'unterminated or oversized name')
        raw = self.take(end - self.pos)
        self.take(1)
        return raw.decode('utf-8', 'strict'), len(raw)


def source_paths(data, *, path_map=None):
    """Optional exact absolute-to-relative mapping supplied by a trusted caller.

    No root guessing, basename stripping, or normalization of ambiguous spellings.
    Default historical parser behavior is unchanged.
    """
    if path_map is not None:
        need(type(path_map) is dict and len(path_map) <= MAX_FILES, 'path mapping')
        for absolute, relative in path_map.items():
            need(type(absolute) is str and type(relative) is str and
                 absolute.startswith('/') and not relative.startswith('/') and
                 all(x not in ('', '.', '..') for x in absolute[1:].split('/')) and
                 all(x not in ('', '.', '..') for x in relative.split('/')) and
                 len(absolute.encode()) <= MAX_PATH_BYTES and
                 len(relative.encode()) <= MAX_PATH_BYTES, 'path mapping spelling')
        need(len(set(path_map.values())) == len(path_map), 'path mapping collision')
    need(64 <= len(data) <= MAX_ELF_BYTES, 'ELF size limit')
    need(data[:6] == b'\x7fELF\x02\x01', 'ELF64 little endian required')
    start = struct.unpack_from('<Q', data, 40)[0]
    size, count, names_index = struct.unpack_from('<HHH', data, 58)
    need(size == 64 and 0 < count < 4096 and 0 < names_index < count, 'section table')
    need(start + size * count <= len(data), 'section bounds')
    sections = [struct.unpack_from('<IIQQQQIIQQ', data, start + size*i) for i in range(count)]

    def section(index, limit):
        s = sections[index]
        need(s[5] <= limit and s[4] + s[5] <= len(data), 'section data bounds/limit')
        return data[s[4]:s[4]+s[5]]

    need(sections[names_index][1] == 3, 'section names must be STRTAB')
    names = section(names_index, MAX_SECTION_NAMES)
    selected = []
    for i, s in enumerate(sections):
        need(s[0] < len(names), 'section name bounds')
        end = names.find(b'\0', s[0], min(len(names), s[0] + MAX_SECTION_NAME + 1))
        need(end >= 0, 'section name termination/limit')
        if names[s[0]:end] == b'.debug_line':
            need(s[1] == 1 and not s[2] & 0x800, 'uncompressed PROGBITS required')
            selected.append(i)
    need(len(selected) == 1, 'one uncompressed debug_line required')
    debug = section(selected[0], MAX_DEBUG_BYTES)
    pos, paths, units = 0, set(), []
    directory_count = file_count = name_total = emitted = 0

    def name(reader):
        nonlocal name_total
        value, size = reader.text(MAX_NAME_TOTAL - name_total)
        need(name_total + size <= MAX_NAME_TOTAL, 'cumulative name limit')
        name_total += size
        return value, size

    while pos < len(debug):
        need(len(units) < MAX_UNITS, 'unit count limit')
        begin = pos
        need(pos+10 <= len(debug), 'short DWARF unit')
        length, version, header_length = struct.unpack_from('<IHI', debug, pos)
        need(length < 0xfffffff0 and version == 4, 'DWARF32 v4 required')
        end, header_end = begin+4+length, begin+10+header_length
        need(header_length <= MAX_HEADER_BYTES and begin+16 <= header_end <= end <= len(debug),
             'DWARF bounds/header limit')
        header = Reader(debug, begin+10, header_end)
        minimum, max_ops, default, line_base, line_range, opcode_base = struct.unpack('<BBBbBB', header.take(6))
        need(minimum > 0 and max_ops > 0 and line_range > 0 and default in (0, 1), 'line encoding')
        # DWARF4 standard opcodes 1..12 only; no guessed vendor operands.
        need(opcode_base == 13, 'unsupported standard opcode profile')
        need(tuple(header.take(12)) == STANDARD_LENGTHS, 'standard opcode operand counts')
        directories = [('', 0)]
        while True:
            directory, size = name(header)
            if not directory:
                break
            need(directory_count < MAX_DIRECTORIES, 'directory count limit')
            need('..' not in directory.split('/'), 'source traversal')
            directory_count += 1
            directories.append((directory, size))
        files = []

        def file_entry(reader, filename, filename_bytes):
            nonlocal file_count, emitted
            if path_map is None:
                need(filename and '/' not in filename and filename not in ('.', '..'), 'file name')
            else:
                need(filename and all(x not in ('', '.', '..') for x in
                     filename.removeprefix('/').split('/')), 'file name')
            directory = reader.leb()
            reader.leb()                 # modification time, unsigned 64-bit
            reader.leb()                 # file length, unsigned 64-bit
            need(directory < len(directories), 'directory index')
            prefix, prefix_bytes = directories[directory]
            path_bytes = filename_bytes + (prefix_bytes + 1 if directory else 0)
            need(file_count < MAX_FILES, 'file count limit')
            need(path_bytes <= MAX_PATH_BYTES and emitted + 2 * path_bytes <= MAX_EMITTED_PATH_BYTES,
                 'emitted path limit')
            # All count/expansion limits checked BEFORE constructing/storing path.
            file_count += 1
            emitted += 2 * path_bytes
            # Absolute filenames ignore the directory prefix, but its index is
            # still validated above. Relative filenames retain DWARF semantics.
            path = filename if filename.startswith('/') else (prefix + '/' + filename if directory else filename)
            if path_map is not None:
                need(all(x not in ('', '.', '..') for x in path.removeprefix('/').split('/')),
                     'source path spelling')
                need(path in path_map, 'unmapped source path')
                path = path_map[path]
                # Mapped output is separately charged; no expansion bypass.
                mapped_bytes = len(path.encode())
                need(emitted + 2 * mapped_bytes <= MAX_EMITTED_PATH_BYTES, 'emitted path limit')
                emitted += 2 * mapped_bytes
            files.append(path)           # indices remain distinct for duplicates
            paths.add(path)

        while True:
            filename, size = name(header)
            if not filename:
                break
            file_entry(header, filename, size)
        need(header.pos == header.end and files, 'unsupported or empty line header')
        program = Reader(debug, header_end, end)
        file_index, open_sequence = 1, False

        def row():
            need(1 <= file_index <= len(files), 'line file index')

        while program.pos < program.end:
            opcode = program.byte()
            open_sequence = True
            if opcode == 0:
                payload_length = program.leb()
                need(1 <= payload_length <= program.end - program.pos, 'extended payload bounds')
                payload = Reader(debug, program.pos, program.pos + payload_length)
                extension = payload.byte()
                if extension == 1:      # DW_LNE_end_sequence emits a row then resets
                    row()
                    file_index, open_sequence = 1, False
                elif extension == 2:    # DW_LNE_set_address, supported ELF64 profile
                    payload.take(8)
                elif extension == 3:    # DW_LNE_define_file appends, never selects
                    filename, size = name(payload)
                    file_entry(payload, filename, size)
                elif extension == 4:    # DW_LNE_set_discriminator (DWARF4)
                    payload.leb()
                else:
                    raise ValueError('unknown extended opcode')
                need(payload.pos == payload.end, 'extended payload mismatch')
                program.pos = payload.end
            elif opcode >= opcode_base: # special opcode emits a row
                row()
            elif opcode == 1:           # DW_LNS_copy
                row()
            elif opcode == 3:           # DW_LNS_advance_line
                program.leb(signed=True)
            elif opcode in (2, 4, 5, 12):
                operand = program.leb()
                if opcode == 4:         # DW_LNS_set_file, no forward/zero indices
                    need(1 <= operand <= len(files), 'line file index')
                    file_index = operand
            elif opcode == 9:           # fixed_advance_pc is u16, NOT ULEB
                program.take(2)
            elif opcode in (6, 7, 8, 10, 11):
                pass
            else:
                raise ValueError('unknown standard opcode')
        need(not open_sequence, 'unterminated line sequence')
        units.append({'offset': begin, 'bytes': end-begin, 'files': files})
        pos = end
    need(units, 'empty debug table')
    return {'artifactSha256': hashlib.sha256(data).hexdigest(),
            'debugLineSha256': hashlib.sha256(debug).hexdigest(),
            'units': units, 'paths': sorted(paths),
            'boundary': 'Actual DWARF v4 static and dynamic file tables; compiler-attributed source/header superset. Structural operands and file references checked, not address/line-machine validity or instruction provenance. Use exact link maps for contributed objects. Not a complete preprocessor dependency list or legal conclusion.'}
