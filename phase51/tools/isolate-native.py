"""Finite native no-container qualification. Fixture-only chroot; no service or production state."""
from pathlib import Path
import json,os,pwd,re,shutil,subprocess,tempfile
repo=Path(__file__).resolve().parents[2]
assert os.geteuid()==0
owner=pwd.getpwuid(repo.stat().st_uid)
assert owner.pw_uid!=0, 'fixture repository must belong to an unprivileged operator'
node=Path(os.environ.get('NODE_BINARY') or shutil.which('node') or '')
assert node.is_file() and node.is_absolute(), 'explicit native Node binary required'
root=Path(tempfile.mkdtemp(prefix='phase51-native-',dir=repo.parent))
try:
    work=root/'work';work.mkdir();(root/'node/bin').mkdir(parents=True)
    for name in ['services/memoryv4','service-foundation','catalog','node_modules','phase51/consumer']:
        shutil.copytree(repo/name,work/name,symlinks=False,ignore=shutil.ignore_patterns('__pycache__','.pytest_cache'))
    shutil.copytree(repo/'.tools/memory-python',root/'python',symlinks=False)
    shutil.copytree('/usr/lib/python3.12',root/'usr/lib/python3.12',symlinks=False)
    (root/'usr/bin').mkdir(parents=True);shutil.copy2('/usr/bin/python3.12',root/'usr/bin/python3.12');shutil.copy2('/usr/bin/python3.12',root/'usr/bin/python3')
    (work/'.tools').mkdir();(work/'.tools/memory-python').symlink_to('/python')
    shutil.copy2(node,root/'node/bin/node')
    binaries=[root/'node/bin/node',root/'usr/bin/python3.12',*list((root/'usr/lib/python3.12').rglob('*.so')),*list((root/'python').rglob('*.so'))]
    libraries=set()
    for binary in binaries:
        output=subprocess.run(['/usr/bin/ldd',str(binary)],capture_output=True,text=True,check=True).stdout
        libraries.update(re.findall(r'/[^\s()]+',output))
    for library in libraries:
        src=Path(library);dst=root/library.lstrip('/');dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
    (root/'dev').mkdir();os.mknod(root/'dev/null',0o20666,os.makedev(1,3))
    (root/'tmp').mkdir()
    for directory,_,files in os.walk(root):
        Path(directory).chmod(0o755)
        for name in files:
            p=Path(directory)/name
            if not p.is_symlink():p.chmod(0o755 if os.access(p,os.X_OK) else 0o644)
    (root/'tmp').chmod(0o1777);(root/'dev/null').chmod(0o666)
    assert not (root/'run').exists() and not (root/'var/run').exists()
    cmd=['/usr/bin/unshare','--mount','--net','--pid','--fork','/usr/sbin/chroot','--userspec='+str(owner.pw_uid)+':'+str(owner.pw_gid),str(root),'/node/bin/node','--experimental-vm-modules','--test','/work/services/memoryv4/test-v2.mjs']
    env={'PATH':'/node/bin:/python/bin','HOME':'/tmp','TMPDIR':'/tmp','LANG':'C','PHASE51_NATIVE_ISOLATED':'1'}
    p=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=120)
    report={'command':cmd,'environment':'empty plus allowlisted native paths','containerExecutableIncluded':False,'daemonSocketsIncluded':False,'productionConfigIncluded':False,'networkNamespace':'new isolated','unprivilegedUid':owner.pw_uid,'exitCode':p.returncode}
    output=json.dumps(report)+'\n'+p.stdout+p.stderr
    (repo/'docs/phase5.1/evidence/native-v2.log').write_text(output);print(output)
    assert p.returncode==0
    pycmd=cmd[:cmd.index('/node/bin/node')]+['/work/.tools/memory-python/bin/python','-I','-m','pytest','-q','--tb=short','-o','cache_dir=/tmp/pytest-cache','/work/services/memoryv4/tests']
    # Reuse the same no-container root/UID/namespaces, with an explicit disposable bootstrap store.
    penv={**env,'MEMORYV4_DB_PATH':'/tmp/native-http-bootstrap.sqlite3','MEMORYV4_API_KEYS':'{}'}
    q=subprocess.run(pycmd,env=penv,capture_output=True,text=True,timeout=180)
    qresult={**report,'command':pycmd,'suite':'native-python-domain-store-http-portability','exitCode':q.returncode}
    (repo/'docs/phase5.1/evidence/native-python.log').write_text(json.dumps(qresult)+'\n'+q.stdout+q.stderr)
    print(json.dumps(qresult));print(q.stdout+q.stderr)
    assert q.returncode==0
finally:
    shutil.rmtree(root)
