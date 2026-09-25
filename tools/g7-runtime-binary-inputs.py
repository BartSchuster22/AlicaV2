"""Trusted offline build-input observation. No downloads or upstream build claims.

ELF PT_DYNAMIC parsing reuses the earlier inventory preparation algorithm against
current bytes. This records imports/interpreter, not host ABI qualification.
Notice lists are source-archive supersets, explicitly not invented linker maps.
"""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import tarfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def build_audit_tool():
    # Offline development/build audit only; this tool and its libraries are not payloads.
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C'}
    directory = os.environ.get('G7_TEST_READELF_DIR')
    if directory is None:
        return '/usr/bin/readelf', env
    directory = Path(directory)
    if not directory.is_absolute() or directory.is_symlink():
        raise ValueError('audit bundle requires an absolute non-symlink directory')
    pins = {
        'readelf': '04db0000749aff89e4af21429340b00b536fc6f80e811c872c006507881a5560',
        'libctf-nobfd.so.0': 'd46fc30938410e5fe6861c608f57b5fb60bb34d1f8af9e5b0bbbb0ecbb806792',
        'libz.so.1': '64c206f0146cc58bbddc4f22054436f4ff278f5a554aa3ce6921ddf7e9133370',
    }
    for name, expected in pins.items():
        path = directory/name
        if path.is_symlink() or not path.is_file() or sha(path.read_bytes()) != expected:
            raise ValueError('audit tool/dependency hash mismatch: ' + name)
    env['LD_LIBRARY_PATH'] = str(directory)
    return str(directory/'readelf'), env


def member_bytes(archive, name):
    member = archive.getmember(name)
    if not (member.isfile() and member.size <= 268435456):
        raise AssertionError
    stream = archive.extractfile(member)
    if not (stream is not None):
        raise AssertionError
    data = stream.read()
    if not (len(data) == member.size):
        raise AssertionError
    return data


def elf(data):
    if not (data[:6] == b'\x7fELF\x02\x01' and struct.unpack_from('<H', data, 18)[0] == 62):
        raise AssertionError
    start = struct.unpack_from('<Q', data, 32)[0]
    size, count = struct.unpack_from('<HH', data, 54)
    if not (size == 56 and count < 1024 and start + size * count <= len(data)):
        raise AssertionError
    headers = [struct.unpack_from('<IIQQQQQQ', data, start+i*size) for i in range(count)]
    for h in headers:
        if not (h[2]+h[5] <= len(data)):
            raise AssertionError
    dynamic = next((h for h in headers if h[0] == 2), None)
    entries = []
    if dynamic:
        for offset in range(dynamic[2], dynamic[2]+dynamic[5], 16):
            tag, value = struct.unpack_from('<qQ', data, offset)
            if tag == 0:
                break
            entries.append((tag, value))
    strings = next((v for k, v in entries if k == 5), None)
    dependencies = []
    version_requirements = []
    def address(value):
        segment = next(h for h in headers if h[0] == 1 and h[3] <= value < h[3]+h[5])
        return segment[2]+value-segment[3]
    if strings is not None:
        seg = next(h for h in headers if h[0] == 1 and h[3] <= strings < h[3]+h[5])
        base = seg[2]+strings-seg[3]
        for tag, value in entries:
            if tag in (1, 15, 29):
                at = base+value
                end = data.index(b'\0', at)
                dependencies.append({'tag': {1: 'NEEDED', 15: 'RPATH', 29: 'RUNPATH'}[tag], 'value': data[at:end].decode()})
        def text(offset):
            at = base+offset
            return data[at:data.index(b'\0', at)].decode()
        needs = next((v for k, v in entries if k == 0x6ffffffe), None)
        count = next((v for k, v in entries if k == 0x6fffffff), 0)
        if not (0 <= count <= 1024):
            raise AssertionError
        if needs is not None:
            at = address(needs)
            for i in range(count):
                version, n, library, auxiliary, following = struct.unpack_from('<HHIII', data, at)
                if not (version == 1 and n <= 1024):
                    raise AssertionError
                cursor = at+auxiliary
                names = []
                for j in range(n):
                    _, flags, _, name, more = struct.unpack_from('<IHHII', data, cursor)
                    names.append({'name':text(name),'flags':flags})
                    if not (j == n-1 or more >= 16):
                        raise AssertionError
                    cursor += more
                version_requirements.append({'library':text(library),'versions':names})
                if not (i == count-1 or following >= 16):
                    raise AssertionError
                at += following
    interpreter = next((data[h[2]:h[2]+h[5]].rstrip(b'\0').decode() for h in headers if h[0] == 3), None)
    return {'sha256': sha(data), 'bytes': len(data), 'interpreter': interpreter, 'dynamicDependencies': dependencies, 'versionRequirements': version_requirements}


def fdlibm_symbols(node, symbols):
    section_start = struct.unpack_from('<Q', node, 40)[0]
    section_size, section_count = struct.unpack_from('<HH', node, 58)
    if not (section_size == 64 and section_start + section_size * section_count <= len(node)):
        raise AssertionError
    defined = []
    for line in symbols.decode().splitlines():
        fields = line.split()
        if len(fields) == 8 and fields[3] == 'FUNC' and fields[6].isdigit() and 'v84base7ieee754' in fields[7]:
            index = int(fields[6])
            if not (0 < index < section_count):
                raise AssertionError
            if not (struct.unpack_from('<Q', node, section_start + index * section_size + 8)[0] & 4):
                raise AssertionError
            defined.append({'name':fields[7],'address':fields[1],'bytes':int(fields[2]),'sectionIndex':index})
    if not (defined):
        raise AssertionError
    return sorted({s['name']:s for s in defined}.values(), key=lambda s:s['name'])


DEFAULT_LOCATIONS = object()


def native_selection(root, locations=DEFAULT_LOCATIONS):
    """Load ordinary selector only; selection never probes selected inputs."""
    native_helper = root/'tools/g7-runtime-native-notices.py'
    spec = importlib.util.spec_from_file_location('native_notices', native_helper)
    if not (spec is not None and spec.loader is not None):
        raise AssertionError
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    kwargs = {} if locations is DEFAULT_LOCATIONS else {'native_locations': locations}
    paths, _ = (module.select_native_inputs(root) if not kwargs else
                module.select_native_inputs(root, locations))
    return module, paths, kwargs, native_helper


def observe_native(root, selection):
    module, paths, kwargs, helper = selection
    attribution = module.observe(root, **kwargs)
    attribution['helperSha256'] = sha(helper.read_bytes())
    artifacts = {'runtime/'+role: elf(path.read_bytes())
                 for role, (path, _) in paths.items()}
    # Same role/digest must describe the bytes shipped, never the source location.
    for entry in attribution['artifacts']:
        if not (artifacts[entry['path']]['sha256'] == entry['sha256']):
            raise AssertionError
    return attribution, artifacts


def observe(root, native_locations=DEFAULT_LOCATIONS):
    root = Path(root)
    # Explicit invalid/partial locations reject before any payload access.
    selection = (None if native_locations is DEFAULT_LOCATIONS else
                 native_selection(root, native_locations))
    lock = json.loads((root/'toolchain.lock.json').read_bytes())['node']
    archive = root/'.tools/node.tar.xz'
    if not (sha(archive.read_bytes()) == lock['sha256']):
        raise AssertionError
    with tarfile.open(archive) as t:
        prefix = 'node-'+lock['version']+'-linux-x64/'
        node = member_bytes(t, prefix+'bin/node')
        license_bytes = member_bytes(t, prefix+'LICENSE')
    if not (node == (root/'.tools/node/bin/node').read_bytes()):
        raise AssertionError
    versions = json.loads(subprocess.check_output([str(root/'.tools/node/bin/node'), '--no-global-search-paths', '-p', 'JSON.stringify(process.versions)'], cwd='/', env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'}))
    if not ('v'+versions['node'] == lock['version']):
        raise AssertionError
    source_helper = root/'tools/g7-runtime-node-source.py'
    spec = importlib.util.spec_from_file_location('g7_node_source', source_helper)
    if not (spec is not None and spec.loader is not None):
        raise AssertionError
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    supplement = helper.observe(root, root/'evidence/g7/runtime-assembly/node-source-inputs')
    if not (base64.b64decode(supplement['files']['runtime/licenses/node-supplement/node-source-LICENSE']) == license_bytes):
        raise AssertionError
    sqlite = json.loads(subprocess.check_output([
        str(root/'.tools/node/bin/node'), '--no-global-search-paths', '--input-type=module', '-e',
        'import {DatabaseSync} from "node:sqlite"; const db=new DatabaseSync(":memory:"); console.log(JSON.stringify(db.prepare("select sqlite_version() as version, sqlite_source_id() as sourceId").get())); db.close();',
    ], cwd='/', env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'}))
    if not (sqlite['version'] == versions['sqlite'] == supplement['sqlite']['version']):
        raise AssertionError
    if not (sqlite['sourceId'] == supplement['sqlite']['sourceId']):
        raise AssertionError
    supplement['binarySqliteObservation'] = sqlite
    supplement['helperSha256'] = sha(source_helper.read_bytes())
    notices = []
    for match in re.finditer(rb'^- ([^\n]+), located at ([^\n]+), is licensed as follows:', license_bytes, re.M):
        notices.append({'name':match[1].decode(),'upstreamPath':match[2].decode(),'licenseOffset':match.start(),'licenses':['runtime/licenses/node-LICENSE']})
    if not (notices):
        raise AssertionError
    native_lock = json.loads((root/'native/g6/toolchain.lock.json').read_bytes())
    compiler_archive = root/'.tools/g6-zig.tar.xz'
    if not (sha(compiler_archive.read_bytes()) == native_lock['sha256']):
        raise AssertionError
    files, native_notices = supplement.pop('files'), []
    with tarfile.open(compiler_archive) as t:
        for m in t.getmembers():
            if m.isfile() and re.fullmatch(r'(?i)(LICENSE|LICENCE|COPYING|NOTICE|PATENTS)(?:[.-].*)?', Path(m.name).name):
                if not (m.size <= 1048576):
                    raise AssertionError
                data = member_bytes(t, m.name)
                path = 'runtime/licenses/native-support/notice-'+str(len(native_notices))+'.txt'
                files[path] = base64.b64encode(data).decode()
                native_notices.append({'sourceMember':m.name,'output':path,'sha256':sha(data)})
    native_attribution, native_artifacts = observe_native(
        root, selection if selection is not None else native_selection(root))
    files.update(native_attribution.pop('files'))
    # Defined FUNC symbols in executable sections, not byte-substring linkage.
    tool, audit_env = build_audit_tool()
    symbols = subprocess.check_output([tool,'-Ws','--wide',str(root/'.tools/node/bin/node')], env=audit_env)
    supplement['fdlibm']['definedFunctions'] = fdlibm_symbols(node, symbols)
    supplement['fdlibm']['artifactSha256'] = sha(node)
    supplement['fdlibm']['readelfOutputSha256'] = sha(symbols)
    artifacts = {'runtime/bin/node':elf(node)}
    artifacts.update(native_artifacts)
    return {'files':files,'node':{'sourceSupplement':supplement,'versions':versions,'licenseSha256':sha(license_bytes),'noticeSections':notices,
            'boundary':'Exact upstream complete LICENSE and all top-level notice sections; includes upstream tooling notices, not assertion each is linked. Versions are actual binary self-report; ABI identifiers are not components.'},
            'nativeSupport':{'compilerVersion':native_lock['version'],'compilerArchiveSha256':native_lock['sha256'],
                             'notices':native_notices,'boundary':'All notice files from pinned compiler distribution, conservative superset; glibc/libstdc++ shared objects are prepared-OS, not shipped.'},
            'nativeAttribution':native_attribution,'elf':artifacts}


if __name__ == '__main__':
    if not (len(sys.argv) in (2, 3)):
        raise AssertionError
    locations = DEFAULT_LOCATIONS if len(sys.argv) == 2 else json.loads(sys.argv[2])
    print(json.dumps(observe(Path(sys.argv[1]).resolve(), locations), sort_keys=True))
