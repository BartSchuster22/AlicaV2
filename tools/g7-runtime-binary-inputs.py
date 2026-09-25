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
    assert member.isfile() and member.size <= 268435456
    stream = archive.extractfile(member)
    assert stream is not None
    data = stream.read()
    assert len(data) == member.size
    return data


def elf(data):
    assert data[:6] == b'\x7fELF\x02\x01' and struct.unpack_from('<H', data, 18)[0] == 62
    start = struct.unpack_from('<Q', data, 32)[0]
    size, count = struct.unpack_from('<HH', data, 54)
    assert size == 56 and count < 1024 and start + size * count <= len(data)
    headers = [struct.unpack_from('<IIQQQQQQ', data, start+i*size) for i in range(count)]
    for h in headers:
        assert h[2]+h[5] <= len(data)
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
        assert 0 <= count <= 1024
        if needs is not None:
            at = address(needs)
            for i in range(count):
                version, n, library, auxiliary, following = struct.unpack_from('<HHIII', data, at)
                assert version == 1 and n <= 1024
                cursor = at+auxiliary
                names = []
                for j in range(n):
                    _, flags, _, name, more = struct.unpack_from('<IHHII', data, cursor)
                    names.append({'name':text(name),'flags':flags})
                    assert j == n-1 or more >= 16
                    cursor += more
                version_requirements.append({'library':text(library),'versions':names})
                assert i == count-1 or following >= 16
                at += following
    interpreter = next((data[h[2]:h[2]+h[5]].rstrip(b'\0').decode() for h in headers if h[0] == 3), None)
    return {'sha256': sha(data), 'bytes': len(data), 'interpreter': interpreter, 'dynamicDependencies': dependencies, 'versionRequirements': version_requirements}


def fdlibm_symbols(node, symbols):
    section_start = struct.unpack_from('<Q', node, 40)[0]
    section_size, section_count = struct.unpack_from('<HH', node, 58)
    assert section_size == 64 and section_start + section_size * section_count <= len(node)
    defined = []
    for line in symbols.decode().splitlines():
        fields = line.split()
        if len(fields) == 8 and fields[3] == 'FUNC' and fields[6].isdigit() and 'v84base7ieee754' in fields[7]:
            index = int(fields[6])
            assert 0 < index < section_count
            assert struct.unpack_from('<Q', node, section_start + index * section_size + 8)[0] & 4
            defined.append({'name':fields[7],'address':fields[1],'bytes':int(fields[2]),'sectionIndex':index})
    assert defined
    return sorted({s['name']:s for s in defined}.values(), key=lambda s:s['name'])


def observe(root):
    root = Path(root)
    lock = json.loads((root/'toolchain.lock.json').read_bytes())['node']
    archive = root/'.tools/node.tar.xz'
    assert sha(archive.read_bytes()) == lock['sha256']
    with tarfile.open(archive) as t:
        prefix = 'node-'+lock['version']+'-linux-x64/'
        node = member_bytes(t, prefix+'bin/node')
        license_bytes = member_bytes(t, prefix+'LICENSE')
    assert node == (root/'.tools/node/bin/node').read_bytes()
    versions = json.loads(subprocess.check_output([str(root/'.tools/node/bin/node'), '--no-global-search-paths', '-p', 'JSON.stringify(process.versions)'], cwd='/', env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'}))
    assert 'v'+versions['node'] == lock['version']
    source_helper = root/'tools/g7-runtime-node-source.py'
    spec = importlib.util.spec_from_file_location('g7_node_source', source_helper)
    assert spec is not None and spec.loader is not None
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    supplement = helper.observe(root, root/'evidence/g7/runtime-assembly/node-source-inputs')
    assert base64.b64decode(supplement['files']['runtime/licenses/node-supplement/node-source-LICENSE']) == license_bytes
    sqlite = json.loads(subprocess.check_output([
        str(root/'.tools/node/bin/node'), '--no-global-search-paths', '--input-type=module', '-e',
        'import {DatabaseSync} from "node:sqlite"; const db=new DatabaseSync(":memory:"); console.log(JSON.stringify(db.prepare("select sqlite_version() as version, sqlite_source_id() as sourceId").get())); db.close();',
    ], cwd='/', env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'}))
    assert sqlite['version'] == versions['sqlite'] == supplement['sqlite']['version']
    assert sqlite['sourceId'] == supplement['sqlite']['sourceId']
    supplement['binarySqliteObservation'] = sqlite
    supplement['helperSha256'] = sha(source_helper.read_bytes())
    notices = []
    for match in re.finditer(rb'^- ([^\n]+), located at ([^\n]+), is licensed as follows:', license_bytes, re.M):
        notices.append({'name':match[1].decode(),'upstreamPath':match[2].decode(),'licenseOffset':match.start(),'licenses':['runtime/licenses/node-LICENSE']})
    assert notices
    native_lock = json.loads((root/'native/g6/toolchain.lock.json').read_bytes())
    compiler_archive = root/'.tools/g6-zig.tar.xz'
    assert sha(compiler_archive.read_bytes()) == native_lock['sha256']
    files, native_notices = supplement.pop('files'), []
    with tarfile.open(compiler_archive) as t:
        for m in t.getmembers():
            if m.isfile() and re.fullmatch(r'(?i)(LICENSE|LICENCE|COPYING|NOTICE|PATENTS)(?:[.-].*)?', Path(m.name).name):
                assert m.size <= 1048576
                data = member_bytes(t, m.name)
                path = 'runtime/licenses/native-support/notice-'+str(len(native_notices))+'.txt'
                files[path] = base64.b64encode(data).decode()
                native_notices.append({'sourceMember':m.name,'output':path,'sha256':sha(data)})
    native_helper = root/'tools/g7-runtime-native-notices.py'
    spec = importlib.util.spec_from_file_location('native_notices', native_helper)
    assert spec is not None and spec.loader is not None
    native_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(native_module)
    native_attribution = native_module.observe(root)
    native_attribution['helperSha256'] = sha(native_helper.read_bytes())
    files.update(native_attribution.pop('files'))
    # Defined FUNC symbols in executable sections, not byte-substring linkage.
    tool, audit_env = build_audit_tool()
    symbols = subprocess.check_output([tool,'-Ws','--wide',str(root/'.tools/node/bin/node')], env=audit_env)
    supplement['fdlibm']['definedFunctions'] = fdlibm_symbols(node, symbols)
    supplement['fdlibm']['artifactSha256'] = sha(node)
    supplement['fdlibm']['readelfOutputSha256'] = sha(symbols)
    artifacts = {'runtime/bin/node':elf(node)}
    for p in ['native/g6/build/bridge.node','native/g6/build/launcher','native/g7/build/ownership.node']:
        artifacts['runtime/'+p] = elf((root/p).read_bytes())
    return {'files':files,'node':{'sourceSupplement':supplement,'versions':versions,'licenseSha256':sha(license_bytes),'noticeSections':notices,
            'boundary':'Exact upstream complete LICENSE and all top-level notice sections; includes upstream tooling notices, not assertion each is linked. Versions are actual binary self-report; ABI identifiers are not components.'},
            'nativeSupport':{'compilerVersion':native_lock['version'],'compilerArchiveSha256':native_lock['sha256'],
                             'notices':native_notices,'boundary':'All notice files from pinned compiler distribution, conservative superset; glibc/libstdc++ shared objects are prepared-OS, not shipped.'},
            'nativeAttribution':native_attribution,'elf':artifacts}


if __name__ == '__main__':
    assert len(sys.argv) == 2
    print(json.dumps(observe(Path(sys.argv[1]).resolve()), sort_keys=True))
