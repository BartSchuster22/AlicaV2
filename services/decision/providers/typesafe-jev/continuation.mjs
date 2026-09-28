// Phase4-only guarded use of the remaining four slots. Not a replay API.
import { constants,openSync,closeSync,readFileSync,writeSync,fsyncSync,renameSync,existsSync,readdirSync,lstatSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { modelBody } from './mapping.mjs';
import { inspectLedger,ORIGINAL_LEDGER_SHA256,ORIGINAL_LEDGER_BYTES } from './ledger.mjs';
import { createTransport } from './transport.mjs';
import { invalid } from '../../provider/decimal.mjs';
export const observed=JSON.parse(readFileSync(new URL('./observed-models.json',import.meta.url),'utf8'));
export const diagnosticPrefix='{"schema":"alica.phase4.physical-budget/v1","max":6,"timeoutMs":30000,"retries":0}\n{"event":"reserve","kind":"discovery","slot":1,"timeMs":1790587209902}\n{"event":"finish","slot":1,"code":"OK"}\n{"event":"reserve","kind":"discovery-diagnostic","slot":2,"timeMs":1790589529009}\n{"event":"finish","slot":2,"code":"OK"}\n';
const originalHash='a7d462fab9503e3059f4c9951ca154839b01a91bab6730d08731138918f68151';
const prefixHash='12e1bf599c86a451fda6f766e8d8b47a259fa1768b3649963fd67226765225fe';
const realRepo='/home/alica-dev/AlicaV2-phase4', kinds=['noul','choice','score','mixed'];
const safe=new Set(['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','CONTRACT_MISMATCH','DEADLINE_EXCEEDED','CANCELLED','UNAVAILABLE','RESOURCE_EXHAUSTED','FAILED_PRECONDITION']);
const fail=()=>invalid('FAILED_PRECONDITION');
export const sha=b=>createHash('sha256').update(b).digest('hex');
function read(file){const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{return readFileSync(fd);}finally{closeSync(fd);}}
function syncDir(file){const fd=openSync(dirname(file),constants.O_RDONLY);try{fsyncSync(fd);}finally{closeSync(fd);}}
export function durableNew(file,value){const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{const b=Buffer.from(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');if(writeSync(fd,b)!==b.length)fail();fsyncSync(fd);}finally{closeSync(fd);}syncDir(file);}
// Binds fixture proof to all selected Phase4 executable/declaration/JSON inputs,
// not the old candidate manifest. No foundation mutation or platform subsystem.
export function sourceManifest(repo){const files=[];function visit(rel){for(const e of readdirSync(join(repo,rel),{withFileTypes:true})){const p=rel+'/'+e.name;if(e.isDirectory())visit(p);else if(e.isFile()&&/\.(mjs|mts|json)$/.test(p))files.push(p);else if(e.isSymbolicLink())fail();}}
 for(const root of ['services/decision','examples/decision-consumer','catalog/proposals/decision-evaluate'])visit(root);
 return files.sort().map(p=>sha(read(join(repo,p)))+'  '+p+'\n').join('');}
export function sourceDigest(repo){return sha(sourceManifest(repo));}
export function beginContinuation({fixture,repo=realRepo}={}){
 const synthetic=fixture!==undefined;
 if(!synthetic&&repo!==realRepo)fail();
 if(synthetic&&(typeof fixture.requestImpl!=='function'||!resolve(fixture.directory).startsWith(resolve(tmpdir())+'/')||lstatSync(fixture.directory).isSymbolicLink()||(lstatSync(fixture.directory).mode&0o777)!==0o700))fail();
 const paths=synthetic?{ledger:join(fixture.directory,'ledger.jsonl'),original:join(fixture.directory,'original.json'),diagnostic:join(fixture.directory,'diagnostic.json'),report:join(fixture.directory,'evaluations.json'),key:join(fixture.directory,'fixture-key')}:{ledger:'/home/alica-dev/.local/state/alica/phase4/physical-requests.jsonl',original:realRepo+'/docs/phase4/LIVE.json',diagnostic:realRepo+'/docs/phase4/LIVE-CONTINUATION.json',report:realRepo+'/docs/phase4/LIVE-EVALUATIONS.json',key:'/home/alica-dev/.config/alica/phase4/typesafe-api-key'};
 let expectedOriginal=originalHash,expectedDiagnostic=observed.diagnosticSha256,proof;
 if(synthetic){
  // All writes are exclusive inside the fresh disposable fixture directory.
  const d={stage:'diagnostic-recorded-awaiting-fixture-verification',diagnostic:{lexical:'accepted',documentedSchemaValid:true,genericModelsCompatible:true,metadata:observed.metadata}};
  durableNew(paths.ledger,diagnosticPrefix);durableNew(paths.original,'SYNTHETIC_ORIGINAL_EVIDENCE\n');durableNew(paths.diagnostic,d);durableNew(paths.key,'DISPOSABLE_CONTINUATION_KEY\n');
  expectedOriginal=sha(read(paths.original));expectedDiagnostic=sha(read(paths.diagnostic));proof={classification:'FIXTURE-TESTED-DEFENSIVE'};
 }else{
  proof=JSON.parse(read(realRepo+'/docs/phase4/evidence/CONTINUATION-FIXTURE-PROOF.json'));
  if(proof.schema!=='alica.phase4-continuation-fixture-proof/v1'||proof.status!=='PASS'||proof.sourceDigest!==sourceDigest(repo)||proof.diagnosticSha256!==expectedDiagnostic||proof.fixtureAuthenticatedRequests!==0||proof.fixtureEvaluations!==4||proof.publicHostFixture!==true)fail();
 }
 function history(){if(sha(read(paths.original))!==expectedOriginal||sha(read(paths.diagnostic))!==expectedDiagnostic)fail();const bytes=read(paths.ledger);if(sha(bytes.subarray(0,ORIGINAL_LEDGER_BYTES))!==ORIGINAL_LEDGER_SHA256||sha(bytes.subarray(0,Buffer.byteLength(diagnosticPrefix)))!==prefixHash)fail();return inspectLedger(paths.ledger);}
 const initial=history();
 if(initial.consumed!==2||initial.remaining!==4||initial.attempts.some(a=>a.outcome!=='OK')||existsSync(paths.ledger+'.lock')||existsSync(paths.report)||existsSync(paths.report+'.next'))fail();
 const diagnostic=JSON.parse(read(paths.diagnostic));
 if(diagnostic.stage!=='diagnostic-recorded-awaiting-fixture-verification'||diagnostic.diagnostic?.lexical!=='accepted'||diagnostic.diagnostic.documentedSchemaValid!==true||diagnostic.diagnostic.genericModelsCompatible!==true||JSON.stringify(diagnostic.diagnostic.metadata)!==JSON.stringify(observed.metadata))fail();
 const models=modelBody(JSON.stringify({models:diagnostic.diagnostic.metadata}));
 if(models[0]?.id!=='jev-latest'||models.some((m,i)=>m.releaseDate!==observed.metadata[i].release_date))fail();
 const report={schema:'alica.phase4-evaluations/v1',classification:synthetic?'FIXTURE-TESTED-DEFENSIVE':'LIVE-OBSERVED',level:'PUBLIC_HOST',stage:'ready',originalLiveSha256:expectedOriginal,diagnosticSha256:expectedDiagnostic,originalLedgerPrefixSha256:ORIGINAL_LEDGER_SHA256,diagnosticLedgerPrefixSha256:prefixHash,sourceDigest:synthetic?null:proof.sourceDigest,fixtureProof:proof,configuredModel:models[0].id,advertisedModelIds:models.map(m=>m.id),results:[],budget:initial,authenticatedLiveRequests:synthetic?0:2,newAuthenticatedRequests:0};
 durableNew(paths.report,report);
 let active,completed=0,sent=false,failed=false,ownHash=sha(read(paths.report));
 function owned(){if(sha(read(paths.report))!==ownHash||existsSync(paths.report+'.next'))fail();}
 function persist(){owned();durableNew(paths.report+'.next',report);renameSync(paths.report+'.next',paths.report);syncDir(paths.report);ownHash=sha(read(paths.report));}
 function refresh(){report.budget=history();report.authenticatedLiveRequests=synthetic?0:report.budget.consumed;report.newAuthenticatedRequests=synthetic?0:report.budget.consumed-2;}
 const physical=createTransport({keyFile:paths.key,ledgerFile:paths.ledger,...(synthetic?{requestImpl:fixture.requestImpl}:{})});
 return {models,model:models[0].id,report,paths,
  transport:Object.freeze({async send(args){owned();if(failed||!active||sent||args.kind!==active||!kinds.includes(args.kind))fail();const state=history();if(state.consumed!==completed+2||state.attempts.some(a=>a.outcome!=='OK'))fail();sent=true;return physical.send(args);}}),
  begin(kind){if(failed||active||kind!==kinds[completed]||history().consumed!==completed+2)fail();active=kind;sent=false;report.stage=kind;persist();},
  accept(response){const state=history();if(failed||!active||!sent||state.consumed!==completed+3||state.attempts.at(-1).kind!==active||state.attempts.at(-1).outcome!=='OK')fail();report.results.push({kind:active,model:response.model,usage:response.usage,answers:response.answers.map(({legend,...a})=>a)});completed++;active=undefined;refresh();persist();},
  fail(error){failed=true;if(!report.failure)report.failure={stage:report.stage,code:safe.has(error?.code)?error.code:'UNAVAILABLE'};refresh();persist();},
  cleanup(value){report.cleanup=value;refresh();persist();},
  complete(extra){if(failed||active||completed!==4||history().consumed!==6)fail();Object.assign(report,extra);report.stage='complete';refresh();persist();return report;},
 };
}
