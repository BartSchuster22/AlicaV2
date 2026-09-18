import pathlib, subprocess, json, hashlib, shlex, tarfile, io
R=pathlib.Path('/home/herman/g7-implementation')
E=R/'evidence/g7/recovery-completion'
SSH=['ssh','-i','/home/herman/.ssh/alica_v2_vps_ed25519','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=/home/herman/.ssh/alica_v2_known_hosts','alica-dev@167.233.135.142']
V=E/'verification'
V.mkdir(exist_ok=False)
source=['tools/g7-cell.mjs','tests/g7/serving-driver.mjs','tests/g7/serving-continuation.test.mjs','tools/g7-runtime-dependencies.mjs','tests/g7/runtime-dependencies.test.mjs']
basechanged=set(source[:3])
code='''import pathlib,hashlib,json,os,subprocess,sys
root=pathlib.Path(sys.argv[1]); baseline=pathlib.Path(sys.argv[2])
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
old=json.loads((baseline/'inventory.json').read_text()); changed=[]; missing=[]
for n,v in old.items():
 p=root/n
 if not p.exists() and not p.is_symlink(): missing.append(n)
 elif 'symlink' in v:
  if not p.is_symlink() or os.readlink(p)!=v['symlink']: changed.append(n)
 elif not p.is_file() or p.is_symlink() or sha(p)!=v['sha256']: changed.append(n)
raw=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=root)
new=sorted(set(raw.decode().split('\\0'))-set(old)-{''})
after={}
for n in sorted(set(raw.decode().split('\\0'))-{''}):
 p=root/n
 if p.is_symlink(): after[n]={'symlink':os.readlink(p)}
 elif p.is_file(): after[n]={'bytes':p.stat().st_size,'sha256':sha(p)}
print(json.dumps({'afterInventory':after,'baselineEntries':len(old),'baselineFiles':{p.name:sha(p) for p in baseline.iterdir() if p.is_file()},'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'changed':changed,'missing':missing,'new':new}))
'''
local=json.loads(subprocess.check_output(['python3','-c',code,str(R),'/home/herman/g7-recovery-local-baseline']))
remote=json.loads(subprocess.check_output(SSH+['python3 -c '+shlex.quote(code)+' /home/alica-dev/AlicaV2 /home/alica-dev/g7-recovery-remote-baseline']))
for name,data in [('local',local),('remote',remote)]:
 (V/(name+'-preservation.json')).write_text(json.dumps(data,indent=2)+'\n')
 assert not data['missing'], (name,data['missing'])
 assert set(data['changed'])==basechanged, (name,data['changed'])
 assert data['head']=='a314e56a17958fa7befa0d07b90b8327c8e2fd0c'
 for n in data['new']:
  assert n in source or n.startswith('evidence/g7/recovery-completion/') or n in ['docs/g7/R1-RECOVERY-COMPLETION.md','docs/g7/R1-RECOVERY-COMPLETION-EXECUTION.md'], (name,n)
allsource=source+['docs/g7/R1-RECOVERY-COMPLETION.md','docs/g7/R1-RECOVERY-COMPLETION-EXECUTION.md']
remotehashes=subprocess.check_output(SSH+['cd /home/alica-dev/AlicaV2 && sha256sum '+' '.join(allsource)])
(V/'remote-source.sha256').write_bytes(remotehashes)
localhashes={n:hashlib.sha256((R/n).read_bytes()).hexdigest() for n in allsource}
for line in remotehashes.decode().splitlines():
 h,n=line.split(maxsplit=1); assert h==localhashes[n], n
(V/'local-source.json').write_text(json.dumps(localhashes,indent=2)+'\n')
for name in ['final-focused-corrected','full-check']:
 p=E/name/'returned/evidence/g7/recovery-completion'/name
 for phase in ['before','after']:
  for line in (p/('remote-'+phase+'.sha256')).read_text().splitlines():
   h,n=line.split(maxsplit=1); assert h==localhashes[n], (name,phase,n)
 assert (p/'exit.txt').read_text().strip()=='0'
for side,command in [('local',['git','-C',str(R),'status','--short']),('remote',SSH+['cd /home/alica-dev/AlicaV2 && git status --short'])]:
 (V/(side+'-status.txt')).write_bytes(subprocess.check_output(command))
for side,command in [('local',['git','-C',str(R),'diff','--binary']),('remote',SSH+['cd /home/alica-dev/AlicaV2 && git diff --binary'])]:
 (V/(side+'.diff')).write_bytes(subprocess.check_output(command))
assert (V/'local.diff').read_bytes()==(V/'remote.diff').read_bytes()
paths=['native/g6/build/receipt.json','native/g6/build/bridge.node','native/g6/build/launcher','native/g7/build/receipt.json','native/g7/build/ownership.node']
data=subprocess.check_output(SSH+['cd /home/alica-dev/AlicaV2 && tar -cf - '+' '.join(paths)])
(V/'native.tar').write_bytes(data)
t=tarfile.open(fileobj=io.BytesIO(data)); assert set(t.getnames())==set(paths)
for m in t.getmembers():
 assert m.isfile(); p=V/'native'/m.name; p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(t.extractfile(m).read())
g6=json.loads((V/'native/native/g6/build/receipt.json').read_text()); g7=json.loads((V/'native/native/g7/build/receipt.json').read_text())
for n,h in g6['artifacts'].items(): assert hashlib.sha256((V/'native/native/g6/build'/n).read_bytes()).hexdigest()==h
assert hashlib.sha256((V/'native/native/g7/build/ownership.node').read_bytes()).hexdigest()==g7['outputSha256']
inputs=dict(g6['sources'])
for n,h in g7['inputs'].items():
 assert n not in inputs or inputs[n]==h
 inputs[n]=h
input_code="import pathlib,hashlib,json; r=pathlib.Path('/home/alica-dev/AlicaV2'); print(json.dumps({n:hashlib.sha256((r/n).read_bytes()).hexdigest() for n in "+repr(list(inputs))+"}))"
actual_inputs=json.loads(subprocess.check_output(SSH+['python3 -c '+shlex.quote(input_code)]))
assert actual_inputs==inputs, 'native input receipt drift'
(V/'native-inputs.json').write_text(json.dumps(actual_inputs,indent=2)+'\n')
(V/'remote-processes.txt').write_bytes(subprocess.check_output(SSH+['ps -u alica-dev -o pid,ppid,etime,args']))
(V/'local-processes.txt').write_bytes(subprocess.check_output(['ps','-eo','pid,ppid,etime,args']))
log=pathlib.Path('/home/herman/g7-recovery-completion-run.log')
assert hashlib.sha256(log.read_bytes()).hexdigest()=='4a706c8b28342c9513c74d00fec590c38b6767e0e34c6f49c6e9ec4253683e6e'
evidence_code="import pathlib,hashlib,json; r=pathlib.Path('/home/alica-dev/AlicaV2/evidence/g7/recovery-completion'); print(json.dumps({str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in r.rglob('*') if p.is_file()}))"
remote_evidence=json.loads(subprocess.check_output(SSH+['python3 -c '+shlex.quote(evidence_code)]))
for name,h in remote_evidence.items():
 run=name.split('/')[0]
 p=E/run/'returned/evidence/g7/recovery-completion'/name
 assert p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==h, name
(V/'remote-evidence.json').write_text(json.dumps(remote_evidence,indent=2)+'\n')
for name in ['g7-recovery-run.py','g7-recovery-verify.py','g7-recovery-capture.py']:
 (V/name).write_bytes((pathlib.Path('/home/herman')/name).read_bytes())
cli=E/'subassembly-cli/returned/evidence/g7/recovery-completion/subassembly-cli/dependencies/sbom/dependencies.json'
qualified=E/'full-check/returned/evidence/g7/recovery-completion/full-check/dependencies/subassembly/sbom/dependencies.json'
assert cli.read_bytes()==qualified.read_bytes(), 'CLI subassembly differs from full qualification'
assembly=cli.parent.parent
bom=json.loads(cli.read_text())
assert {str(p.relative_to(assembly)) for p in assembly.rglob('*') if p.is_file()}=={f['path'] for f in bom['inventory']}|{'sbom/dependencies.json'}
for entry in bom['inventory']:
 b=(assembly/entry['path']).read_bytes()
 assert len(b)==entry['bytes'] and hashlib.sha256(b).hexdigest()==entry['sha256']
summary={'cliSubassemblyMatchesFullTest':True,'remoteEvidenceFilesMatched':len(remote_evidence),'baseline':'a314e56a17958fa7befa0d07b90b8327c8e2fd0c','localEntries':local['baselineEntries'],'remoteEntries':remote['baselineEntries'],'changedExisting':sorted(basechanged),'removed':[],'sourceAndDocsMatch':True,'finalFocusedAndFullSourceBindingsMatch':True,'nativeReceiptsMatch':True,'originalWorkerLogSha256':hashlib.sha256(log.read_bytes()).hexdigest(),'claim':'UNPUBLISHED COMPONENT QUALIFICATION, NOT G7 ACCEPTANCE'}
(V/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
