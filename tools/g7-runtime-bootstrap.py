"""Independently delivered development runtime verifier/operator launcher.

The operator supplies an independently authenticated raw inventory SHA256. This
is NOT a release signature, a root ceremony, a production signing substitute,
or an archive extractor. Existing Cell release admission still checks signatures
and current trust. Never obtain the expected digest from the candidate itself.
No downloads, package installation, service changes, or candidate code during
verification. Python and its standard library belong to the prepared OS boundary.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import time

MAX_FILE = 268435456
MAX_TOTAL = 1073741824
MAX_JSON = 1048576
FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC


def require(value, message):
    if not value:
        raise ValueError(message)


def safe(path):
    require(isinstance(path, str) and len(path) <= 240 and
            len(path.split('/')) <= 16 and re.fullmatch(
                r'[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)*', path),
            'invalid inventory path')
    return path


def private(s, directory=False):
    require(s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) in
            ((0o700,) if directory else (0o600, 0o700)) and
            (stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode) and s.st_nlink == 1),
            'unsafe owner/type/mode/link count')


def open_directory(directory):
    """Return an owned no-follow FD through trusted, nonwritable ancestry.

    Check / and every opened directory BEFORE opening its child. This protects
    subsequent pathname reuse against different-UID rename/replacement, not
    hostile operator/root mutation or mount changes by trusted root. No sticky
    exception: shared writable ancestors (including /tmp) are rejected.
    Callers retain their stricter private candidate/destination-parent checks.
    """
    path = Path(directory)
    require(path.is_absolute() and path.anchor == '/' and str(path) == directory
            and '..' not in path.parts, 'absolute normalized directory required')
    fd = os.open('/', FLAGS | os.O_DIRECTORY)
    try:
        def check():
            s = os.fstat(fd)
            require(stat.S_ISDIR(s.st_mode) and s.st_uid in (0, os.getuid())
                    and not s.st_mode & 0o022, 'unsafe ancestor owner/type/mode')
        check()
        for part in path.parts[1:]:
            child = os.open(part, FLAGS | os.O_DIRECTORY, dir_fd=fd)
            previous, fd = fd, child
            # Transfer first: even if closing previous raises, finally closes
            # child. Do not retry close on Linux (FD may already be released).
            os.close(previous)
            check()
        result, fd = fd, None
        return result
    finally:
        if fd is not None:
            os.close(fd)


def read_at(root, path, maximum, deadline):
    safe(path)
    fd = os.dup(root)
    try:
        parts = path.split('/')
        for part in parts[:-1]:
            child = os.open(part, FLAGS | os.O_DIRECTORY, dir_fd=fd)
            os.close(fd)
            fd = child
            private(os.fstat(fd), True)
        child = os.open(parts[-1], FLAGS | os.O_NONBLOCK, dir_fd=fd)
        try:
            before = os.fstat(child)
            private(before)
            require(before.st_size <= maximum, 'file limit')
            output = bytearray()
            while True:
                require(time.monotonic() < deadline, 'verification deadline')
                data = os.read(child, min(1048576, maximum + 1 - len(output)))
                if not data:
                    break
                output.extend(data)
                require(len(output) <= maximum, 'consumed byte limit')
            after = os.fstat(child)
            require((before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                    (after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'input changed')
            require(len(output) == before.st_size, 'short file')
            return bytes(output), stat.S_IMODE(before.st_mode)
        finally:
            os.close(child)
    finally:
        os.close(fd)


def decode(data):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'duplicate JSON key')
            result[key] = value
        return result
    def invalid(value):
        raise ValueError('noninteger JSON number')
    value = json.loads(data.decode('utf-8', 'strict'), object_pairs_hook=pairs,
                       parse_float=invalid, parse_constant=invalid)
    def bounded(v, depth=0):
        require(depth <= 32, 'JSON depth')
        if isinstance(v, str):
            v.encode('utf-8', 'strict')
        elif type(v) is int:
            require(abs(v) <= 9007199254740991, 'unsafe integer')
        elif isinstance(v, dict):
            for k, x in v.items():
                bounded(k, depth + 1)
                bounded(x, depth + 1)
        elif isinstance(v, list):
            for x in v:
                bounded(x, depth + 1)
    bounded(value)
    return value


def verify(directory, expected):
    require(re.fullmatch('[0-9a-f]{64}', expected), 'independent raw SHA256 required')
    path = Path(directory)
    require(path.is_absolute() and str(path) == directory and '..' not in path.parts, 'absolute normalized root required')
    fd = open_directory(directory)
    try:
        private(os.fstat(fd), True)
        deadline = time.monotonic() + 300
        data, _ = read_at(fd, 'runtime-inventory.json', MAX_JSON, deadline)
        require(hashlib.sha256(data).hexdigest() == expected, 'inventory pin mismatch')
        value = decode(data)
        require(type(value) is dict and set(value) == {'schemaVersion', 'qualification', 'inventory'} and
                value['schemaVersion'] == 'alica.runtime-inventory/v1' and
                value['qualification'] == 'DEVELOPMENT_RUNTIME_NOT_PRODUCTION_SIGNED', 'unsupported inventory')
        entries = value['inventory']
        require(type(entries) is list and 1 <= len(entries) <= 4096, 'inventory count')
        names = set()
        folded = set()
        total = 0
        for e in entries:
            require(type(e) is dict and set(e) == {'path', 'bytes', 'sha256', 'mode'}, 'closed entry required')
            p = safe(e['path'])
            require(p != 'runtime-inventory.json' and p not in names and p.lower() not in folded, 'duplicate/case alias/self inventory')
            names.add(p)
            folded.add(p.lower())
            require(type(e['bytes']) is int and 0 <= e['bytes'] <= MAX_FILE and
                    type(e['mode']) is int and e['mode'] in (0o600, 0o700) and
                    isinstance(e['sha256'], str) and re.fullmatch('[0-9a-f]{64}', e['sha256']), 'invalid entry')
            total += e['bytes']
            require(total <= MAX_TOTAL, 'total limit')
            content, mode = read_at(fd, p, e['bytes'], deadline)
            require(len(content) == e['bytes'] and hashlib.sha256(content).hexdigest() == e['sha256'] and mode == e['mode'], 'artifact mismatch')
        actual = set()
        directories = {''}
        for name in names:
            parts = name.split('/')
            for i in range(1, len(parts)):
                directories.add('/'.join(parts[:i]))
        def walk(parent, prefix=''):
            require(time.monotonic() < deadline, 'verification deadline')
            for n in os.listdir(parent):
                p = prefix + n
                safe(p)
                s = os.stat(n, dir_fd=parent, follow_symlinks=False)
                if stat.S_ISDIR(s.st_mode):
                    require(p in directories, 'unlisted directory')
                    child = os.open(n, FLAGS | os.O_DIRECTORY, dir_fd=parent)
                    try:
                        private(os.fstat(child), True)
                        walk(child, p + '/')
                    finally:
                        os.close(child)
                else:
                    private(s)
                    require(p in names or p == 'runtime-inventory.json', 'unlisted artifact')
                    actual.add(p)
        walk(fd)
        require(actual == names | {'runtime-inventory.json'}, 'inventory incomplete')
        return {'verifiedFiles': len(names), 'verifiedBytes': total,
                'inventorySha256': expected, 'productionSignature': False}
    finally:
        os.close(fd)


def main(args):
    require(len(args) >= 3, 'usage: RUNTIME_ABSOLUTE_PATH INDEPENDENT_SHA256 verify|prepare|owned [arguments]')
    directory, expected, operation, *rest = args
    scripts = {'prepare': 'g7-cell-cli.mjs', 'owned': 'g7-owned-cli.mjs'}
    require(operation == 'verify' or operation in scripts,
            'unsupported operation; supported: verify|prepare|owned (admin has no installed CLI)')
    report = verify(directory, expected)
    if operation == 'verify':
        require(not rest, 'unexpected arguments')
        print(json.dumps(report, sort_keys=True))
        return
    require(sys.platform == 'linux' and sys.version_info >= (3, 12), 'prepared Linux/Python >=3.12 required')
    runtime = Path(directory) / 'runtime'
    node = str(runtime / 'bin/node')
    script = str(runtime / 'tools' / scripts[operation])
    # Neither package lookup nor Python startup may inherit source-tree hooks.
    os.chdir(directory)
    os.execve(node, [node, '--no-global-search-paths', '--experimental-vm-modules', script, *rest],
              {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': directory})


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception as error:
        print(json.dumps({'status': 'DENIED', 'reason': str(error)}), file=sys.stderr)
        sys.exit(1)
