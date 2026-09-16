"""G6 design feasibility only; changes confinement solely in disposable children."""
import ctypes,errno,json,os,platform,resource,socket,struct,subprocess,sys,tempfile,time
from pathlib import Path
NODE=Path('/home/alica-dev/AlicaV2/.tools/node/bin/node').resolve()
def abi():
 c=ctypes.CDLL(None,use_errno=True);v=c.syscall(444,0,0,1);return {'value':v,'errno':ctypes.get_errno() if v<0 else 0}
def sandbox_child(allowed,denied,node):
 c=ctypes.CDLL(None,use_errno=True)
 def ok(v):
  if v<0:raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()))
 ok(c.prctl(38,1,0,0,0))
 # ABI >= 3: all filesystem rights through TRUNCATE, with read-only rules.
 class Ruleset(ctypes.Structure):_fields_=[('access',ctypes.c_uint64)]
 class Beneath(ctypes.Structure):_pack_=1;_fields_=[('access',ctypes.c_uint64),('parent',ctypes.c_int32)]
 access=(1<<15)-1;r=Ruleset(access);fd=c.syscall(444,ctypes.byref(r),ctypes.sizeof(r),0);ok(fd)
 paths=[(allowed,(1<<2)|(1<<3)),(node,1|(1<<2)),('/usr/lib',1|(1<<2)|(1<<3)),('/lib',1|(1<<2)|(1<<3)),('/lib64',1|(1<<2)|(1<<3)),('/etc/ld.so.cache',1<<2)]
 for path,rights in paths:
  p=Path(path).resolve()
  if not p.exists():continue
  pfd=os.open(p,os.O_PATH|os.O_CLOEXEC);b=Beneath(rights,pfd);ok(c.syscall(445,fd,1,ctypes.byref(b),0));os.close(pfd)
 ok(c.syscall(446,fd,0));os.close(fd)
 # Probe-only filter: architecture guard and deny socket(). NOT the proposed final filter.
 class Filter(ctypes.Structure):_fields_=[('code',ctypes.c_ushort),('jt',ctypes.c_ubyte),('jf',ctypes.c_ubyte),('k',ctypes.c_uint)]
 class Program(ctypes.Structure):_fields_=[('length',ctypes.c_ushort),('filters',ctypes.POINTER(Filter))]
 rows=[(0x20,0,0,4),(0x15,1,0,0xc000003e),(0x06,0,0,0x80000000),(0x20,0,0,0),(0x15,0,1,41),(0x06,0,0,0x50000|errno.EPERM),(0x06,0,0,0x7fff0000)]
 f=(Filter*len(rows))(*(Filter(*r) for r in rows));prog=Program(len(rows),f);ok(c.prctl(22,2,ctypes.byref(prog),0,0))
 resource.setrlimit(resource.RLIMIT_CORE,(0,0));resource.setrlimit(resource.RLIMIT_NOFILE,(64,64));resource.setrlimit(resource.RLIMIT_CPU,(5,5));resource.setrlimit(resource.RLIMIT_DATA,(512*1024*1024,512*1024*1024));resource.setrlimit(resource.RLIMIT_AS,(8*1024*1024*1024,8*1024*1024*1024))
 code="""const fs=require('node:fs'),net=require('node:net');const good=process.argv[1],bad=process.argv[2];const r={allowedRead:fs.readFileSync(good+'/ok','utf8')==='synthetic',environmentSanitized:process.env.G6_PROBE_SECRET===undefined};for(const [k,fn] of Object.entries({outsideRead:()=>fs.readFileSync(bad),outsideWrite:()=>fs.writeFileSync(bad,'x'),allowedWrite:()=>fs.writeFileSync(good+'/ok','x'),symlinkEscape:()=>fs.readFileSync(good+'/escape')})){try{fn();r[k]='UNEXPECTED_SUCCESS'}catch(e){r[k]=e.code}}const s=net.connect({host:'127.0.0.1',port:9});s.on('error',e=>{r.network=e.code;console.log(JSON.stringify(r));});"""
 os.execve(node,[node,'--jitless','--disable-wasm-trap-handler','--max-old-space-size=64','--openssl-config='+allowed+'/openssl.cnf','-e',code,allowed,denied],{'LANG':'C','TZ':'UTC'})
if len(sys.argv)>1 and sys.argv[1]=='child':sandbox_child(*sys.argv[2:]);raise SystemExit()
assert platform.machine()=='x86_64','Probe syscall numbers are x86_64-only'
r={'level':'DESIGN-FEASIBILITY-NOT-G6-QUALIFICATION','kernel':platform.release(),'architecture':platform.machine(),'uid':os.getuid(),'gid':os.getgid(),'landlock':abi(),'node':str(NODE)}
p=subprocess.run(['unshare','--user','--map-root-user','--mount','--net','--pid','--fork','true'],capture_output=True,text=True,timeout=5);r['unprivilegedNamespaces']={'returncode':p.returncode,'stderr':p.stderr.strip()}
with tempfile.TemporaryDirectory(prefix='alica-g6-probe-') as tmp:
 root=Path(tmp);allowed=root/'allowed';allowed.mkdir();(allowed/'ok').write_text('synthetic');(allowed/'openssl.cnf').write_text('');denied=root/'outside';denied.write_text('synthetic-outside');(allowed/'escape').symlink_to(denied)
 listener=socket.socket(socket.AF_UNIX);listener.settimeout(5);path=str(root/'peer.sock');listener.bind(path);os.chmod(path,0o600);listener.listen(1)
 child=subprocess.Popen([sys.executable,'-c',"import socket,sys;s=socket.socket(socket.AF_UNIX);s.connect(sys.argv[1]);s.sendall(b'forged-provider-name');s.recv(1)",path],env={'LANG':'C'},close_fds=True)
 try:
  conn,_=listener.accept();pid,uid,gid=struct.unpack('3i',conn.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12));name=conn.recv(64).decode();pfd=os.pidfd_open(child.pid);r['peerCredentials']={'actualPid':pid,'spawnPid':child.pid,'uid':uid,'gid':gid,'pidMatchesLaunchedChild':pid==child.pid,'claimedName':name,'pidfdOpened':True,'socketMode':oct(os.stat(path).st_mode&0o777)};os.close(pfd);conn.sendall(b'x');conn.close();child.wait(timeout=5)
 finally:
  if child.poll() is None:child.kill();child.wait()
  listener.close()
 if r['landlock']['value']>=3:
  env={**os.environ,'G6_PROBE_SECRET':'synthetic-not-a-real-secret'}
  p=subprocess.run([sys.executable,str(Path(__file__).resolve()),'child',str(allowed),str(denied),str(NODE)],env=env,capture_output=True,text=True,timeout=12)
  r['restrictedNode']={'returncode':p.returncode,'stdout':p.stdout.strip(),'stderr':p.stderr.strip()}
  if p.returncode==0:
   x=json.loads(p.stdout);r['restrictedNode']['checksPassed']=x['allowedRead'] and x['environmentSanitized'] and all(x[k]=='EACCES' for k in ['outsideRead','outsideWrite','allowedWrite','symlinkEscape']) and x['network']=='EPERM'
 else:r['restrictedNode']={'notRun':'Landlock ABI 3 required'}
r['limitations']=['Feature probes only; no production adapter, final syscall policy, transport equivalence or hostile-provider qualification.','Probe library-directory read permissions are broader than the proposed final runtime dependency closure.','No host-wide settings changed; confinement applied only to disposable child processes.']
print(json.dumps(r,indent=2))
