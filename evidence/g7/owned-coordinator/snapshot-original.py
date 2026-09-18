import os,sys,json,hashlib,subprocess,pathlib,stat
root=pathlib.Path.cwd(); exclude='evidence/g7/owned-coordinator/'
names=set(subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard']).decode().split('\0'))
for base in ('docs','evidence'):
 for p in (root/base).rglob('*'):
  if p.is_file(): names.add(str(p.relative_to(root)))
files={}
for n in sorted(names):
 if not n or n.startswith(exclude):continue
 p=root/n
 if p.is_file() and not p.is_symlink():
  s=p.stat(); files[n]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':s.st_size,'mode':stat.S_IMODE(s.st_mode)}
print(json.dumps({'head':subprocess.check_output(['git','rev-parse','HEAD']).decode().strip(),'status':subprocess.check_output(['git','status','--short']).decode(),'files':files},indent=2))
