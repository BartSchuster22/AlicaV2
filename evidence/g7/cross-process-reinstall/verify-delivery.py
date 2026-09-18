from pathlib import Path
import hashlib,json,re,sys,subprocess
r=Path('/home/herman/g7-implementation');e=r/'evidence/g7/cross-process-reinstall'
allowed=['native/g7/ownership.c','tools/g7-cell.mjs','tools/g7-owned-coordinator.py']
docs=['docs/g7/R1-CROSS-PROCESS-REINSTALL-CHECKPOINT.md','docs/g7/R1-CROSS-PROCESS-REINSTALL-EXECUTION.md']
sources=json.loads((e/'focused-final-2/allowlist.json').read_text())
def h(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def readsha(p):
 return {line.split('  ',1)[1]:line.split('  ',1)[0] for line in p.read_text().splitlines()}
results={'purpose':'integrity and test qualification only, not custody authority or G7 acceptance','inventories':{},'runs':{},'sourceHashes':{p:h(r/p) for p in sources},'documentHashes':{p:h(r/p) for p in docs}}
for place in ['local','development']:
 before=json.loads((e/f'{place}-before.json').read_text());after=json.loads((e/f'{place}-after.json').read_text())
 changed=sorted(p for p,v in before['files'].items() if after['files'].get(p)!=v)
 added=sorted(set(after['files'])-set(before['files']))
 assert before['head']==after['head']=='bd90730511bb20950bd5564cb394055e82105fe8'
 assert changed==sorted(allowed),(place,changed)
 assert set(added)<=set(sources+docs),(place,added)
 results['inventories'][place]={'head':after['head'],'originalFiles':len(before['files']),'changedOriginalFiles':changed,'addedNonEvidenceFiles':added,'unchangedOriginalEvidenceFiles':sum(p.startswith('evidence/') and after['files'].get(p)==v for p,v in before['files'].items()),'beforeSha256':h(e/f'{place}-before.json'),'afterSha256':h(e/f'{place}-after.json')}
for name in ['focused-final-2','full-final']:
 d=e/name
 before=readsha(d/'before.sha256');after=readsha(d/'after.sha256')
 assert before==after,(name,'source drift')
 assert all(h(r/p)==v for p,v in after.items()),(name,'local synchronization drift')
 assert int((d/'exit.txt').read_text())==0,name
 text=(d/'raw.log').read_text()
 totals=[line for line in text.splitlines() if re.match(r'^(?:ℹ|#) (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) ',line)]
 assert totals,(name,'missing results')
 assert not any(re.match(r'^(?:ℹ|#) (?:fail|cancelled|skipped) [1-9]',line) for line in totals),(name,'test failure/cancellation/skip')
 results['runs'][name]={'exit':0,'rawLogSha256':h(d/'raw.log'),'sourceBeforeAfterSha256':h(d/'after.sha256'),'sourceFileCount':len(after),'summaries':totals}
native=json.loads((e/'native-final.json').read_text())
assert native['inputs']['native/g7/ownership.c']==h(r/'native/g7/ownership.c')
results['nativeBuild']={'receiptSha256':h(e/'native-final.json'),'sourceSha256':native['inputs']['native/g7/ownership.c'],'outputSha256':native['outputSha256']}
assert all(results['sourceHashes'][p]==json.loads((e/'development-after.json').read_text())['files'][p]['sha256'] for p in sources)
(e/'verification.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
