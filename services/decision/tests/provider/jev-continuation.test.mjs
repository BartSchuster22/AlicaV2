import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,chmodSync,rmSync,readFileSync,appendFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { modelBody } from '../../providers/typesafe-jev/mapping.mjs';
import { beginContinuation,observed,diagnosticPrefix,sha } from '../../providers/typesafe-jev/continuation.mjs';
import { inspectLedger } from '../../providers/typesafe-jev/ledger.mjs';
function setup(status=200){const directory=mkdtempSync(join(tmpdir(),'phase4-continuation-test-'));chmodSync(directory,0o700);let calls=0;
 const requestImpl=(options,cb)=>{calls++;assert.equal(options.method,'POST');assert.equal(options.path,'/v1/systemone');const state=inspectLedger(join(directory,'ledger.jsonl'));assert.equal(state.consumed,calls+2);assert.equal(state.attempts.at(-1).outcome,'AMBIGUOUS_OR_PENDING');const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.destroy=()=>{};res.statusCode=status;res.headers={'content-type':'application/json'};cb(res);res.emit('data',Buffer.from(status===200?'{}':'DISPOSABLE_STATE_ERROR_BODY'));res.emit('end');});return req;};
 const session=beginContinuation({fixture:{directory,requestImpl}});return{session,directory,get calls(){return calls;},close:()=>rmSync(directory,{recursive:true,force:true})};}
const send=(f,kind)=>f.session.transport.send({kind,body:'{}',signal:new AbortController().signal,deadlineMs:Date.now()+1000});
const response={model:'fixture-resolved',usage:{inputTokens:1,outputTokens:1},answers:[]};
test('LIVE-OBSERVED model metadata replay: exact timestamps preserved; prose date still accepted; no other validator relaxed',()=>{
 assert.equal(observed.diagnosticSha256,'1c26cbeeb7c7b1ab0b5a9b2ebb085431a0c4237b07cac3db12625054274b054c');
 assert.equal(sha(diagnosticPrefix),'12e1bf599c86a451fda6f766e8d8b47a259fa1768b3649963fd67226765225fe');
 const rows=modelBody(JSON.stringify({models:observed.metadata}));assert.deepEqual(rows.map(m=>m.id),['jev-latest','jev-preview']);assert.deepEqual(rows.map(m=>m.releaseDate),observed.metadata.map(m=>m.release_date));
 for(const value of ['2026-09-10','2026-09-10T18:38:01.391457+00:00','2026-09-10T18:38:01Z'])assert.equal(modelBody(JSON.stringify({models:[{...observed.metadata[0],release_date:value}]}))[0].releaseDate,value);
 for(const value of ['',null,42,'2026-09-10\n','2026-09-10T18:38:01.1234567890Z','2026-09-10T18:38:01','x'.repeat(129)])assert.throws(()=>modelBody(JSON.stringify({models:[{...observed.metadata[0],release_date:value}]})),{code:'CONTRACT_MISMATCH'});
 for(const change of [m=>m.extra=true,m=>m.name='unsupported/model',m=>m.description=42]){const m=structuredClone(observed.metadata[0]);change(m);assert.throws(()=>modelBody(JSON.stringify({models:[m]})),{code:'CONTRACT_MISMATCH'});}
});
test('fresh synthetic continuation dispatches only four ordered POSTs, preserves both prefixes and refuses restart/replay',async()=>{
 const f=setup();try{const original=readFileSync(f.session.paths.original),diagnostic=readFileSync(f.session.paths.diagnostic);assert.equal(f.session.model,'jev-latest');assert.throws(()=>f.session.begin('choice'),{code:'FAILED_PRECONDITION'});
 await assert.rejects(send(f,'discovery'),{code:'FAILED_PRECONDITION'});assert.equal(f.calls,0);
 for(const kind of ['noul','choice','score','mixed']){f.session.begin(kind);await send(f,kind);await assert.rejects(send(f,kind),{code:'FAILED_PRECONDITION'});f.session.accept(response);}
 const report=f.session.complete({});assert.equal(report.budget.consumed,6);assert.equal(report.budget.remaining,0);assert.equal(report.results.length,4);assert.equal(report.authenticatedLiveRequests,0);assert.equal(f.calls,4);
 assert.equal(readFileSync(f.session.paths.ledger).subarray(0,Buffer.byteLength(diagnosticPrefix)).toString(),diagnosticPrefix);assert.deepEqual(readFileSync(f.session.paths.original),original);assert.deepEqual(readFileSync(f.session.paths.diagnostic),diagnostic);
 assert.throws(()=>f.session.begin('noul'),{code:'FAILED_PRECONDITION'});assert.throws(()=>beginContinuation({fixture:{directory:f.directory,requestImpl:()=>assert.fail()}}));assert.equal(f.calls,4);
 }finally{f.close();}
});
test('first physical or semantic failure stops all later evaluations and keeps consumed slot/evidence',async()=>{
 for(const status of [500,200]){const f=setup(status);try{f.session.begin('noul');if(status===500)await assert.rejects(send(f,'noul'),{code:'UNAVAILABLE'});else await send(f,'noul');f.session.fail({code:status===500?'UNAVAILABLE':'CONTRACT_MISMATCH'});assert.throws(()=>f.session.begin('choice'),{code:'FAILED_PRECONDITION'});await assert.rejects(send(f,'noul'),{code:'FAILED_PRECONDITION'});assert.equal(f.calls,1);assert.equal(inspectLedger(f.session.paths.ledger).consumed,3);assert(!readFileSync(f.session.paths.report,'utf8').includes('DISPOSABLE_STATE_ERROR_BODY'));assert.throws(()=>f.session.complete({}),{code:'FAILED_PRECONDITION'});}finally{f.close();}}
});
test('changed historical evidence and unexpected ledger reservation fail before dispatch',async()=>{
 for(const target of ['original','diagnostic','ledger']){const f=setup();try{if(target==='ledger')appendFileSync(f.session.paths.ledger,JSON.stringify({event:'reserve',kind:'noul',slot:3,timeMs:1})+'\n');else appendFileSync(f.session.paths[target],' ');assert.throws(()=>f.session.begin('noul'),{code:'FAILED_PRECONDITION'});assert.equal(f.calls,0);}finally{f.close();}}
 const f=setup();try{f.session.begin('noul');writeFileSync(f.session.paths.ledger,diagnosticPrefix.replace('1790589529009','1790589529010'));await assert.rejects(send(f,'noul'),{code:'FAILED_PRECONDITION'});assert.equal(f.calls,0);}finally{f.close();}
});
