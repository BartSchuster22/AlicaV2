import hashlib,json,os,pathlib,subprocess,sys,time
root=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); out.mkdir(parents=True,exist_ok=False)
def run(*args): return subprocess.check_output(args,cwd=root)
files=sorted(set(run('git','ls-files','-z','--cached','--others','--exclude-standard').decode().split('\0'))-{''})
items={}
for name in files:
 p=root/name
 if p.is_symlink(): items[name]={'symlink':os.readlink(p)}
 elif p.is_file():
  b=p.read_bytes(); items[name]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
(out/'inventory.json').write_text(json.dumps(items,indent=2)+'\n')
(out/'head.txt').write_bytes(run('git','rev-parse','HEAD'))
(out/'status.txt').write_bytes(run('git','status','--short'))
(out/'processes.txt').write_bytes(run('ps','-eo','pid,ppid,etime,args'))
(out/'host.txt').write_bytes(run('uname','-a'))
(out/'time.txt').write_text(str(time.time())+'\n')
print(json.dumps({'root':str(root),'entries':len(items),'output':str(out)}))
