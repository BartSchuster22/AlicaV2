#!/usr/bin/env python3
"""G0 reference/boundary verification; no V1 code is imported or executed."""
import argparse,ast,concurrent.futures,datetime,hashlib,json,sys,urllib.request
from pathlib import Path
R=Path(__file__).resolve().parents[2]
def read(p):return json.loads((R/p).read_text())
def sha(b):return hashlib.sha256(b).hexdigest()
def require(condition,message):
 if not condition:raise ValueError(message)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--online',action='store_true');a=ap.parse_args()
 checks=[]
 def passed(name,detail):checks.append({'check':name,'status':'PASS','detail':detail})
 lock=read('docs/references/v1-baseline.lock.json');records=lock['files'];by={x['path']:x for x in records}
 require(len(by)==len(records),'duplicate reference paths')
 require(lock['commit']=='d3feafa9c03a0175ae3d702413f97e0e8f1634c9','unexpected baseline change')
 prefix=f"https://raw.githubusercontent.com/BartSchuster22/Alica-DSH/{lock['commit']}/"
 for x in records:
  require(x['url']==prefix+x['path'],'untrusted source URL')
  datetime.datetime.fromisoformat(x['lastVerifiedRetrievalUtc'])
  require(len(x['sha256'])==64 and x['bytes']>0,'invalid locked hash/length')
 passed('pinned-reference-metadata',len(records))
 for source in read('docs/references/user-source-provenance.json')['sources']:
  b=(R/source['path']).read_bytes();require(sha(b)==source['sha256'] and len(b)==source['bytes'],'owner-source hash mismatch')
 passed('preserved-owner-source-hashes',2)
 mb=(R/'docs/references/v1-manifest.reference.json').read_bytes();m=json.loads(mb)
 require(sha(mb)==by['release/d6-candidate/manifest.json']['sha256'],'snapshot drift')
 passed('manifest-snapshot-hash',sha(mb))
 inv=read('docs/references/v1-inventory.json');index=read('docs/references/v1-artifact-index.json')
 orig={c['componentId']:c for c in m['components']};entries={c['id']:c for c in inv['components']}
 require(len(entries)==len(inv['components']) and set(orig)==set(entries),'incomplete/duplicate component inventory')
 for cid,c in orig.items():
  e=entries[cid]
  for ek,mk in [('authority','authority'),('contract','componentContract'),('provides','provides'),('requires','requires'),('dataSchema','dataSchema'),('artifact','artifact'),('artifactDigest','digest'),('configSchema','configSchema'),('sbom','sbom'),('provenance','provenance')]:require(e[ek]==c[mk],cid+' '+ek+' mismatch')
  require(e['humanOwner']['status']=='UNVERIFIED' and not e['artifactBytesVerified'],'unsubstantiated inventory claim')
  for k in ['persistenceClass','persistenceEvidence','externalDependencies','sourceMapping','backupRestoreOrder']:require(k in e,'missing inventory field '+k)
 require(inv['sourcesDeclaredByManifest']==m['sources'],'source declarations differ')
 declared={x['component']:x for x in index['runtimeArtifacts']};require(set(declared)==set(orig),'artifact index incomplete')
 for cid,c in orig.items():require(declared[cid]['reference']==c['artifact'] and declared[cid]['digest']==c['digest'] and declared[cid]['bytesVerified'] is False,'artifact declaration mismatch')
 passed('distribution-inventory-and-declared-artifact-bindings',len(entries))
 for c in m['components']:
  for k in ['sbom','provenance']:
   p='release/d6-candidate/'+c[k]['artifact'].split('file://bundle/')[1].split('@')[0]
   require('sha256:'+by[p]['sha256']==c[k]['digest'],'manifest evidence digest differs '+p)
 passed('manifest-bound-sbom-provenance-hashes',len(m['components'])*2)
 for p in ['docs/references/README.md','docs/decisions/G0-SCOPE-AND-INPUTS.md','docs/adr/README.md','docs/gates/G0.md','docs/planning/ALICA_V2_Assessment_and_Step1_Building_Plan.md']:
  require((R/p).is_file() and (R/p).stat().st_size>0,'missing deliverable '+p)
 adrs=list((R/'docs/adr').glob('ADR-*.md'));reg=(R/'docs/adr/README.md').read_text()
 require(all(p.name in reg for p in adrs),'ADR register incomplete')
 passed('g0-deliverables-and-adr-register',len(adrs))
 inventory=[]
 for p in R.rglob('*'):
  rel=p.relative_to(R)
  if rel.parts[0]=='.git' or '__pycache__' in rel.parts:continue
  require(not p.is_symlink(),'symlink outside permitted boundary '+str(rel))
  if not p.is_file():continue
  require(rel==Path('README.md') or rel.parts[0] in {'docs','specs','tests','evidence'},'unexpected repository category '+str(rel))
  require(p.suffix in {'.md','.json','.txt','.py'},'non-reference/binary artifact '+str(rel))
  if p.suffix=='.py':require(rel.parts[0]=='tests' and rel.parts[1] in {'design','reference'},'non-test executable source '+str(rel))
  b=p.read_bytes();text=b.decode('utf-8');require('\x00' not in text,'binary data '+str(rel))
  if p.suffix=='.py':
   tree=ast.parse(text)
   for node in ast.walk(tree):
    names=[]
    if isinstance(node,ast.Import):names=[v.name for v in node.names]
    if isinstance(node,ast.ImportFrom):
     require(node.level==0,'relative source import '+str(rel))
     names=[node.module or '']
    for name in names:require(name.split('.')[0] in sys.stdlib_module_names or name=='jsonschema','non-allowlisted import '+name)
    if isinstance(node,ast.Call) and isinstance(node.func,ast.Name):require(node.func.id not in {'eval','exec','__import__'},'dynamic executable import/evaluation '+str(rel))
  # Literal key markers constructed to avoid matching this verifier's own source.
  require(('-----BEGIN '+'OPENSSH PRIVATE KEY-----') not in text and ('-----BEGIN '+'PRIVATE KEY-----') not in text,'private key marker '+str(rel))
  inventory.append(str(rel))
 passed('repository-reference-design-only-boundary',{'filesChecked':len(inventory),'limitations':'Category/UTF-8/private-key-marker checks; not a semantic detector of arbitrary data or comprehensive security scan. No production source tree exists.'})
 if a.online:
  def retrieve(x):
   b=urllib.request.urlopen(x['url'],timeout=40).read()
   require(sha(b)==x['sha256'] and len(b)==x['bytes'],'online source mismatch '+x['path'])
   return {'path':x['path'],'sha256':sha(b),'bytes':len(b),'retrievedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
  results=list(concurrent.futures.ThreadPoolExecutor(6).map(retrieve,records))
  passed('independent-online-reretrieval',results)
 else:checks.append({'check':'independent-online-reretrieval','status':'NOT_RUN','detail':'Use --online'})
 bind={}
 for p in R.rglob('*'):
  rel=p.relative_to(R)
  if p.is_file() and rel.parts[0] in {'docs','tests','specs'} and '__pycache__' not in rel.parts:bind[str(rel)]=sha(p.read_bytes())
 result={'technicalStatus':'PASS' if a.online else 'LOCAL_PASS_ONLINE_NOT_RUN','gateExitStatus':'OWNER_ACCEPTANCE_PENDING','command':'python3 tests/reference/verify_g0.py'+(' --online' if a.online else ''),'completedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':checks,'inputSha256':bind,'limitations':['No V1 runtime/OCI binaries executed or reconstructed','No signature-chain verification','No production state inspected/copied','Unknown owner/source/operational facts explicitly retained']}
 print(json.dumps(result,indent=2))
if __name__=='__main__':
 try:main()
 except Exception as exc:
  print(json.dumps({'technicalStatus':'FAIL','error':str(exc)}));sys.exit(1)
