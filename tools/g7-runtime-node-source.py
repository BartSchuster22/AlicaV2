"""Offline exact Node source notice supplement; no network or build attestation.

The source archive checksum is linked to the already pinned binary through the
same verbatim upstream SHASUMS file. SQLite source identity is checked separately
against the live pinned binary by the integrating caller, not inferred here.
"""
import base64
import hashlib
import json
import io
import lzma
from pathlib import Path
import re
import sys
import tarfile


def sha(b):
    return hashlib.sha256(b).hexdigest()


def observe(root, directory):
    root, directory = Path(root), Path(directory)
    lock = json.loads((root/'toolchain.lock.json').read_bytes())['node']
    receipt = json.loads((directory/'receipt.json').read_bytes())
    sums = (directory/'SHASUMS256.txt').read_bytes()
    assert sha(sums) == receipt['metadata']['sha256']
    checksums = dict((line.split()[1], line.split()[0]) for line in sums.decode('ascii').splitlines())
    prefix = 'node-'+lock['version']
    assert checksums[prefix+'-linux-x64.tar.xz'] == lock['sha256'] == receipt['binaryArchiveSha256']
    archive = directory/(prefix+'.tar.xz')
    assert archive.stat().st_size == receipt['source']['bytes']
    assert sha(archive.read_bytes()) == checksums[archive.name] == receipt['source']['sha256']
    files, inputs = {}, []
    with tarfile.open(fileobj=io.BytesIO(lzma.decompress(archive.read_bytes())), mode='r:') as t:
        def read(name):
            m = t.getmember(prefix+'/'+name)
            assert m.isfile() and m.size <= 16777216
            stream = t.extractfile(m)
            assert stream is not None
            b = stream.read()
            assert len(b) == m.size
            inputs.append({'member':m.name,'bytes':len(b),'sha256':sha(b)})
            return b
        def put(path, b):
            files[path] = base64.b64encode(b).decode('ascii')
        header = read('deps/sqlite/sqlite3.h')
        amalgamation = read('deps/sqlite/sqlite3.c')
        version = re.search(rb'^#define SQLITE_VERSION +"([^"]+)"', header, re.M)[1].decode()
        source_id = re.search(rb'^#define SQLITE_SOURCE_ID +"([^"]+)"', header, re.M)[1].decode()
        assert source_id.encode() in amalgamation
        # Verbatim complete first comment, not a fabricated public-domain license.
        notice = header[:header.index(b'*/')+2]+b'\n'
        assert b'The author disclaims copyright' in notice
        put('runtime/licenses/node-supplement/sqlite-header-notice.txt', notice)
        put('runtime/licenses/node-supplement/nbytes-LICENSE', read('deps/nbytes/LICENSE'))
        # ncrypto is Node internal implementation; keep exact upstream description
        # and the actual top-level license instead of inventing a missing LICENSE.
        put('runtime/receipts/node-source/ncrypto-README.md', read('deps/ncrypto/README.md'))
        # Conservative complete named-notice superset from the pinned release
        # source. Presence here is NOT a claim of binary linkage.
        nested = []
        for member in sorted(t.getmembers(), key=lambda m: m.name):
            relative = member.name.removeprefix(prefix+'/')
            if member.isfile() and relative.startswith('deps/') and re.fullmatch(
                    r'(?i)(LICENSES?|LICENCES?|COPYING|NOTICE|PATENTS)(?:[._-].*)?', Path(relative).name):
                b = read(relative)
                out = 'runtime/licenses/node-supplement/upstream-'+sha(relative.encode())+'.txt'
                put(out, b)
                nested.append({'sourceMember':member.name,'sha256':sha(b),'bytes':len(b),'output':out,
                               'basis':'Conservative upstream named-notice superset; individual binary use unestablished'})
        fdlibm = read('deps/v8/src/base/ieee754.cc')
        assert b'Developed at SunSoft' in fdlibm
        put('runtime/licenses/node-supplement/ieee754-source.txt', fdlibm)
        license_bytes = read('LICENSE')
        put('runtime/licenses/node-supplement/node-source-LICENSE', license_bytes)
        for name in ['deps/sqlite/sqlite.gyp','deps/ncrypto/ncrypto.gyp','deps/nbytes/nbytes.gyp']:
            put('runtime/receipts/node-source/'+name.split('/')[-1]+'.txt', read(name))
    return {'files':files,'source':receipt,'sourceMembers':inputs,
            'upstreamNoticeSuperset':nested,
            'fdlibm':{'sourceSha256':sha(fdlibm),'licenses':['runtime/licenses/node-supplement/ieee754-source.txt'] + [n['output'] for n in nested if n['sourceMember'].endswith('/deps/v8/LICENSE.fdlibm')],
                      'basis':'Pinned V8 ieee754 implementation; integrator records actual defined executable symbols, not source-only linkage inference'},
            'licenses':[p for p in files if p.startswith('runtime/licenses/')],
            'sqlite':{'version':version,'sourceId':source_id,'licenses':['runtime/licenses/node-supplement/sqlite-header-notice.txt'],
                      'noticeBoundary':'Verbatim copyright disclaimer/blessing from exact vendored source header. Not a legal warranty or upstream binary rebuild attestation.'},
            'nbytes':{'licenses':['runtime/licenses/node-supplement/nbytes-LICENSE']},
            'ncrypto':{'licenses':['runtime/licenses/node-supplement/node-source-LICENSE'],
                       'basis':'Upstream README describes extracted internal Node implementation; no separate LICENSE member in vendored ncrypto directory.'},
            'boundary':'Source notice supplement only. Integrator MUST compare SQLite live source ID/version and source LICENSE against pinned binary distribution LICENSE; not complete embedded/linker closure.'}


if __name__ == '__main__':
    assert len(sys.argv) == 3
    print(json.dumps(observe(*sys.argv[1:]), sort_keys=True))
