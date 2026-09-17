#!/usr/bin/python3
"""Operator-side initial trust ceremony. Not a Cell runtime dependency or release signer."""
import argparse
import base64
import ctypes
import fcntl
import getpass
import hashlib
import json
import os
from pathlib import Path
import pwd
import resource
import secrets
import socket
import stat
import tempfile
import time
import warnings
from cryptography.hazmat.primitives import serialization as S
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

BASE = Path('/srv/alica-custody')
ROOT = 'sha256:a1495a5dbcdf08ad844c5cc27e860b35e78d296cc751c440e6cb24109ef1e395'
RELEASE = 'sha256:93ea41d456775cfea241ace10bb60eb4450313f1e14072ffe75cca7efca51df1'
PUBLISHER = 'org.aquiero.alica'
DAY_MS = 24 * 60 * 60 * 1000
MAX_INPUT = 65536


def require(condition, message):
    if not condition:
        raise ValueError(message)


def canonical(value):
    def walk(v, depth=0):
        require(depth <= 32, 'Depth limit')
        if v is None or type(v) is bool:
            return
        if type(v) is int:
            require(abs(v) <= 9007199254740991, 'Unsafe integer')
        elif type(v) is str:
            v.encode('utf-8', errors='strict')
        elif type(v) is list:
            for item in v:
                walk(item, depth + 1)
        elif type(v) is dict:
            for key, item in v.items():
                require(type(key) is str and key.isascii(), 'Non-ASCII object key')
                walk(item, depth + 1)
        else:
            raise ValueError('Unsupported JSON value')
    walk(value)
    data = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')
    require(len(data) <= MAX_INPUT, 'Document size limit')
    return data


def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def parse(data):
    require(len(data) <= MAX_INPUT, 'Input size limit')
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'Duplicate key')
            result[key] = value
        return result
    result = json.loads(data.decode('utf-8'), object_pairs_hook=pairs)
    canonical(result)
    return result


def public(key):
    return key.public_key().public_bytes(S.Encoding.Raw, S.PublicFormat.Raw)


def decode_public(record, role, expected):
    require(set(record) == {'role', 'algorithm', 'keyId', 'publicKeyBase64', 'testOnly'}, 'Unexpected public-record shape')
    require(record['role'] == role and record['algorithm'] == 'ed25519' and record['testOnly'] is False, 'Wrong role or test key')
    raw = base64.b64decode(record['publicKeyBase64'], validate=True)
    require(len(raw) == 32 and base64.b64encode(raw).decode() == record['publicKeyBase64'], 'Invalid public key')
    require(digest(raw) == expected == 'sha256:' + record['keyId'], 'Approved public fingerprint mismatch')
    return raw


def sign(key, value, domain):
    signature = key.sign(domain.encode('ascii') + b'\n' + canonical(value))
    key.public_key().verify(signature, domain.encode('ascii') + b'\n' + canonical(value))
    return {'algorithm': 'ed25519', 'keyId': digest(public(key)), 'signature': base64.b64encode(signature).decode()}


def build_material(root, release_raw, now_ms):
    require(isinstance(root, Ed25519PrivateKey), 'Root must be Ed25519')
    require(type(now_ms) is int and 0 <= now_ms < 9007199254740991 - 90 * DAY_MS, 'Invalid clock')
    root_raw = public(root)
    require(len(release_raw) == 32 and root_raw != release_raw, 'Distinct release key required')
    root_id, release_id = digest(root_raw), digest(release_raw)
    policy = {'schemaVersion': 'alica.trust-policy/v1', 'version': 1, 'rootKeyIds': [root_id], 'publishers': [{'id': PUBLISHER, 'keyIds': [release_id], 'executionModes': ['ipc']}], 'issuedAtMs': now_ms, 'expiresAtMs': now_ms + 90 * DAY_MS, 'maxOfflineAgeMs': 7 * DAY_MS}
    revocation = {'schemaVersion': 'alica.revocation/v1', 'version': 1, 'issuedAtMs': now_ms, 'expiresAtMs': now_ms + 7 * DAY_MS, 'revokedKeyIds': [], 'revokedArtifactDigests': []}
    return {'rootKeyId': root_id, 'keys': {root_id: base64.b64encode(root_raw).decode(), release_id: base64.b64encode(release_raw).decode()}, 'policy': policy, 'policySignature': sign(root, policy, 'ALICA-TRUST-POLICY-v1'), 'revocation': revocation, 'revocationSignature': sign(root, revocation, 'ALICA-REVOCATION-v1')}


def read_owned(path, uid, private=False):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == uid, 'File owner/type mismatch')
        require(stat.S_IMODE(info.st_mode) == 0o600, 'Expected owner-only file')
        require(info.st_size <= MAX_INPUT, 'File size limit')
        with os.fdopen(os.dup(fd), 'rb') as stream:
            data = stream.read(MAX_INPUT + 1)
        require(len(data) <= MAX_INPUT, 'File size limit')
        return data
    finally:
        os.close(fd)


def check_directory(path, uid):
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == uid and stat.S_IMODE(info.st_mode) == 0o700, 'Custody directory owner/type/mode mismatch')


def publish(base, material):
    """Publish one immutable initial public trust snapshot; never overwrite it."""
    lock = os.open(base, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        target = base / 'trust-bootstrap'
        require(not os.path.lexists(target), 'Trust already initialized; no overwrite or reset allowed')
        stage = Path(tempfile.mkdtemp(prefix='.trust-bootstrap-', dir=base))
        documents = {'material.json': material, 'policy.json': material['policy'], 'policy-signature.json': material['policySignature'], 'revocation.json': material['revocation'], 'revocation-signature.json': material['revocationSignature'], 'public-root.json': {'rootKeyId': material['rootKeyId'], 'publicKeyBase64': material['keys'][material['rootKeyId']]}}
        for name, value in documents.items():
            fd = os.open(stage / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(canonical(value)); stream.flush(); os.fsync(stream.fileno())
        d = os.open(stage, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(d)
        finally:
            os.close(d)
        # Linux atomic no-replace, including against an empty pre-existing target directory.
        libc = ctypes.CDLL(None, use_errno=True)
        result = libc.renameat2(-100, os.fsencode(stage), -100, os.fsencode(target), 1)
        if result:
            raise OSError(ctypes.get_errno(), 'Atomic initial publication failed; inspect preserved staging')
        os.fsync(lock)
        return target
    finally:
        os.close(lock)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--test-fixture', action='store_true', help='Generate ephemeral test-only keys; output public signed fixture only')
    ap.add_argument('--preflight', action='store_true', help='Inspect public metadata and file permissions; do not read private key or sign')
    args = ap.parse_args()
    if args.test_fixture:
        print(json.dumps({'testOnly': True, 'nowMs': 1000, 'material': build_material(Ed25519PrivateKey.generate(), public(Ed25519PrivateKey.generate()), 1000)}))
        return
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    require(ctypes.CDLL(None).prctl(4, 0, 0, 0, 0) == 0, 'Could not disable dumpability')
    require(socket.gethostname() == 'ElioHermes1', 'Wrong signing host')
    uid = pwd.getpwnam('alica-signer').pw_uid
    require(os.geteuid() == uid, 'Run as the non-login alica-signer account via sudo')
    for path in (BASE, BASE / 'public', BASE / 'private'):
        check_directory(path, uid)
    root_raw = decode_public(parse(read_owned(BASE / 'public/root.json', uid)), 'root', ROOT)
    release_raw = decode_public(parse(read_owned(BASE / 'public/release.json', uid)), 'release', RELEASE)
    require(not os.path.lexists(BASE / 'trust-bootstrap'), 'Trust already initialized; stop, do not reset')
    if args.preflight:
        print('PASS: approved public fingerprints, custody permissions and uninitialized target checked. No private key read or signature made.')
        return
    require(os.isatty(0), 'Interactive terminal required; no piped authorization or passphrase')
    print('INITIAL ROOT AUTHORIZATION — not a release approval')
    print('Pinned root: ' + ROOT)
    print('Release publisher: ' + PUBLISHER + ' / ' + RELEASE)
    print('Allowed plugin mode: IPC only; no in-process fallback.')
    print('Policy nominal validity: 90 days. BOTH policy and revocation metadata must remain fresh within 7 days.')
    print('Initial revocation lists are empty. These files do not install a Cell or authorize provider grants.')
    require(input('Type INITIALIZE to approve this authorization: ') == 'INITIALIZE', 'Cancelled')
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        with open('/dev/tty', 'w') as tty:
            password = getpass.getpass('Custody passphrase (hidden): ', stream=tty).encode('utf-8')
    root = S.load_pem_private_key(read_owned(BASE / 'private/root.pem', uid, True), password)
    require(isinstance(root, Ed25519PrivateKey) and public(root) == root_raw, 'Wrong root private key')
    material = build_material(root, release_raw, time.time_ns() // 1000000)
    require(material['rootKeyId'] == ROOT, 'Root mismatch')
    target = publish(BASE, material)
    print(json.dumps({'status': 'initial-trust-signed', 'path': str(target), 'rootKeyId': ROOT, 'releaseKeyId': RELEASE, 'policyDigest': digest(canonical(material['policy'])), 'materialSha256': hashlib.sha256(canonical(material)).hexdigest(), 'issuedAtMs': material['policy']['issuedAtMs'], 'policyExpiresAtMs': material['policy']['expiresAtMs'], 'revocationExpiresAtMs': material['revocation']['expiresAtMs'], 'keysRegenerated': False, 'releaseSigned': False, 'cellInstalled': False, 'g7Accepted': False}, indent=2))


if __name__ == '__main__':
    main()
