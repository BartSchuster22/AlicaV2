import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync,rmSync,chmodSync,appendFileSync,mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { diagnosticBody } from '../../providers/typesafe-jev/discovery-diagnostic.mjs';
import { reserved,reservedDiagnostic,inspectLedger,ORIGINAL_LEDGER_BYTES,ORIGINAL_LEDGER_SHA256 } from '../../providers/typesafe-jev/ledger.mjs';
import { runDiscoveryDiagnostic,createTransport } from '../../providers/typesafe-jev/transport.mjs';
const prefix='{"schema":"alica.phase4.physical-budget/v1","max":6,"timeoutMs":30000,"retries":0}\n{"event":"reserve","kind":"discovery","slot":1,"timeMs":1790587209902}\n{"event":"finish","slot":1,"code":"OK"}\n';
const model={name:'fixture-model',description:'non-sensitive fixture',release_date:'2026-01-01'};
function fixture(){const dir=mkdtempSync(join(tmpdir(),'phase4-diagnostic-fixture-'));chmodSync(dir,0o700);const ledgerFile=join(dir,'ledger.jsonl'),keyFile=join(dir,'key');writeFileSync(ledgerFile,prefix,{mode:0o600});writeFileSync(keyFile,'DISPOSABLE_DIAGNOSTIC_SECRET',{mode:0o600});return{dir,ledgerFile,keyFile,close:()=>rmSync(dir,{recursive:true,force:true})};}
function primitive(f,{status=200,text=JSON.stringify({models:[model]})}={}){let calls=0;return{get calls(){return calls;},requestImpl(options,cb){calls++;assert.equal(inspectLedger(f.ledgerFile).consumed,2);assert.equal(inspectLedger(f.ledgerFile).attempts[1].outcome,'AMBIGUOUS_OR_PENDING');assert.equal(options.method,'GET');assert.equal(options.path,'/v1/models');assert.equal(options.agent,false);const req=new EventEmitter();req.destroy=()=>{};req.end=body=>{assert.equal(body,undefined);queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=status;res.headers={'content-type':'application/json'};res.destroy=()=>{};cb(res);res.emit('data',Buffer.from(text));res.emit('end');});};return req;}};}
const ctx=()=>({signal:new AbortController().signal,deadlineMs:Date.now()+1000});
test('manual diagnostic has its own one-shot path; durable slot2, original prefix, total6 and no seventh',async()=>{
 const f=fixture();try{assert.equal(Buffer.byteLength(prefix),ORIGINAL_LEDGER_BYTES);assert.equal(createHash('sha256').update(prefix).digest('hex'),ORIGINAL_LEDGER_SHA256);
 await assert.rejects(reserved(f.ledgerFile,'discovery-diagnostic',()=>assert.fail()),{code:'INVALID_ARGUMENT'});
 const p=primitive(f);let guard=0;const result=await runDiscoveryDiagnostic({...f,...ctx(),beforeSend:()=>guard++,requestImpl:p.requestImpl});assert.equal(guard,1);assert.equal(p.calls,1);assert.equal(result.legacyMapping,'accepted');assert.equal(result.genericModelsCompatible,true);
 await assert.rejects(runDiscoveryDiagnostic({...f,...ctx(),beforeSend:()=>assert.fail(),requestImpl:p.requestImpl}),{code:'FAILED_PRECONDITION'});assert.equal(p.calls,1);
 await assert.rejects(reserved(f.ledgerFile,'validation',()=>assert.fail()),{code:'FAILED_PRECONDITION'});
 await assert.rejects(reserved(f.ledgerFile,'choice',()=>assert.fail()),{code:'FAILED_PRECONDITION'});
 for(const kind of ['noul','choice','score','mixed'])await reserved(f.ledgerFile,kind,()=>{});
 assert.equal(inspectLedger(f.ledgerFile).consumed,6);assert.equal(inspectLedger(f.ledgerFile).remaining,0);assert.equal(readFileSync(f.ledgerFile).subarray(0,194).toString(),prefix);
 await assert.rejects(reserved(f.ledgerFile,'mixed',()=>assert.fail()),{code:'RESOURCE_EXHAUSTED'});
 }finally{f.close();}
});
test('modified history, existing evaluation, stale lock and ambiguous diagnostic never dispatch',async()=>{
 for(const mode of ['modified','evaluation','lock','ambiguous']){const f=fixture();try{
 if(mode==='modified')writeFileSync(f.ledgerFile,prefix.replace('1790587209902','1790587209903'));
 if(mode==='evaluation')await reserved(f.ledgerFile,'noul',()=>{});
 if(mode==='lock')mkdirSync(f.ledgerFile+'.lock',{mode:0o700});
 if(mode==='ambiguous')appendFileSync(f.ledgerFile,JSON.stringify({event:'reserve',kind:'discovery-diagnostic',slot:2,timeMs:1})+'\n');
 await assert.rejects(runDiscoveryDiagnostic({...f,...ctx(),beforeSend:()=>assert.fail(),requestImpl:()=>assert.fail()}),{code:mode==='lock'?'RESOURCE_EXHAUSTED':'FAILED_PRECONDITION'});
 }finally{f.close();}}
});
test('diagnostic rejects guard failure before network but preserves consumed reservation',async()=>{
 const f=fixture();try{await assert.rejects(runDiscoveryDiagnostic({...f,...ctx(),beforeSend:()=>{throw Object.assign(new Error('ignored'),{code:'FAILED_PRECONDITION'});},requestImpl:()=>assert.fail()}),{code:'FAILED_PRECONDITION'});assert.equal(inspectLedger(f.ledgerFile).consumed,2);assert.equal(inspectLedger(f.ledgerFile).attempts[1].outcome,'FAILED_PRECONDITION');}finally{f.close();}
});
test('HTTP faults and decoded credential echoes are never exposed in diagnostic output',async()=>{
 for(const status of [401,500,200]){const f=fixture();try{const text=JSON.stringify({models:[{...model,description:'DISPOSABLE_DIAGNOSTIC_SECRET'}]}).replace('DISPOSABLE','DISPOS\\u0041BLE');const p=primitive(f,{status,text});
 if(status!==200)await assert.rejects(runDiscoveryDiagnostic({...f,...ctx(),beforeSend:()=>{},requestImpl:p.requestImpl}),{code:status===401?'UNAUTHENTICATED':'UNAVAILABLE'});
 else{const r=await runDiscoveryDiagnostic({...f,...ctx(),beforeSend:()=>{},requestImpl:p.requestImpl});assert.equal(r.reasons[0].rule,'SENSITIVE_RESPONSE_REDACTED');assert(!JSON.stringify(r).includes('DIAGNOSTIC_SECRET'));assert.deepEqual(r.metadata,[]);}
 assert.equal(p.calls,1);assert.equal(inspectLedger(f.ledgerFile).consumed,2);
 }finally{f.close();}}
});
test('diagnostic distinguishes documented shape from stricter legacy rejection without fixing mapper',()=>{
 const r=diagnosticBody(JSON.stringify({models:[{...model,release_date:'2026-01-01T00:00:00Z',extra:true}],version:'fixture'}));assert.equal(r.documentedSchemaValid,true);assert.equal(r.genericModelsCompatible,true);assert.equal(r.legacyMapping,'rejected');assert.deepEqual(r.metadata,[{...model,release_date:'2026-01-01T00:00:00Z'}]);assert(r.reasons.some(x=>x.rule==='LEGACY_EXACT_ROOT_KEYS'));assert(r.reasons.some(x=>x.rule==='LEGACY_EXACT_MODEL_KEYS'));assert(r.reasons.some(x=>x.rule==='LEGACY_DATE_PATTERN'));assert(!JSON.stringify(r).includes('"version":"fixture"'));
 const incompatible=diagnosticBody(JSON.stringify({models:[{...model,name:'provider/model'}]}));assert.equal(incompatible.documentedSchemaValid,true);assert.equal(incompatible.genericModelsCompatible,false);assert.equal(incompatible.metadata[0].name,'provider/model');
 const empty=diagnosticBody('{"models":[]}');assert.equal(empty.documentedSchemaValid,true);assert.equal(empty.genericModelsCompatible,false);
});
test('lexical ambiguity, invalid types, metadata bounds and CLI guards fail closed offline',()=>{
 for(const text of ['{"models":[],"models":[]}','{"models":42}','{"models":[{"name":42}]}']){const r=diagnosticBody(text);assert.equal(r.genericModelsCompatible,false);assert.equal(r.documentedSchemaValid,false);}
 const bounded=diagnosticBody(JSON.stringify({models:[{...model,description:'x'.repeat(4097)}]}));assert.deepEqual(bounded.metadata,[]);assert.equal(bounded.genericModelsCompatible,false);
 const runner=new URL('../../tools/live-diagnostic.mjs',import.meta.url);const child=spawnSync(process.execPath,[runner.pathname],{encoding:'utf8',env:{PATH:process.env.PATH},cwd:tmpdir()});assert.equal(child.status,1);assert.deepEqual(JSON.parse(child.stdout),{code:'FAILED_PRECONDITION',stage:'diagnostic-guard'});
});
