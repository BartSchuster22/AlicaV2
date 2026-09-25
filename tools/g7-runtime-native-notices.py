"""Exact cached native attribution. No legal/relinkability or preprocessor closure claim."""
import base64
import hashlib
import importlib.util
import json
import io
import lzma
from pathlib import Path
import re
import tarfile


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
    lock = json.loads((root/'native/g6/toolchain.lock.json').read_bytes())
    archive_bytes = archive.read_bytes()
    require(sha(archive_bytes) == lock['sha256'], 'compiler archive digest')
    spec = importlib.util.spec_from_file_location('native_debug', root/'tools/g7-runtime-native-debug.py')
    if spec is None or spec.loader is None:
        raise AssertionError('debug helper loader')
    debug = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(debug)
    binding_bytes = (mapped/'binding.json').read_bytes()
    binding = json.loads(binding_bytes)
    require(sorted(e['path'] for e in binding) == ['native/g6/build/bridge.node', 'native/g6/build/launcher', 'native/g7/build/ownership.node'], 'native binding membership')
    files, records, artifacts = {}, {}, []
    prefix = 'zig-x86_64-linux-'+lock['version']+'/'
    def put(b):
        out = 'runtime/licenses/native-source/'+sha(b)+'.txt'
        files[out] = base64.b64encode(b).decode()
        return out
    with tarfile.open(fileobj=io.BytesIO(lzma.decompress(archive_bytes)), mode='r:') as t:
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
            observation = debug.source_paths(data)
            refs = []
            receipt = json.loads(paths[path][1].read_bytes())
            expected = (receipt['outputSha256'] if path == 'native/g7/build/ownership.node'
                        else receipt['artifacts'][name])
            require(sha(data) == expected, 'native receipt output digest')
            for p in observation['paths']:
                if p.startswith('.tools/'+prefix):
                    member = p.removeprefix('.tools/')
                    m = t.getmember(member)
                    require(m.isfile() and m.size <= 1048576, 'source archive member type/size')
                    stream = t.extractfile(m)
                    if stream is None:
                        raise AssertionError('source archive member stream')
                    b = stream.read()
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
                refs.append(p)
            artifacts.append({'path':'runtime/'+path,'sha256':sha(data),'mapSha256':sha(map_bytes),
                              'mapSections':sections,'sourceReferences':refs,'debugLineSha256':observation['debugLineSha256']})
        # LICENSES (plural) was not covered by the older named-notice matcher.
        member = prefix+'lib/libc/glibc/LICENSES'
        stream = t.extractfile(member)
        if stream is None:
            raise AssertionError('glibc notices stream')
        b = stream.read()
        records[member] = {'sourceMember':member,'sourceArchiveSha256':lock['sha256'],
                           'sha256':sha(b),'bytes':len(b),'licenses':[put(b)],
                           'basis':'glibc upstream notice superset, not assertion all listed code is linked'}
    return {'files':files,'compilerArchiveSha256':lock['sha256'],'bindingSha256':sha(binding_bytes),
            'artifacts':artifacts,'sources':records,'licenses':sorted(files),
            'boundary':'Map-selected objects and DWARF source/header superset, exact verbatim notices. Interpreter is a host reference. Compiler is a build tool, not a shipped executable. This is not complete preprocessor dependency closure, upstream reproducibility, legal approval or an LGPL compliance/relinkability determination.'}
