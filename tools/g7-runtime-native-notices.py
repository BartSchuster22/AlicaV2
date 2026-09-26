"""Exact cached native attribution. No legal/relinkability or preprocessor closure claim."""
import base64
import hashlib
import importlib.util
import json
import lzma
import os
from pathlib import Path
import re
import stat
import tarfile

# Parser-local limits, NOT an increase to the caller's shared resource budget.
ARCHIVE_CHUNK = 65536
MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
MAX_TAR_BYTES = 384 * 1024 * 1024
MAX_TAR_HEADERS = 32768
MAX_TAR_EXTENSION = 16384
MAX_SELECTED_NAMES = 512
MAX_SELECTED_BYTES = 4 * 1024 * 1024
MAX_MEMBER_BYTES = 1024 * 1024


class _ArchiveReader:
    """One sequential compressed read; bounded decoder output and dictionary."""
    def __init__(self, raw):
        self.raw = raw
        self.digest = hashlib.sha256()
        # Pinned XZ uses a 64MiB dictionary PLUS decoder bookkeeping.
        self.decoder = lzma.LZMADecompressor(memlimit=65 * 1024 * 1024)
        self.compressed = self.expanded = 0

    def chunk(self):
        b = self.raw.read(ARCHIVE_CHUNK)
        self.compressed += len(b)
        require(self.compressed <= MAX_ARCHIVE_BYTES, 'compiler archive size')
        self.digest.update(b)
        return b

    def read(self, size):
        require(0 <= size <= MAX_MEMBER_BYTES, 'archive read bound')
        out = bytearray()
        while len(out) < size and not self.decoder.eof:
            b = self.chunk() if self.decoder.needs_input else b''
            require(b or not self.decoder.needs_input, 'truncated compiler archive')
            part = self.decoder.decompress(b, max_length=min(ARCHIVE_CHUNK, size-len(out)))
            self.expanded += len(part)
            require(self.expanded <= MAX_TAR_BYTES, 'archive expansion bound')
            out.extend(part)
        return bytes(out)

    def finish(self):
        # tar stops at its end marker; still verify the entire XZ stream and hash
        # ALL compressed bytes, including any bytes beyond that marker.
        while self.read(ARCHIVE_CHUNK):
            pass
        require(self.decoder.eof, 'truncated compiler archive')
        # Pinned compiler archive has one XZ stream, not concatenated streams.
        require(not self.decoder.unused_data, 'trailing compiler archive data')
        require(not self.chunk(), 'trailing compiler archive data')


def archive_members(archive, expected_sha256, needed):
    """Last duplicate wins, as TarFile.getmember did; no retained tar index.

    The caller must provide a confined readonly tree. O_NOFOLLOW and fstat
    stability supplement that custody, not replace readonly ancestor confinement.
    """
    require(0 < len(needed) <= MAX_SELECTED_NAMES and
            all(type(n) is str and len(n.encode()) <= 4096 for n in needed),
            'archive selected name bound')
    headers = extension_bytes = 0

    class BoundedInfo(tarfile.TarInfo):
        def _proc_member(self, tar):
            nonlocal headers, extension_bytes
            headers += 1
            require(headers <= MAX_TAR_HEADERS, 'archive header count')
            item = self
            # Check BEFORE tarfile reads GNU/PAX metadata or sparse structures.
            require(item.type != tarfile.GNUTYPE_SPARSE, 'sparse archive member')
            if item.type in (tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_LONGLINK,
                             tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.SOLARIS_XHDTYPE):
                require(0 <= item.size <= MAX_TAR_EXTENSION, 'archive extension bound')
                extension_bytes += item.size
                require(extension_bytes <= 65536, 'archive cumulative extension bound')
            return super()._proc_member(tar)

        def _proc_gnusparse_00(self, *args):
            raise AssertionError('sparse archive member')

        _proc_gnusparse_01 = _proc_gnusparse_00
        _proc_gnusparse_10 = _proc_gnusparse_00

    def identity(s):
        return s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns

    fd = os.open(archive, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    with os.fdopen(fd, 'rb') as raw:
        before = os.fstat(raw.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_size <= MAX_ARCHIVE_BYTES,
                'compiler archive regular/size')
        reader = _ArchiveReader(raw)
        found, retained = {}, 0
        with tarfile.open(fileobj=reader, mode='r|', tarinfo=BoundedInfo) as tar:
            for member in tar:
                # Python 3.10 stream mode STILL appends every member by default.
                tar.members.clear()
                require(len(member.name.encode()) <= 4096 and
                        len(tar.pax_headers) <= 64 and
                        sum(len(k)+len(v) for k,v in tar.pax_headers.items()) <= MAX_TAR_EXTENSION,
                        'archive metadata bound')
                if member.name not in needed:
                    continue
                previous = found.pop(member.name, None)
                retained -= len(previous) if isinstance(previous, bytes) else 0
                del previous
                # Preserve getmember's last-entry selection, even if an earlier
                # duplicate is invalid. Never follow archive links.
                if not member.isfile() or member.sparse is not None or not 0 <= member.size <= MAX_MEMBER_BYTES:
                    found[member.name] = None
                    continue
                require(retained + member.size <= MAX_SELECTED_BYTES, 'selected archive bytes')
                stream = tar.extractfile(member)
                require(stream is not None, 'source archive member stream')
                with stream:
                    b = stream.read(MAX_MEMBER_BYTES + 1)
                require(len(b) == member.size, 'source archive member length')
                found[member.name] = b
                retained += len(b)
        reader.finish()
        require(reader.digest.hexdigest() == expected_sha256, 'compiler archive digest')
        require(identity(before) == identity(os.fstat(raw.fileno())), 'compiler archive changed')
        missing = set(needed) - set(found)
        if missing:
            raise KeyError('filename %r not found' % sorted(missing)[0])
        require(all(isinstance(b, bytes) for b in found.values()), 'source archive member type/size')
        return found


def sha(b):
    return hashlib.sha256(b).hexdigest()


def require(value, message):
    # Integrity checks must remain active under python -O/-OO.
    if not value:
        raise AssertionError(message)


def select_artifact_paths(root, locations=None):
    """Pure lexical selection; caller must authorize and confine physical paths."""
    root = Path(root)
    roles = ('native/g6/build/bridge.node', 'native/g6/build/launcher',
             'native/g7/build/ownership.node')
    paths = {p: (root/p, root/Path(p).parent/'receipt.json') for p in roles}
    if locations is not None:
        require(type(locations) is dict and set(locations) == {roles[2]},
                'locations must contain only the ownership role')
        directory = locations[roles[2]]
        require(type(directory) is str and directory and '\x00' not in directory,
                'ownership destination string')
        dest = Path(directory)
        require(root.is_absolute() and dest.is_absolute() and
                root.anchor == '/' and dest.anchor == '/' and
                str(dest) == directory and '..' not in dest.parts and
                '..' not in root.parts and dest != Path('/') and
                dest != root and root not in dest.parents,
                'canonical absolute destination outside original root required')
        paths[roles[2]] = (dest/'ownership.node', dest/'receipt.json')
    return paths


DEFAULT_LOCATIONS = object()


def select_native_inputs(root, locations=DEFAULT_LOCATIONS):
    """Closed M4 source references, not filesystem admission or custody proof.

    Fixed filenames retain the receipt and three-role binding/map contracts.
    An explicit selection must supply BOTH directories; never fill partial input.
    """
    root = Path(root)
    if locations is DEFAULT_LOCATIONS:
        return select_artifact_paths(root), root/'evidence/g7/runtime-assembly/native-attribution-inputs'
    require(type(locations) is dict and
            set(locations) == {'ownershipDirectory', 'attributionDirectory'},
            'complete native locations required')
    role = 'native/g7/build/ownership.node'
    paths = select_artifact_paths(root, {role: locations['ownershipDirectory']})
    # Apply the same canonical, single-slash, outside-root lexical convention.
    selected = select_artifact_paths(root, {role: locations['attributionDirectory']})
    return paths, selected[role][0].parent


def unique_json_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'duplicate JSON key: '+key)
        result[key] = value
    return result


def validate_native_binding(root, paths, mapped, archive=None):
    """Read-only receipt/source/output/map binding, never native execution.

    Uses the existing three-role binding and legacy receipts unchanged. R6's
    additional map/provenance fields, when present, must agree too. Caller owns
    readonly filesystem custody; hashes are not build or runtime qualification.
    """
    root, mapped = Path(root), Path(mapped)
    roles = ('native/g6/build/bridge.node', 'native/g6/build/launcher',
             'native/g7/build/ownership.node')
    require(set(paths) == set(roles), 'native path membership')
    binding_bytes = (mapped/'binding.json').read_bytes()
    binding = json.loads(binding_bytes, object_pairs_hook=unique_json_object)
    require(type(binding) is list and all(type(e) is dict for e in binding) and
            sorted(e.get('path', '') for e in binding) == sorted(roles),
            'native binding membership')
    lock = json.loads((root/'native/g6/toolchain.lock.json').read_bytes(),
                      object_pairs_hook=unique_json_object)
    def digest(path):
        h = hashlib.sha256()
        with path.open('rb') as stream:
            for chunk in iter(lambda: stream.read(65536), b''):
                h.update(chunk)
        return h.hexdigest()
    archive_sha = digest(Path(archive) if archive else root/'.tools/g6-zig.tar.xz')
    compiler_sha = digest(root/('.tools/zig-x86_64-linux-'+lock['version']+'/zig'))
    checked = {}
    for entry in binding:
        role = entry['path']
        binary, receipt_path = paths[role]
        name = Path(role).name
        canonical = 'inputs' if role == roles[2] else 'sources'
        cache_key = (receipt_path, canonical)
        if cache_key not in checked:
            receipt = json.loads(receipt_path.read_bytes(), object_pairs_hook=unique_json_object)
            require(not ('sources' in receipt and 'inputs' in receipt),
                    'ambiguous native receipt inputs')
            inputs = receipt.get(canonical)
            require(type(inputs) is dict and inputs, 'native receipt inputs')
            mandatory = ({'native/g7/ownership.c', 'native/g6/toolchain.lock.json', 'toolchain.lock.json'}
                         if role == roles[2] else
                         {'native/g6/bridge.c', 'native/g6/launcher.c', 'native/g6/sandbox.c',
                          'native/g6/toolchain.lock.json', 'toolchain.lock.json'})
            require(mandatory <= inputs.keys(), 'native required source membership')
            for p, expected in inputs.items():
                require(type(p) is str and p and '\x00' not in p and
                        all(c not in ('', '.', '..') for c in p.split('/')),
                        'native receipt source path')
                require(digest(root/p) == expected, 'stale native source receipt: '+p)
            require(archive_sha == lock['sha256'] == receipt['compilerArchiveSha256'],
                    'native compiler archive digest')
            require(compiler_sha == receipt['compilerExecutableSha256'],
                    'native compiler executable digest')
            checked[cache_key] = (receipt, inputs)
        receipt, inputs = checked[cache_key]
        outputs = ({'ownership.node': receipt['outputSha256']} if role == roles[2]
                   else receipt['artifacts'])
        require(set(outputs) == ({'ownership.node'} if role == roles[2]
                                else {'bridge.node', 'launcher'}), 'native output membership')
        require(digest(binary) == entry['sha256'] == outputs[name],
                'native receipt/binding output digest')
        map_sha = digest(mapped/(name+'.map'))
        require(map_sha == entry['mapSha256'], 'native map digest')
        if role == roles[2]:
            if 'mapSha256' in receipt:
                require(map_sha == receipt['mapSha256'], 'native receipt map digest')
            if 'sourceProvenance' in receipt:
                require(receipt['sourceProvenance'] == {
                    'ownershipSha256': inputs['native/g7/ownership.c'],
                    'recipeSha256': inputs['tools/build-g7-native.py']},
                    'native receipt source provenance')
    return binding_bytes, binding


def receipt_path_map(root, receipt_path):
    """Compatibility for the reviewed R6 receipt only, not arbitrary build roots.

    Call AFTER validate_native_binding. Declared source identities are checked
    there; selected toolchain bytes are authenticated by archive_members in
    observe. This mapping alone is structural attribution, not source proof.
    Unknown/legacy receipts retain the historical parser behavior.
    """
    raw = receipt_path.read_bytes()
    if sha(raw) != 'fe9ace315a96759f90e1b675ed3c912187ab6a77c833ccf89bf7f010d666077d':
        return None
    receipt = json.loads(raw, object_pairs_hook=unique_json_object)
    build_root = '/run/g7-e2-integration-current-r6'
    prefix = '.tools/zig-x86_64-linux-0.15.2/lib/'
    require(receipt['command'][0] == build_root+'/.tools/zig-x86_64-linux-0.15.2/zig' and
            build_root+'/native/g7/ownership.c' in receipt['command'], 'pinned build root')
    paths = set(receipt['inputs'])
    for p in (Path(root)/prefix).rglob('*'):
        if p.is_file():
            paths.add(p.relative_to(root).as_posix())
            require(len(paths) <= 65536, 'path mapping count')
    return {build_root+'/'+p: p for p in paths}


def observe(root, archive=None, mapped=None, artifact_locations=None, *,
            native_locations=DEFAULT_LOCATIONS):
    root = Path(root)
    if native_locations is not DEFAULT_LOCATIONS:
        require(mapped is None and artifact_locations is None,
                'conflicting native locations')
        paths, mapped = select_native_inputs(root, native_locations)
    else:
        paths = select_artifact_paths(root, artifact_locations)
        # Legacy ownership overrides cannot silently consume original maps.
        if artifact_locations is not None:
            require(mapped is not None, 'explicit ownership requires explicit mapped evidence')
            role = 'native/g7/build/ownership.node'
            selected = select_artifact_paths(root, {role: str(mapped)})
            mapped = selected[role][0].parent
    archive = Path(archive) if archive else root/'.tools/g6-zig.tar.xz'
    mapped = Path(mapped) if mapped else root/'evidence/g7/runtime-assembly/native-attribution-inputs'
    lock = json.loads((root/'native/g6/toolchain.lock.json').read_bytes(),
                      object_pairs_hook=unique_json_object)
    binding_bytes, binding = validate_native_binding(root, paths, mapped, archive)
    # Archive decoding independently reauthenticates its opened descriptor below.
    spec = importlib.util.spec_from_file_location('native_debug', root/'tools/g7-runtime-native-debug.py')
    if spec is None or spec.loader is None:
        raise AssertionError('debug helper loader')
    debug = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(debug)
    files, records, artifacts = {}, {}, []
    prefix = 'zig-x86_64-linux-'+lock['version']+'/'
    def put(b):
        out = 'runtime/licenses/native-source/'+sha(b)+'.txt'
        files[out] = base64.b64encode(b).decode()
        return out
    # Authenticate native/map/receipt inputs and gather exact DWARF selections
    # before reading the archive. No ELF data or complete debug-unit list retained.
    observations = []
    needed = {prefix+'lib/libc/glibc/LICENSES'}
    for entry in binding:
        path = entry['path']
        require(re.fullmatch(r'native/g[67]/build/(bridge.node|ownership.node|launcher)', path), 'native path')
        data = paths[path][0].read_bytes()
        require(sha(data) == entry['sha256'], 'native ELF differs from mapped evidence')
        name = Path(path).name
        map_bytes = (mapped/(name+'.map')).read_bytes()
        require(sha(map_bytes) == entry['mapSha256'], 'native map digest')
        sections = []
        for line in map_bytes.decode().splitlines()[1:]:
            fields = line.split(None, 4)
            if len(fields) == 5 and ':(' in fields[4] and not fields[4].startswith('<internal>'):
                sections.append({'input':fields[4].split(':(',1)[0], 'section':fields[4].split(':(',1)[1].rstrip(')'), 'bytes':int(fields[2],16)})
        require(sections, 'empty native map sections')
        path_map = receipt_path_map(root, paths[path][1])
        observation = (debug.source_paths(data) if path_map is None else
                       debug.source_paths(data, path_map=path_map))
        receipt = json.loads(paths[path][1].read_bytes(), object_pairs_hook=unique_json_object)
        expected = (receipt['outputSha256'] if path == 'native/g7/build/ownership.node'
                    else receipt['artifacts'][name])
        require(sha(data) == expected, 'native receipt output digest')
        refs = observation['paths']
        for p in refs:
            if p.startswith('.tools/'+prefix):
                needed.add(p.removeprefix('.tools/'))
                require(len(needed) <= MAX_SELECTED_NAMES, 'archive selected name bound')
        observations.append((refs, receipt))
        artifacts.append({'path':'runtime/'+path,'sha256':sha(data),'mapSha256':sha(map_bytes),
                          'mapSections':sections,'sourceReferences':refs,'debugLineSha256':observation['debugLineSha256']})
        del data, map_bytes, observation
    selected = archive_members(archive, lock['sha256'], needed)
    for refs, receipt in observations:
        for p in refs:
            if p.startswith('.tools/'+prefix):
                member = p.removeprefix('.tools/')
                b = selected[member]
                record = {'sourceMember':member,'sourceArchiveSha256':lock['sha256'],
                          'sha256':sha(b),'bytes':len(b),'licenses':[put(b)],
                          'basis':'Complete verbatim compiler-attributed source/header, including all inline notices; not proof every header emits code',
                          'explicitLinkException':b'permission to link the compiled version of this file' in b,
                          'spdxIdentifiers':[s.decode() for s in re.findall(rb'SPDX-License-Identifier: ([^\r\n*]+)',b)]}
            elif p.startswith('.tools/node/include/node/'):
                b = (root/p).read_bytes()
                require(sha(b) == receipt.get('sources',receipt.get('inputs',{}))[p], 'Node header receipt digest')
                record = {'path':p,'sha256':sha(b),'bytes':len(b),'licenses':['runtime/licenses/node-LICENSE'],
                          'verbatimHeader':put(b),'basis':'DWARF referenced header bound to native input receipt; Node project license'}
            else:
                require(p.startswith('native/') and '..' not in p.split('/'), 'application source path')
                b = (root/p).read_bytes()
                require(sha(b) == receipt.get('sources',receipt.get('inputs',{}))[p], 'application source receipt digest')
                record = {'path':p,'sha256':sha(b),'licenses':['runtime/licenses/ALICA-NOTICE.txt'],'basis':'Private application build input'}
            records[p] = record
    # LICENSES (plural) was not covered by the older named-notice matcher.
    member = prefix+'lib/libc/glibc/LICENSES'
    b = selected[member]
    records[member] = {'sourceMember':member,'sourceArchiveSha256':lock['sha256'],
                       'sha256':sha(b),'bytes':len(b),'licenses':[put(b)],
                       'basis':'glibc upstream notice superset, not assertion all listed code is linked'}
    return {'files':files,'compilerArchiveSha256':lock['sha256'],'bindingSha256':sha(binding_bytes),
            'artifacts':artifacts,'sources':records,'licenses':sorted(files),
            'boundary':'Map-selected objects and DWARF source/header superset, exact verbatim notices. Interpreter is a host reference. Compiler is a build tool, not a shipped executable. This is not complete preprocessor dependency closure, upstream reproducibility, legal approval or an LGPL compliance/relinkability determination.'}
