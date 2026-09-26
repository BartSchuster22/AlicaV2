import sys,os,resource,subprocess,time,json
from pathlib import Path
root=Path(__file__).resolve().parent
os.chdir(root)
def accounting():
 scope=root.parent
 b=scope.lstat().st_size;n=1
 for path,dirs,files in os.walk(scope):
  for name in dirs+files:s=os.lstat(os.path.join(path,name));b+=s.st_size;n+=1
 assert b<30000000 and n<450,(b,n)
 return dict(bytesIncludingDirectoriesAndRoot=b,entriesIncludingRoot=n)
def limits():
 for k,v in [(resource.RLIMIT_CPU,20),(resource.RLIMIT_AS,2147483648),(resource.RLIMIT_NOFILE,64),(resource.RLIMIT_FSIZE,65536),(resource.RLIMIT_CORE,0)]:resource.setrlimit(k,(v,v))
label=sys.argv[1];kind=sys.argv[2];args=sys.argv[3:];accounting()
cmd=(["/usr/bin/python3","-B"] if kind=="python" else ["/home/alica-dev/g7-preflight-repair-dev/toolchain/node","--jitless","--experimental-vm-modules","--max-old-space-size=256"])+args
start=time.monotonic();before=resource.getrusage(resource.RUSAGE_CHILDREN)
with (root/(label+".log")).open("xb") as out:
 p=subprocess.Popen(cmd,stdin=subprocess.DEVNULL,stdout=out,stderr=subprocess.STDOUT,preexec_fn=limits,env={"PATH":"/usr/bin:/bin","HOME":str(root),"TMPDIR":str(root),"NODE_NO_WARNINGS":"1","PYTHONDONTWRITEBYTECODE":"1"})
 try:p.wait(timeout=30)
 except subprocess.TimeoutExpired:
  p.terminate()
  try:p.wait(timeout=5)
  except subprocess.TimeoutExpired:p.kill();p.wait()
after=resource.getrusage(resource.RUSAGE_CHILDREN)
r={"exit":p.returncode,"wallSeconds":time.monotonic()-start,"measuredDirectChildCPU":after.ru_utime+after.ru_stime-before.ru_utime-before.ru_stime,"logBytes":(root/(label+".log")).stat().st_size,"accounting":accounting(),"containment":"per-process rlimits; audited no child/network tests, NOT aggregate tree or OS isolation certification"}
(root/(label+".json")).write_text(json.dumps(r)+"\n")
print(json.dumps(r));print((root/(label+".log")).read_text());sys.exit(p.returncode)
