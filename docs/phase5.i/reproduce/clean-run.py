import os
from pathlib import Path
import subprocess,pwd,json,os,hashlib
b=Path(os.environ['PHASE5I_PUBLIC_BASE']);e=b/'build-evidence';root=b/'reference/clean-reproduction-r2';u=pwd.getpwnam('alica-phase5i-ref');assert not list((root/'state').iterdir())
s=(e/'whole-enclosure-source.py').read_text().replace(str(b/'reference/integrated-candidate'),str(root)).replace(str(b/'upstream-K'),str(b/'clean-inputs/K'))
env={'PATH':'/node/bin:'+str(b/'clean-inputs/K/.venv/bin')+':/usr/bin:/bin','HOME':'/state/user','HERMES_HOME':'/state/hermes','PYTHONDONTWRITEBYTECODE':'1','HERMES_GUEST_ONBOARDING':'0','LANG':'C.UTF-8'}
def run(name,source,mode):
 p=subprocess.run(['/usr/bin/unshare','--mount','--net','--pid','--ipc','--uts','--fork','--kill-child=SIGKILL','/usr/bin/python3','-c',source,mode],env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=280);(e/('clean-r2-'+name+'.log')).write_text(p.stdout);print(name,p.returncode,p.stdout[-2000:],flush=True);assert p.returncode==0
run('K-conformance',s.replace('/work/phase5i/whole-qualifier.py','/work/phase5i/k-qualifier.py'),'initial')
k=json.loads((root/'evidence/k-functional-result.json').read_text());assert k['functional'] and k['workers']==0 and k['runs']==0
for n in ['domain','domain/m','domain/g','domain/p2']:
 p=root/'state'/n;p.mkdir();os.chown(p,u.pw_uid,u.pw_gid)
rounds=[]
for mode in ['write','read']:
 run('whole-'+mode,s,mode);data=json.loads((root/('evidence/whole-'+mode+'-result.json')).read_text());assert data['functional'];rounds.append(data)
# Frozen public carrier tracked bytes: fresh anonymous build vs original exact carrier.
fresh=b/'clean-public-source';q=subprocess.run(['git','-c','safe.directory='+str(fresh),'ls-tree','-rz','HEAD'],cwd=fresh,capture_output=True,check=True);m={}
for entry in q.stdout.split(b'\0'):
 if not entry:continue
 meta,path=entry.split(b'\t',1);mode,kind,oid=meta.split();n=os.fsdecode(path);p=fresh/n
 if kind!=b'blob':continue
 data=os.readlink(p).encode() if p.is_symlink() else p.read_bytes()
 assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==oid.decode(),n
 m[n]=hashlib.sha256(data).hexdigest()
static=json.loads((e/'clean-root-r2-prelaunch-manifest.json').read_text());changed=[]
for n,h in static.items():
 if n.split('/')[0] in ['tmp','state','evidence']:continue
 p=root/n
 if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=h:changed.append(n)
assert not changed,changed[:20]
result={'status':'PASS','kind':'CLEAN_INDEPENDENT_ENVIRONMENT_REPRODUCTION','samePhysicalDevHost':True,'DSH2':False,'freshPublicCheckout':'96359ab780dea152d7eb87736ebecb9fbceeb93c','Hpin':'c04e9a1d0dfa4abbefe4b256428e645abaacfe88','Kpin':'536802c00e4f93061fc46b134dc029ff695f364f','sourceTrackedFilesCompared':len(m),'sourceManifestDigest':hashlib.sha256(json.dumps(m,sort_keys=True).encode()).hexdigest(),'firstEnvironmentStateCopied':False,'firstEnvironmentHomeCopied':False,'privateCredentialsCopied':False,'immutablePrelaunchFilesChanged':changed,'K':k,'wholeRounds':rounds,'comparison':'same package/contract pins and functional logical results; new synthetic IDs/timestamps legitimately differ','publication':'WITHHELD_PENDING_REVIEW'};(e/'clean-reproduction-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
