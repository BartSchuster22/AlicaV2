#!/usr/bin/env python3
"""Bounded Phase5.I operator reproducer. Requires a dedicated supported Linux host."""
from pathlib import Path
import argparse,hashlib,json,os,platform,pwd,re,shutil,subprocess,sys,tarfile,urllib.request,zipfile
release=Path(__file__).resolve().parent
pins=json.loads((release/'REPRODUCER-INPUTS.json').read_text())
parser=argparse.ArgumentParser();group=parser.add_mutually_exclusive_group(required=True);group.add_argument('--base');group.add_argument('--bounded-existing');args=parser.parse_args()
b=Path(args.base or args.bounded_existing)
assert b.is_absolute() and b.parent==Path('/home/alica-dev') and b.name.startswith('phase5i-public-') and not b.is_symlink(),'dedicated direct child /home/alica-dev/phase5i-public-* required'
assert os.geteuid()==0 and platform.machine()=='x86_64','root operator on dedicated x86_64 Linux required; app drops privileges'
assert 'VERSION_ID="24.04"' in Path('/etc/os-release').read_text(),'qualified Ubuntu24.04 profile only'
dev=pwd.getpwnam('alica-dev');runtime=pwd.getpwnam('alica-phase5i-ref');assert runtime.pw_uid!=0 and dev.pw_uid!=0
for command in ['git','unshare','mount','chroot','setpriv','ip','ldd','runuser']:assert shutil.which(command),command
assert subprocess.check_output(['/usr/bin/python3.12','--version'],text=True).strip()=='Python '+pins['memoryPython']
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def download(url,p):
 with urllib.request.urlopen(url,timeout=90) as response,p.open('xb') as f:shutil.copyfileobj(response,f)
def enclosure():
 s=(release/'proof/executed-whole-enclosure.py').read_text()
 s=re.sub(r"^r=.*$",'r='+repr(str(b/'reference/integrated-candidate')),s,flags=re.M)
 s=s.replace('/home/alica-dev/phase5i/upstream-K',str(b/'upstream-K'))
 s=re.sub(r'--reuid=\d+','--reuid='+str(runtime.pw_uid),s);s=re.sub(r'--regid=\d+','--regid='+str(runtime.pw_gid),s)
 compile(s,'enclosure','exec');return s
if args.base:
 assert not b.exists(),'fresh base required; failed attempts are retained, never reset by this tool'
 assert shutil.disk_usage(b.parent).free>9*1024**3,'at least 9GiB free required; no automatic cleanup'
 b.mkdir();os.chown(b,dev.pw_uid,dev.pw_gid)
 for n in ['downloads','tools','build-evidence','reference']:(b/n).mkdir();os.chown(b/n,dev.pw_uid,dev.pw_gid)
 archive=b/'downloads/node-v24.21.0-linux-x64.tar.xz';download('https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64.tar.xz',archive);assert sha(archive)==pins['nodeArchiveSha256']
 with tarfile.open(archive) as t:t.extractall(b/'tools',filter='data')
 with urllib.request.urlopen('https://pypi.org/pypi/uv/'+pins['uvVersion']+'/json',timeout=60) as response:metadata=json.load(response)
 wheels=[x for x in metadata['urls'] if x['filename'].endswith('.whl') and 'manylinux' in x['filename'] and 'x86_64' in x['filename']];assert wheels
 wheel=sorted(wheels,key=lambda x:x['filename'])[0];wp=b/'downloads'/wheel['filename'];download(wheel['url'],wp);assert sha(wp)==wheel['digests']['sha256']
 with zipfile.ZipFile(wp) as z:
  names=[x for x in z.namelist() if x.endswith('/uv')];assert len(names)==1;uvbytes=z.read(names[0])
 assert hashlib.sha256(uvbytes).hexdigest()==pins['uvBinarySha256'];(b/'tools/uv').mkdir();uv=b/'tools/uv/uv';uv.write_bytes(uvbytes);uv.chmod(0o755)
 py=Path('/home/alica-dev/.local/share/uv/python/cpython-3.14.7-linux-x86_64-gnu/bin/python3.14')
 if not py.exists():
  subprocess.run(['runuser','-u','alica-dev','--','env','-i','PATH=/usr/bin:/bin','HOME=/home/alica-dev','UV_NO_CONFIG=1','UV_CACHE_DIR='+str(b/'python-setup-cache'),str(uv),'python','install',pins['hermesPython']],check=True,timeout=300)
 assert subprocess.check_output([str(py),'--version'],text=True).strip()=='Python '+pins['hermesPython']
 (b/'build-evidence/whole-enclosure-source.py').write_text(enclosure())
 env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8','PHASE5I_PUBLIC_BASE':str(b),'PHASE5I_RELEASE_DIR':str(release)}
 for stage in ['clean-public-build','clean-inputs','clean-root','clean-run','review-closures']:
  out=b/'build-evidence'/('entry-'+stage+'.log')
  with out.open('x') as f:p=subprocess.run(['/usr/bin/python3',str(release/'reproduce'/f'{stage}.py')],env=env,stdout=f,stderr=subprocess.STDOUT,timeout=900)
  print(stage,p.returncode,str(out),flush=True)
  assert p.returncode==0,stage+' failed; original log retained'
 evidence=b/'build-evidence'
 for name in ['clean-reproduction-result.json','review-closures-result.json']:assert json.loads((evidence/name).read_text())['status']=='PASS'
 result={'status':'PASS','base':str(b),'mode':'FULL_FRESH_PUBLIC_INPUTS','pins':pins,'sourceFirstInstanceStateCopied':False,'DSH2':False,'environment':'fresh isolated root on host identified by operator; qualification execution on DEV','payloadManifestSha256':sha(evidence/'clean-root-r2-prelaunch-manifest.json'),'reproducerFiles':{str(p.relative_to(release)):sha(p) for p in [release/'reproduce.py',*(release/'reproduce').iterdir(),*(release/'proof').iterdir()] if p.is_file()},'closedLiveProviderCalls':0,'controlEffects':0,'ownerAcceptance':False}
 (evidence/'standalone-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
else:
 # Public-source bounded replay uses only previously qualified, hash-bound immutable inputs
 # and the designated reference state, never an undisclosed first-instance home.
 e=b/'build-evidence';old=json.loads((e/'standalone-result.json').read_text());assert old['status']=='PASS' and old['pins']==pins
 for name,h in old['reproducerFiles'].items():assert sha(release/name)==h,name
 manifest=e/'clean-root-r2-prelaunch-manifest.json';assert sha(manifest)==old['payloadManifestSha256'];root=b/'reference/clean-reproduction-r2'
 for name,h in json.loads(manifest.read_text()).items():
  if name.split('/')[0] not in ['tmp','state','evidence']:assert sha(root/name)==h,name
 source=enclosure().replace(str(b/'reference/integrated-candidate'),str(root)).replace(str(b/'upstream-K'),str(b/'clean-inputs/K'))
 env={'PATH':'/node/bin:'+str(b/'clean-inputs/K/.venv/bin')+':/usr/bin:/bin','HOME':'/state/user','HERMES_HOME':'/state/hermes','PYTHONDONTWRITEBYTECODE':'1','HERMES_GUEST_ONBOARDING':'0','LANG':'C.UTF-8'}
 out=e/'public-bounded.log'
 with out.open('x') as f:p=subprocess.run(['/usr/bin/unshare','--mount','--net','--pid','--ipc','--uts','--fork','--kill-child=SIGKILL','/usr/bin/python3','-c',source,'read'],env=env,stdout=f,stderr=subprocess.STDOUT,timeout=300)
 assert p.returncode==0,'bounded public read/restart failed; log retained'
 result=json.loads((root/'evidence/whole-read-result.json').read_text());assert result['functional']
 for key in ['dispatch','assignment','workers','runs','termination']:assert result[key]==0
 assert not subprocess.run(['ps','-u',str(runtime.pw_uid),'-o','pid='],capture_output=True,text=True).stdout.strip()
 receipt={'status':'PASS','mode':'ANONYMOUS_PUBLIC_SOURCE_BOUNDED_REPRODUCTION','reproducerFilesVerified':old['reproducerFiles'],'immutablePayloadVerified':True,'sameDesignatedState':True,'result':result,'ownerAcceptance':False}
 (e/'public-bounded-result.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
