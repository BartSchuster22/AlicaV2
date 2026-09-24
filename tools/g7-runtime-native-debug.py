"""Offline ELF/DWARF source attribution for the exact unstripped native bytes.

This is build-time evidence, not runtime code, a disassembler, or a substitute
for link maps. A line-table source is a compiler attribution, not proof that
every declaration emitted code. Unsupported DWARF fails rather than guessing.
"""
import hashlib
import struct


def need(value, message):
    if not value:
        raise ValueError(message)


def source_paths(data):
    need(data[:6] == b'\x7fELF\x02\x01', 'ELF64 little endian required')
    need(len(data) >= 64, 'short ELF')
    start = struct.unpack_from('<Q', data, 40)[0]
    size, count, names_index = struct.unpack_from('<HHH', data, 58)
    need(size == 64 and 0 < count < 4096 and names_index < count, 'section table')
    need(start + size * count <= len(data), 'section bounds')
    sections = [struct.unpack_from('<IIQQQQIIQQ', data, start + size*i) for i in range(count)]
    def section(index):
        s = sections[index]
        need(s[4] + s[5] <= len(data), 'section data bounds')
        return data[s[4]:s[4]+s[5]]
    names = section(names_index)
    selected = []
    for i, s in enumerate(sections):
        need(s[0] < len(names), 'section name bounds')
        end = names.find(b'\0', s[0])
        need(end >= 0, 'section name termination')
        if names[s[0]:end] == b'.debug_line':
            need(not s[2] & 0x800, 'compressed debug section unsupported')
            selected.append(i)
    need(len(selected) == 1, 'one uncompressed debug_line required')
    debug = section(selected[0])
    pos, paths, units = 0, set(), []
    while pos < len(debug):
        begin = pos
        need(pos+10 <= len(debug), 'short DWARF unit')
        length, version, header_length = struct.unpack_from('<IHI', debug, pos)
        need(length < 0xfffffff0 and version == 4, 'DWARF32 v4 required')
        end, header_end = begin+4+length, begin+10+header_length
        need(begin+16 <= header_end <= end <= len(debug), 'DWARF bounds')
        pos = begin+10
        minimum, max_ops, default, line_base, line_range, opcode_base = struct.unpack_from('<BBBbBB', debug, pos)
        need(minimum > 0 and max_ops > 0 and line_range > 0 and opcode_base > 0 and default in (0, 1), 'line encoding')
        pos += 6 + opcode_base-1
        need(pos < header_end, 'opcode bounds')
        def text():
            nonlocal pos
            end_string = debug.find(b'\0', pos, header_end)
            need(end_string >= pos, 'unterminated name')
            value = debug[pos:end_string].decode('utf-8', 'strict')
            pos = end_string+1
            return value
        def uleb():
            nonlocal pos
            result = 0
            for shift in range(0, 64, 7):
                need(pos < header_end, 'short uleb')
                b = debug[pos]; pos += 1
                result |= (b & 127) << shift
                if not b & 128:
                    return result
            raise ValueError('oversized uleb')
        directories = ['']
        while True:
            name = text()
            if not name:
                break
            directories.append(name)
        files = []
        while True:
            name = text()
            if not name:
                break
            directory, _, _ = uleb(), uleb(), uleb()
            need(directory < len(directories), 'directory index')
            need('/' not in name and name not in ('.', '..'), 'file name')
            path = directories[directory] + '/' + name if directory else name
            need('..' not in path.split('/'), 'source traversal')
            files.append(path)
            paths.add(path)
        need(pos == header_end and files, 'unsupported line header extension')
        units.append({'offset': begin, 'bytes': end-begin, 'files': files})
        pos = end
    need(units, 'empty debug table')
    return {'artifactSha256': hashlib.sha256(data).hexdigest(),
            'debugLineSha256': hashlib.sha256(debug).hexdigest(),
            'units': units, 'paths': sorted(paths),
            'boundary': 'Actual DWARF v4 file tables; compiler-attributed source/header superset. Use exact link maps for contributed objects. Not a complete preprocessor dependency list or legal conclusion.'}
