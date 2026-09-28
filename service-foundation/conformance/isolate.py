#!/usr/bin/env python3
"""Bounded qualification launcher. No service/container startup or shared changes.
Builds an allowlisted native root, then drops to repo owner's uid/gid inside a new
mount/network/PID namespace and chroot. Not a product deployment/supervisor API.
"""
import os
import pathlib
import pwd
import re
import shutil
import subprocess
import tempfile

repo = pathlib.Path(__file__).resolve().parents[2]
node = pathlib.Path('/home/alica-dev/AlicaV2/.tools/node-v24.21.0-linux-x64/bin/node')
assert os.geteuid() == 0, 'isolated native qualification requires root namespace/chroot privilege'
owner = pwd.getpwnam('alica-dev')
root = pathlib.Path(tempfile.mkdtemp(prefix='phase50-native-', dir='/home/alica-dev'))
external = None
try:
    prepared = subprocess.check_output(['/usr/bin/unshare', '--net', '/usr/bin/sudo', '-u', 'alica-dev', '/usr/bin/env',
        'PATH=' + str(node.parent) + ':/usr/bin:/bin', str(node),
        str(repo / 'service-foundation/conformance/prepare-external.mjs')], text=True, timeout=180)
    import json
    external = pathlib.Path(json.loads(prepared)['root'])
    assert external.parent == pathlib.Path('/home/alica-dev') and external.name.startswith('phase50-external-')
    root.chmod(0o755)
    shutil.copytree(external, root / 'external', symlinks=False)
    work = root / 'work'
    work.mkdir()
    for name in ['service-foundation', 'catalog', 'node_modules']:
        shutil.copytree(repo / name, work / name, symlinks=False)
    # node_modules @alica links were dereferenced; no source/internal imports needed.
    (root / 'node/bin').mkdir(parents=True)
    shutil.copy2(node, root / 'node/bin/node')
    dependencies = subprocess.check_output(['/usr/bin/ldd', str(node)], text=True)
    for library in sorted(set(re.findall(r'/[^\s()]+', dependencies))):
        src = pathlib.Path(library)
        assert src.is_file(), library
        destination = root / library.lstrip('/')
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, destination)
    (root / 'tmp').mkdir(mode=0o1777)
    (root / 'tmp').chmod(0o1777)
    # Everything copied is readable; only /tmp is writable by the native author.
    for directory, subdirs, files in os.walk(root):
        pathlib.Path(directory).chmod(0o755)
        for filename in files:
            p = pathlib.Path(directory) / filename
            p.chmod(0o755 if os.access(p, os.X_OK) else 0o644)
    (root / 'tmp').chmod(0o1777)
    command = ['/usr/bin/unshare', '--mount', '--net', '--pid', '--fork',
               '/usr/sbin/chroot', '--userspec=' + str(owner.pw_uid) + ':' + str(owner.pw_gid),
               str(root), '/node/bin/node', '--experimental-vm-modules',
               '/work/service-foundation/conformance/native-run.mjs']
    print('ISOLATED_NATIVE_COMMAND', command, flush=True)
    result = subprocess.run(command, env={'PATH': '/node/bin', 'HOME': '/tmp', 'TMPDIR': '/tmp', 'LANG': 'C'},
                            timeout=120, check=False)
    raise SystemExit(result.returncode)
finally:
    shutil.rmtree(root)
    if external is not None and external.parent == pathlib.Path('/home/alica-dev') and external.name.startswith('phase50-external-'):
        shutil.rmtree(external)
