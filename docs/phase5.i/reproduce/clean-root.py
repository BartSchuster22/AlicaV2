import os
from pathlib import Path
import subprocess,shutil,os,pwd,json,hashlib,re,stat
b=Path(os.environ['PHASE5I_PUBLIC_BASE']);e=b/'build-evidence';r=b/'clean-public-source';i=json.loads((e/'clean-inputs-result.json').read_text());root=b/'reference/clean-reproduction-r2';u=pwd.getpwnam('alica-phase5i-ref');assert not root.exists();assert shutil.disk_usage(b).free>4*1024**3;root.mkdir()
# Only freshly fetched/built public sources and separately declared OS/toolchain inputs.
shutil.copytree(r,root/'work',symlinks=False,ignore=shutil.ignore_patterns('.git'))
shutil.copytree(i['external'],root/'external',symlinks=False);(root/'external').chmod(0o755) # mkdtemp public package output must be traversable by runtime UID.
shutil.copytree(b/'tools/node-v24.21.0-linux-x64',root/'node',symlinks=True)
for source in [Path(i['freshSources']['H']),Path(i['freshSources']['K']),Path('/home/alica-dev/.local/share/uv/python/cpython-3.14.7-linux-x86_64-gnu')]:
 dest=root/str(source).lstrip('/');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copytree(source,dest,symlinks=False)
shutil.copytree(i['MemoryPython'],root/'work/.tools/memory-python',symlinks=False)
shutil.copytree('/usr/lib/python3.12',root/'usr/lib/python3.12',symlinks=False)
(root/'usr/bin').mkdir(parents=True,exist_ok=True)
for name in ['python3','python3.12','git','setpriv','env']:shutil.copy2('/usr/bin/'+name,root/'usr/bin'/name)
libs=set();elf=[root/'node/bin/node',*list((root/'usr/bin').iterdir()),*root.rglob('*.so')]
for f in elf:
 q=subprocess.run(['/usr/bin/ldd',str(f)],capture_output=True,text=True)
 for x in re.findall(r'(?:=>\s+|^\s*)(/[^\s]+)',q.stdout,re.M):
  if not x.startswith(str(root)) and Path(x).is_file():libs.add(x)
for x in sorted(libs):
 dest=root/x.lstrip('/');dest.parent.mkdir(parents=True,exist_ok=True)
 if not dest.exists():shutil.copy2(x,dest)
 else:assert hashlib.sha256(dest.read_bytes()).digest()==hashlib.sha256(Path(x).read_bytes()).digest()
for n in ['tmp','state','evidence','proc','etc','dev','tmp/h-home/.hermes','tmp/h-tmp','work/phase5i']:(root/n).mkdir(parents=True,exist_ok=True)
(root/'etc/passwd').write_text(f'reference:x:{u.pw_uid}:{u.pw_gid}:Reference:/state/user:/bin/false\n');(root/'etc/group').write_text(f'reference:x:{u.pw_gid}:\n');(root/'etc/hosts').write_text('127.0.0.1 localhost\n');(root/'etc/nsswitch.conf').write_text('hosts: files\npasswd: files\ngroup: files\n');os.mknod(root/'dev/null',stat.S_IFCHR|0o666,os.makedev(1,3));(root/'dev/null').chmod(0o666)
# Explicit new composition callers only; no home, credentials, state, caches or private runtime files copied.
previous=Path(os.environ['PHASE5I_RELEASE_DIR'])/'proof'
for name in ['domain-cycle.mjs','whole-qualifier.py','k-qualifier.py']:
 s=(previous/name).read_text().replace('/home/alica-dev/phase5i/upstream-H',i['freshSources']['H']).replace('/home/alica-dev/phase5i/upstream-K',i['freshSources']['K']);(root/'work/phase5i'/name).write_text(s)
# Recreate public external caller derivation from the fresh package, not old runtime state.
p=(root/'external/operator/operator.mjs').read_text().replace("from './host-fixture.mjs'","from '/external/operator/host-fixture.mjs'").replace("new URL('./","new URL('/external/operator/")
p=p.replace("const directory=mode==='normal'?mkdtempSync(join(tmpdir(),'phase50-external-records-')):process.argv[3];","const directory='/state/domain/p2';").replace("console.log('CRASH_READY');await new Promise(()=>{setInterval(()=>{},1000);});","console.log('P2_COMPLETED_WRITE_AND_CLEAN_STOP');")
(root/'external/operator/phase5i-cycle.mjs').write_text(p)
for n in ['tmp','state','evidence']:
 for p in [root/n,*(root/n).rglob('*')]:os.chown(p,u.pw_uid,u.pw_gid)
manifest={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()};(e/'clean-root-r2-prelaunch-manifest.json').write_text(json.dumps(manifest,sort_keys=True)+'\n')
assert not list((root/'state').iterdir());assert not (root/'tmp/h-home/.hermes/config.yaml').exists()
result={'status':'PREPARED_NOT_EXECUTED','root':str(root),'source':'fresh anonymous public checkout+fresh npm build+separate fresh frozen H/K installs+fresh Memory requirements install','oldStateHomeCredentialsCopied':False,'onlyOldFilesUsed':'explicit new composition caller source, path substitutions only; separately owned toolchain/OS prerequisites','stateEntries':0,'HhomeEmpty':True,'fileCount':len(manifest),'staticManifestSha256':hashlib.sha256((e/'clean-root-r2-prelaunch-manifest.json').read_bytes()).hexdigest()};(e/'clean-root-r2-preparation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
