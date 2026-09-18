from pathlib import Path
import hashlib,json,sys
r=Path(sys.argv[1] if len(sys.argv)>1 else '/home/herman/g7-implementation').resolve()
e=r/'evidence/g7/cross-process-reinstall'
excluded={'evidence/g7/cross-process-reinstall/delivery-manifest.json','evidence/g7/cross-process-reinstall/delivery-manifest.sha256'}
sources=json.loads((e/'full-final/allowlist.json').read_text())
paths=sorted(set(sources)|{str(p.relative_to(r)) for p in e.rglob('*') if p.is_file()})
files={}
for name in paths:
 if name in excluded: continue
 p=r/name
 if p.is_symlink(): raise RuntimeError(name)
 data=p.read_bytes();files[name]={'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'mode':p.stat().st_mode&0o777}
manifest={'purpose':'delivery integrity only; not custody authority, signing or acceptance','scope':'exact full-final allowlist plus regular files under cross-process-reinstall evidence','excludedSelfFiles':sorted(excluded),'files':files}
f=e/'delivery-manifest.json';f.write_text(json.dumps(manifest,indent=2)+'\n')
digest=hashlib.sha256(f.read_bytes()).hexdigest()
(e/'delivery-manifest.sha256').write_text(digest+'  '+str(f.relative_to(r))+'\n')
for name,binding in json.loads(f.read_text())['files'].items():
 p=r/name;data=p.read_bytes()
 assert len(data)==binding['bytes'] and hashlib.sha256(data).hexdigest()==binding['sha256'],name
print(json.dumps({'entries':len(files),'manifestSha256':digest,'verified':True}))
