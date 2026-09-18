import os,sys,json,hashlib,subprocess
from pathlib import Path
r=Path(sys.argv[1]); prefix='evidence/g7/cross-process-reinstall/'
paths=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=r).decode().split('\0')
files={}
for p in sorted(set(paths)):
 if not p or p.startswith(prefix): continue
 f=r/p
 if f.is_file() and not f.is_symlink():
  b=f.read_bytes(); files[p]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
print(json.dumps({'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip(),'files':files},indent=2))
