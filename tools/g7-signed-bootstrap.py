"""Independently delivered R1 signed transport verifier/extractor.

Trusted delivery consists of this file, g7-runtime-bootstrap.py and the four
unchanged schemas (bundle, signature, trust-policy, revocation) in schemas/.
NONE may be loaded from the candidate. Prepared bootstrap OS additionally needs
Python cryptography with Ed25519 support, provisioned independently, not by this
program. Cell runtime still uses only Python stdlib. No signing/private keys,
network, package installation, service or implicit Cell mutation. Only explicit
launch executes the verified Node/entrypoint, after complete re-verification.
Extraction is NOT Cell install/acceptance. Existing Cell admission remains required.
"""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
import time
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

TRUSTED = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('trusted_runtime_bootstrap', TRUSTED / 'g7-runtime-bootstrap.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
require, decode, safe = runtime.require, runtime.decode, runtime.safe
MAX_FILE, MAX_TOTAL, MAX_JSON = runtime.MAX_FILE, runtime.MAX_TOTAL, runtime.MAX_JSON
FLAGS = runtime.FLAGS
LAUNCH_SCRIPTS = {'prepare': 'g7-cell-cli.mjs', 'owned': 'g7-owned-cli.mjs'}


def canonical(value):
    # Same integer-only, ASCII-key domain as the existing Python trust tooling.
    def keys(v):
        if type(v) is dict:
            for k, x in v.items():
                require(type(k) is str and k.isascii(), 'non-ASCII object key')
                keys(x)
        elif type(v) is list:
            for x in v:
                keys(x)
    value = decode(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode())
    keys(value)
    data = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    require(len(data) <= MAX_JSON, 'JSON size')
    return data


def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def validate(value, schema):
    """Closed small interpreter for the frozen schemas, not generic JSON Schema.

    Unknown keywords FAIL instead of silently omitting validation. Trusted schema
    delivery is independent, and tests bind the exact source schemas.
    """
    allowed = {'$schema', '$id', 'type', 'additionalProperties', 'properties', 'required',
               'const', 'enum', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum',
               'items', 'minItems', 'maxItems', 'uniqueItems'}
    require(set(schema) <= allowed, 'unsupported trusted schema keyword')
    types = {'object': dict, 'array': list, 'string': str, 'integer': int}
    if 'type' in schema:
        require(schema['type'] in types and type(value) is types[schema['type']], 'schema type')
    if 'const' in schema:
        require(value == schema['const'], 'schema constant')
    if 'enum' in schema:
        require(value in schema['enum'], 'schema enum')
    if type(value) is dict:
        require(set(schema.get('required', [])) <= set(value), 'schema required')
        props = schema.get('properties', {})
        require(schema.get('additionalProperties') is False and set(value) <= set(props), 'closed schema')
        for k, v in value.items():
            validate(v, props[k])
    elif type(value) is list:
        require(schema.get('minItems', 0) <= len(value) <= schema.get('maxItems', 4096), 'schema array size')
        if schema.get('uniqueItems'):
            require(len({canonical(x) for x in value}) == len(value), 'schema unique')
        for v in value:
            validate(v, schema['items'])
    elif type(value) is str:
        require(schema.get('minLength', 0) <= len(value) <= schema.get('maxLength', MAX_JSON), 'schema string size')
        if 'pattern' in schema:
            require(re.search(schema['pattern'], value) is not None, 'schema pattern')
    elif type(value) is int:
        require(schema.get('minimum', -9007199254740991) <= value <= schema.get('maximum', 9007199254740991), 'schema integer')
    return value


def checked(value, name):
    # A caller must deliver the original frozen schema bytes with trusted tooling.
    schema = decode((TRUSTED / 'schemas' / (name + '.schema.json')).read_bytes())
    return validate(value, schema)


def signature(value, envelope, domain, keys, key_id):
    checked(envelope, 'signature')
    require(envelope['keyId'] == key_id and key_id in keys, 'signature authority')
    raw = base64.b64decode(keys[key_id], validate=True)
    sig = base64.b64decode(envelope['signature'], validate=True)
    require(len(raw) == 32 and base64.b64encode(raw).decode() == keys[key_id] and digest(raw) == key_id, 'public key identity')
    require(len(sig) == 64 and base64.b64encode(sig).decode() == envelope['signature'], 'signature encoding')
    Ed25519PublicKey.from_public_bytes(raw).verify(sig, domain.encode() + b'\n' + canonical(value))


def trust(material, floor, root_pin):
    require(re.fullmatch(r'sha256:[0-9a-f]{64}', root_pin), 'independent root pin')
    require(type(material) is dict and set(material) == {'keys', 'policy', 'policySignature', 'revocation', 'revocationSignature', 'rootKeyId'}, 'trust shape')
    require(type(floor) is dict and set(floor) == {'rootKeyId', 'policyVersion', 'revocationVersion', 'lastWallMs'}, 'floor shape')
    require(material['rootKeyId'] == floor['rootKeyId'] == root_pin, 'independent root mismatch')
    require(type(material['keys']) is dict and len(material['keys']) <= 257, 'key map')
    now = time.time_ns() // 1000000
    for k in ['policyVersion', 'revocationVersion', 'lastWallMs']:
        require(type(floor[k]) is int and (0 if k == 'lastWallMs' else 1) <= floor[k] <= 9007199254740991, 'floor value')
    require(now >= floor['lastWallMs'], 'backward clock')
    p = checked(material['policy'], 'trust-policy')
    r = checked(material['revocation'], 'revocation')
    require(p['rootKeyIds'] == [root_pin], 'root policy mismatch')
    require(p['version'] >= floor['policyVersion'] and r['version'] >= floor['revocationVersion'], 'stale versions')
    require(len({x['id'] for x in p['publishers']}) == len(p['publishers']), 'duplicate publisher')
    for value, name, domain in [(p, 'policySignature', 'ALICA-TRUST-POLICY-v1'), (r, 'revocationSignature', 'ALICA-REVOCATION-v1')]:
        signature(value, material[name], domain, material['keys'], root_pin)
        require(value['issuedAtMs'] <= now < value['expiresAtMs'] and now - value['issuedAtMs'] <= p['maxOfflineAgeMs'], 'expired/future trust')
    publishers = [x for x in p['publishers'] if x['id'] == 'org.aquiero.alica']
    require(len(publishers) == 1 and publishers[0]['executionModes'] == ['ipc'], 'IPC publisher required')
    return publishers[0], r, now


def kind(path):
    if path.startswith(('runtime/', 'schemas/')):
        return 'runtime'
    fixed = {'profile/profile.json': 'profile', 'profile/lock.json': 'manifest',
             'sbom/sbom.json': 'sbom', 'provenance/build.json': 'provenance'}
    if path in fixed:
        return fixed[path]
    if re.fullmatch(r'trust/(policy|revocation)(-signature)?\.json', path):
        return 'manifest'
    if path.startswith('docs/'):
        return 'documentation'
    match = re.fullmatch(r'plugins/[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+/(.+)', path)
    require(match, 'artifact kind')
    rest = match[1]
    if rest in ('manifest.json', 'index.json'):
        return 'manifest'
    if rest.startswith('code/'):
        return 'plugin'
    require(rest.startswith('contracts/'), 'artifact kind')
    return 'descriptor'


def insert(names, name):
    safe(name)
    for prior in names:
        a, b = name.lower(), prior.lower()
        require(a != b and not a.startswith(b + '/') and not b.startswith(a + '/'), 'path alias')
        for x, y in zip(name.split('/'), prior.split('/')):
            if x.lower() != y.lower():
                break
            require(x == y, 'directory case alias')
    names.add(name)


def octal(b):
    require(re.fullmatch(b'[0-7]+[\x00 ]*', b), 'USTAR octal')
    return int(b.rstrip(b'\0 '), 8)


def field(b):
    require(all(x < 128 for x in b), 'USTAR ASCII')
    before, separator, after = b.partition(b'\0')
    require(not separator or not any(after), 'USTAR NUL ambiguity')
    return before.decode('ascii')


class Archive:
    def __init__(self, path):
        self.fd = os.open(path, FLAGS | os.O_NONBLOCK)
        try:
            self.initial = os.fstat(self.fd)
            require(stat.S_ISREG(self.initial.st_mode) and 1024 <= self.initial.st_size <= MAX_TOTAL, 'archive type/size')
            self.deadline = time.monotonic() + 300
            self.entries = []
            names, offset, expanded = set(), 0, 0
            while offset < self.initial.st_size:
                h = self.read(offset, 512)
                if not any(h):
                    require(offset + 1024 == self.initial.st_size and not any(self.read(offset + 512, 512)), 'exact two-block EOF required')
                    offset += 1024
                    break
                require(len(self.entries) < 4098, 'entry count')
                require(octal(h[148:156]) == sum(h[:148] + b' ' * 8 + h[156:]), 'USTAR checksum')
                require(h[257:265] == b'ustar\x0000' and h[156] in (0, 48) and not any(h[157:257]) and not any(h[500:]), 'USTAR regular-only format')
                require(octal(h[100:108]) <= 0o777, 'USTAR mode')
                for a, b in [(108, 116), (116, 124), (136, 148)]:
                    octal(h[a:b])
                field(h[265:297]); field(h[297:329])
                require(all(x in (0, 48) for x in h[329:345]), 'USTAR device')
                prefix, leaf = field(h[345:500]), field(h[:100])
                name = prefix + '/' + leaf if prefix else leaf
                require(not prefix or (len(name) > 100 and '/' not in leaf), 'USTAR prefix alias')
                insert(names, name)
                size = octal(h[124:136]); expanded += size
                require(size <= MAX_FILE and expanded <= MAX_TOTAL, 'expanded limit')
                position, padding = offset + 512, (-size) % 512
                require(position + size + padding <= self.initial.st_size - 1024, 'truncated entry')
                sha = hashlib.sha256()
                for p in range(0, size, 65536):
                    sha.update(self.read(position + p, min(65536, size - p)))
                require(not any(self.read(position + size, padding)), 'USTAR padding')
                self.entries.append({'path': name, 'bytes': size, 'digest': 'sha256:' + sha.hexdigest(), 'position': position})
                offset = position + size + padding
            require(offset == self.initial.st_size, 'archive EOF')
            self.unchanged()
        except BaseException:
            os.close(self.fd)
            raise

    def unchanged(self):
        s = os.fstat(self.fd)
        require((s.st_size, s.st_mtime_ns, s.st_ctime_ns) == (self.initial.st_size, self.initial.st_mtime_ns, self.initial.st_ctime_ns), 'archive changed')

    def read(self, offset, length):
        data = bytearray()
        while len(data) < length:
            require(time.monotonic() < self.deadline, 'verification deadline')
            b = os.pread(self.fd, min(65536, length - len(data)), offset + len(data))
            require(b, 'short archive read')
            data.extend(b)
        return bytes(data)

    def metadata(self, name):
        entry = next((e for e in self.entries if e['path'] == name), None)
        require(entry and entry['bytes'] <= MAX_JSON, 'missing/oversized metadata')
        self.unchanged()
        b = self.read(entry['position'], entry['bytes'])
        require(digest(b) == entry['digest'], 'metadata changed')
        return decode(b)

    def close(self):
        os.close(self.fd)


def inspect(archive, material, floor, root_pin):
    publisher, revocation, wall = trust(material, floor, root_pin)
    archive.observed_floor = {**floor, 'lastWallMs': wall,
                              'policyVersion': material['policy']['version'],
                              'revocationVersion': revocation['version']}
    require([e['path'] for e in archive.entries[:2]] == ['bundle.json', 'bundle-signature.json'], 'bundle first entries')
    bundle = checked(archive.metadata('bundle.json'), 'bundle')
    sig = checked(archive.metadata('bundle-signature.json'), 'signature')
    require(sig['keyId'] in publisher['keyIds'] and sig['keyId'] not in revocation['revokedKeyIds'], 'release publisher revoked/unauthorized')
    signature(bundle, sig, 'ALICA-BUNDLE-v1', material['keys'], sig['keyId'])
    require(digest(canonical(bundle)) not in revocation['revokedArtifactDigests'], 'revoked bundle')
    names, entries = set(), {}
    for e in bundle['artifacts']:
        insert(names, e['path'])
        require(e['bytes'] <= MAX_FILE and e['kind'] == kind(e['path']), 'artifact limits/kind')
        entries[e['path']] = e
    require(len(entries) == len(archive.entries) - 2, 'inventory count mismatch')
    for e in archive.entries[2:]:
        actual = entries.get(e['path'])
        require(actual and actual['bytes'] == e['bytes'] and actual['digest'] == e['digest'], 'inventory mismatch')
        require(e['digest'] not in revocation['revokedArtifactDigests'], 'revoked artifact')
    require(digest(canonical(archive.metadata('profile/profile.json'))) == bundle['profileDigest'], 'profile digest')
    require(archive.metadata('profile/lock.json')['policyDigest'] == digest(canonical(material['policy'])), 'current policy lock')
    for name, value in [('policy', material['policy']), ('policy-signature', material['policySignature'])]:
        require(canonical(archive.metadata('trust/' + name + '.json')) == canonical(value), 'policy snapshot mismatch')
    snapshot = checked(archive.metadata('trust/revocation.json'), 'revocation')
    signature(snapshot, archive.metadata('trust/revocation-signature.json'), 'ALICA-REVOCATION-v1', material['keys'], root_pin)
    require(snapshot['version'] <= revocation['version'], 'revocation snapshot ahead')
    if snapshot['version'] == revocation['version']:
        require(canonical(snapshot) == canonical(revocation), 'revocation equivocation')
    for path in ['sbom/sbom.json', 'provenance/build.json']:
        archive.metadata(path)
    _, _, wall = trust(material, archive.observed_floor, root_pin)
    archive.observed_floor['lastWallMs'] = wall
    archive.unchanged()
    return {'bundleDigest': digest(canonical(bundle)), 'artifacts': len(entries),
            'observedTrustFloor': archive.observed_floor.copy(),
            'qualification': 'SIGNED_TRANSPORT_ONLY_NOT_CELL_ADMISSION_OR_SBOM_COMPLETENESS'}


def extract(archive, destination):
    """No overwrite/publication/cleanup. Any partial destination is failure residue.

    Use only after inspect succeeds. All writes no-follow descriptor relative,
    exclusive and bounded; every read is rehashed before successful completion.
    Same-UID hostile mutation and uninterruptible OS I/O remain outside guarantees.
    """
    p = Path(destination)
    require(p.is_absolute() and str(p) == destination and '..' not in p.parts, 'absolute normalized destination')
    require(p.anchor == '/' and p.name, 'named destination under single root required')
    parent = runtime.open_directory(str(p.parent))
    try:
        runtime.private(os.fstat(parent), True)
        space = os.fstatvfs(parent)
        require(space.f_bavail * space.f_frsize >= sum(e['bytes'] for e in archive.entries) + 536870912, 'disk reserve')
        os.mkdir(p.name, 0o700, dir_fd=parent)
        root = os.open(p.name, FLAGS | os.O_DIRECTORY, dir_fd=parent)
        try:
            runtime.private(os.fstat(root), True)
            for e in archive.entries:
                archive.unchanged()
                current = os.dup(root)
                try:
                    parts = e['path'].split('/')
                    for part in parts[:-1]:
                        try:
                            os.mkdir(part, 0o700, dir_fd=current)
                        except FileExistsError:
                            pass
                        child = os.open(part, FLAGS | os.O_DIRECTORY, dir_fd=current)
                        os.close(current); current = child
                        runtime.private(os.fstat(current), True)
                    output = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=current)
                    try:
                        sha = hashlib.sha256()
                        for at in range(0, e['bytes'], 65536):
                            b = archive.read(e['position'] + at, min(65536, e['bytes'] - at))
                            sha.update(b)
                            view = memoryview(b)
                            while view:
                                n = os.write(output, view)
                                require(n > 0, 'short write')
                                view = view[n:]
                        require('sha256:' + sha.hexdigest() == e['digest'], 'extraction digest')
                        # Executability is selected by trusted bootstrap, not tar mode.
                        if e['path'] in ('runtime/bin/node', 'runtime/bin/age', 'runtime/native/g6/build/launcher'):
                            os.fchmod(output, 0o700)
                        os.fsync(output)
                    finally:
                        os.close(output)
                    os.fsync(current)
                finally:
                    os.close(current)
            archive.unchanged()
            # Sync every reconstructed directory, bottom-up, not only leaf dirs.
            def sync_dirs(fd):
                for name in os.listdir(fd):
                    s = os.stat(name, dir_fd=fd, follow_symlinks=False)
                    if stat.S_ISDIR(s.st_mode):
                        child = os.open(name, FLAGS | os.O_DIRECTORY, dir_fd=fd)
                        try:
                            runtime.private(os.fstat(child), True)
                            sync_dirs(child)
                        finally:
                            os.close(child)
                os.fsync(fd)
            sync_dirs(root)
        finally:
            os.close(root)
        os.fsync(parent)
    finally:
        os.close(parent)


def operator_json(path):
    p = Path(path)
    require(p.is_absolute() and str(p) == path and '..' not in p.parts, 'absolute operator path')
    parent = os.open('/', FLAGS | os.O_DIRECTORY)
    try:
        for part in p.parts[1:-1]:
            child = os.open(part, FLAGS | os.O_DIRECTORY, dir_fd=parent)
            os.close(parent); parent = child
        return decode(runtime.read_at(parent, p.name, MAX_JSON, time.monotonic() + 300)[0])
    finally:
        os.close(parent)


def launch(archive, directory, operation, arguments, material, floor, root_pin):
    """Reverify every extracted byte before explicit operator launch.

    No archive-provided hooks, fallback, Cell takeover, or acceptance claim.
    The extracted tree must contain exactly the signed payload plus envelopes.
    """
    require(operation in LAUNCH_SCRIPTS,
            'unsupported launch operation; supported: prepare|owned (admin has no installed CLI)')
    p = Path(directory)
    require(p.is_absolute() and str(p) == directory and '..' not in p.parts, 'absolute normalized runtime')
    fd = runtime.open_directory(directory)
    try:
        runtime.private(os.fstat(fd), True)
        names, directories = set(), set()
        for e in archive.entries:
            data, mode = runtime.read_at(fd, e['path'], e['bytes'], archive.deadline)
            require(len(data) == e['bytes'] and digest(data) == e['digest'], 'extracted byte mismatch')
            expected_mode = 0o700 if e['path'] in ('runtime/bin/node', 'runtime/bin/age', 'runtime/native/g6/build/launcher') else 0o600
            require(mode == expected_mode, 'extracted mode mismatch')
            names.add(e['path'])
            parts = e['path'].split('/')
            directories.update('/'.join(parts[:i]) for i in range(1, len(parts)))
        actual = set()
        def walk(parent, prefix=''):
            require(time.monotonic() < archive.deadline, 'verification deadline')
            for name in os.listdir(parent):
                path = prefix + name
                s = os.stat(name, dir_fd=parent, follow_symlinks=False)
                if stat.S_ISDIR(s.st_mode):
                    require(path in directories, 'extra extracted directory')
                    child = os.open(name, FLAGS | os.O_DIRECTORY, dir_fd=parent)
                    try:
                        runtime.private(os.fstat(child), True)
                        walk(child, path + '/')
                    finally:
                        os.close(child)
                else:
                    runtime.private(s)
                    require(path in names, 'extra extracted file')
                    actual.add(path)
        walk(fd)
        require(actual == names, 'extracted inventory incomplete')
        archive.unchanged()
        _, _, wall = trust(material, archive.observed_floor, root_pin)
        archive.observed_floor['lastWallMs'] = wall
    finally:
        os.close(fd)
    require(sys.platform == 'linux' and sys.version_info >= (3, 12), 'prepared Linux/Python >=3.12 required')
    node = str(p / 'runtime/bin/node')
    script = str(p / 'runtime/tools' / LAUNCH_SCRIPTS[operation])
    require('runtime/bin/node' in names and 'runtime/tools/' + LAUNCH_SCRIPTS[operation] in names, 'missing runtime entrypoint')
    os.chdir(directory)
    os.execve(node, [node, '--no-global-search-paths', '--experimental-vm-modules', script, *arguments],
              {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': directory})


def main(args):
    require(len(args) >= 5, 'usage: verify|extract|launch ARCHIVE INDEPENDENT_ROOT_PIN OPERATOR_TRUST OPERATOR_FLOOR [NEW_DESTINATION | EXTRACTED prepare|owned arguments]')
    operation, path, root_pin, trust_path, floor_path, *rest = args
    require((operation == 'verify' and not rest) or (operation == 'extract' and len(rest) == 1) or
            (operation == 'launch' and len(rest) >= 2), 'operation arguments')
    if operation == 'launch':
        require(rest[1] in LAUNCH_SCRIPTS,
                'unsupported launch operation; supported: prepare|owned (admin has no installed CLI)')
    material, floor = operator_json(trust_path), operator_json(floor_path)
    archive = Archive(path)
    try:
        report = inspect(archive, material, floor, root_pin)
        if operation == 'extract':
            extract(archive, rest[0])
            _, _, wall = trust(material, archive.observed_floor, root_pin)
            archive.observed_floor['lastWallMs'] = wall
            report['observedTrustFloor'] = archive.observed_floor.copy()
        elif operation == 'launch':
            launch(archive, rest[0], rest[1], rest[2:], material, floor, root_pin)
        print(json.dumps(report, sort_keys=True))
    finally:
        archive.close()


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception:
        # No private input/path/token in operator error output.
        print('{"status":"DENIED"}', file=sys.stderr)
        sys.exit(1)
