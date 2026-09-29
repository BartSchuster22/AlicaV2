#!/usr/bin/env python3
"""R1 disposable qualification only; no host socket inspection or operational access.
Run sudo -n /usr/bin/python3 -I services/doghouse/tests/no-container.py.
Copies allowlisted regular source/runtime files (no host bind mounts), new mount/
network/PID namespaces, chroot, unprivileged test uid. Removes only own temp root.
"""
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import tempfile
repo = pathlib.Path(__file__).resolve().parents[3]
node = repo / '.tools/node-v24.21.0-linux-x64/bin/node'
assert os.geteuid() == 0
uid, gid = repo.stat().st_uid, repo.stat().st_gid
assert uid != 0
roots = ['services/doghouse', 'docs/phase5.2/design', 'catalog/proposals/assurance-incidents',
         'examples/phase52-consumer', 'packages', 'node_modules', 'service-foundation/tooling',
         'service-foundation/schemas', 'tools/g3-fixtures.mjs', 'specs/examples/capability.valid.json']
with tempfile.TemporaryDirectory(prefix='phase52-r1-root-') as directory:
    root = pathlib.Path(directory)
    root.chmod(0o755)
    hashes = {}
    def copy_file(src, dst):
        src = src.resolve()
        assert src.is_file() and stat.S_ISREG(src.stat().st_mode), src
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        dst.chmod(0o755 if os.access(src, os.X_OK) else 0o644)
        hashes[str(dst.relative_to(root))] = hashlib.sha256(dst.read_bytes()).hexdigest()
    def copy_tree(src, dst):
        actual = src.resolve()
        assert actual.is_relative_to(repo), actual
        if actual.is_dir():
            dst.mkdir(parents=True, exist_ok=True)
            for entry in actual.iterdir():
                copy_tree(entry, dst / entry.name)
        else:
            copy_file(actual, dst)
    for name in roots:
        copy_tree(repo / name, root / 'work' / name)
    copy_file(node, root / 'node/bin/node')
    libraries = subprocess.check_output(['/usr/bin/ldd', str(node)], text=True)
    for name in sorted(set(re.findall(r'/[^\s()]+', libraries))):
        copy_file(pathlib.Path(name), root / name.lstrip('/'))
    (root / 'tmp').mkdir(mode=0o1777)
    (root / 'tmp').chmod(0o1777)
    (root / 'dev').mkdir()
    os.mknod(root / 'dev/null', stat.S_IFCHR | 0o666, os.makedev(1, 3))
    (root / 'dev/null').chmod(0o666)
    # No runtime sockets, host /run, /proc, /sys, container binaries or credentials copied.
    env = {'PATH': '/node/bin', 'HOME': '/tmp', 'TMPDIR': '/tmp', 'LANG': 'C', 'PHASE52_DISPOSABLE_ROOT': '1'}
    command = ['/usr/bin/unshare', '--mount', '--net', '--pid', '--fork', '/usr/sbin/chroot',
               '--userspec=' + str(uid) + ':' + str(gid), str(root), '/node/bin/node',
               '/work/services/doghouse/tests/no-container-run.mjs']
    # chroot inherits cwd only until it switches to /; Node explicitly changes to /work.
    print(json.dumps({'allowlist': roots, 'runtime': str(node.relative_to(repo)),
                      'copiedFiles': len(hashes), 'copiedManifestSha256': hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest(),
                      'nodeSha256': hashes['node/bin/node'], 'hostSocketsCopiedOrProbed': False}), flush=True)
    result = subprocess.run(command, env=env, timeout=150, check=False)
    raise SystemExit(result.returncode)
