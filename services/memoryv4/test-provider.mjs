import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,writeFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {hostFixture} from '../../service-foundation/conformance/host-fixture.mjs';
import {requirement} from '../../service-foundation/reference/services.mjs';
import {memoryProvider} from './provider.mjs';
const d=JSON.parse(readFileSync(new URL('../../catalog/proposals/memory-candidates/descriptor.json',import.meta.url)));
const python=resolve('.tools/memory-python/bin/python');
const all=['create','get','search'];
const input={scope:'tenant:offline/project:a',title:'fixture',content:'lexical durable candidate',sourceRefs:['urn:offline:source'],provenance:{source:'offline fixture'}};
async function setup(databasePath,options={}){
 const f=hostFixture({cleanupMs:1500,activationMs:1500}),identities=new Map();
 const service=memoryProvider(d,c=>identities.get(JSON.stringify([c.principal,c.instanceId,c.scope])),{python,databasePath,...options});
 const source="import {AcapError} from '@alica/acap-contracts';let release;export function activate(c){release=c.provide("+JSON.stringify(d)+",{get:async()=>{await release();throw new AcapError('UNAVAILABLE');},create:async()=>{},search:async()=>{}});}";
 const id=f.discover({descriptor:d,source});await f.host.activate(id);
 async function caller(scope,ops=all){const cid=f.discover({requires:[requirement(d)],scope});if(scope!=='root')f.grant(cid,d.id,ops,{scopeIdentity:{scope:'root',scopeGeneration:1}});f.grant(cid,d.id,ops);await f.host.activate(cid);return {id:cid,handle:await f.host.context(cid).require(requirement(d))};}
 const probe=await caller('root');await assert.rejects(probe.handle.call('get',{scope:input.scope,id:'bootstrap'},{deadlineMs:Date.now()+2000}),{code:'UNAVAILABLE'});await f.host.dispose(probe.id);
 const context=f.host.context(id).createScope();await service.plugin.activate(context);
 const c=await caller(context.scope),principal=f.host.context(c.id).principal;
 const identity=JSON.stringify([principal,c.id,context.scope]);
 // Normalize the trusted context key independently of object property insertion order.
 const trusted={actor:'worker:fixture',scope_path:'tenant:offline',permissions:['memory.create-working','memory.read','memory.search']};
 identities.set(identity,trusted);
 // Host caller key order is specified only as fields; install resolver comparison below via exact observed shape fixture.
 return {f,id,c,context,service,identities,identity,trusted,call:(op,data,opts={})=>c.handle.call(op,data,{deadlineMs:Date.now()+5000,...opts}),async close(){const r=await f.close();assert.equal(r.resources.pendingCalls,0);assert.equal(r.resources.registrations,0);assert.equal(service.active(),0);for(const i of r.instances){assert.equal(i.cleanup.timedOutResources,0);assert.deepEqual([...i.cleanup.failedDisposers],[]);}}};
}
test('actual Python shared-domain create/get/search, durable restart, scope and forged authority',{timeout:30000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'memory51-')),db=join(dir,'memory.sqlite3');let s=await setup(db);let first;
 try{
  first=await s.call('create',input,{idempotencyKey:'durable-key-001'});
  assert.equal(first.author,'worker:fixture');assert.equal(first.role,'active');assert.equal(first.lifecycle,'working');
  assert.deepEqual(JSON.parse(JSON.stringify(await s.call('create',input,{idempotencyKey:'durable-key-001'}))),JSON.parse(JSON.stringify(first)));
  await assert.rejects(s.call('create',{...input,content:'changed'},{idempotencyKey:'durable-key-001'}),{code:'CONFLICT'});
  assert.equal((await s.call('get',{scope:input.scope,id:first.id})).id,first.id);
  assert.equal((await s.call('search',{scope:input.scope,query:'lexical',limit:25,cursor:''})).candidates[0].id,first.id);
  for(const forged of [{actor:'admin'},{permissions:['memory.admin']},{role:'canonical'},{caller:{principal:'admin'}}])await assert.rejects(s.call('create',{...input,...forged},{idempotencyKey:'forged-key-001'}),{code:'INVALID_ARGUMENT'});
  await assert.rejects(s.call('create',{...input,scope:'tenant:other'},{idempotencyKey:'outside-key-01'}),{code:'PERMISSION_DENIED'});
  await assert.rejects(s.call('get',{scope:input.scope,id:'absent'}),{code:'NOT_FOUND'});
  s.identities.clear();await assert.rejects(s.call('get',{scope:input.scope,id:first.id}),{code:'PERMISSION_DENIED'});
 }finally{await s.close();}
 s=await setup(db);try{assert.equal((await s.call('get',{scope:input.scope,id:first.id})).id,first.id);assert.equal((await s.call('create',input,{idempotencyKey:'durable-key-001'})).id,first.id);}finally{await s.close();rmSync(dir,{recursive:true});}
});
test('ambiguous committed write: actual child exit without response, explicit same-key retry',{timeout:30000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'memory51-')),db=join(dir,'memory.sqlite3'),wrapper=join(dir,'lose-response');
 writeFileSync(wrapper,`#!/usr/bin/python3\nimport subprocess,sys,os\np=subprocess.run([${JSON.stringify(python)},*sys.argv[1:]],input=sys.stdin.buffer.read(),stdout=subprocess.PIPE)\nos._exit(17)\n`);chmodSync(wrapper,0o700);
 let s=await setup(db,{python:wrapper});try{await assert.rejects(s.call('create',input,{idempotencyKey:'ambiguous-key-1'}),{code:'UNAVAILABLE'});}finally{await s.close();}
 s=await setup(db);try{const replay=await s.call('create',input,{idempotencyKey:'ambiguous-key-1'});const hits=await s.call('search',{scope:input.scope,query:'lexical',limit:25,cursor:''});assert.equal(hits.candidates.length,1);assert.equal(hits.candidates[0].id,replay.id);}finally{await s.close();rmSync(dir,{recursive:true});}
});
test('product deadline/cancellation, unavailable executable, disposal stale handle',{timeout:20000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'memory51-')),db=join(dir,'memory.sqlite3');const s=await setup(db);
 try{await assert.rejects(s.call('create',input,{deadlineMs:Date.now()-1,idempotencyKey:'expired-key-001'}),{code:'DEADLINE_EXCEEDED'});const abort=new AbortController();abort.abort();await assert.rejects(s.call('get',{scope:input.scope,id:'x'},{signal:abort.signal}),{code:'CANCELLED'});await s.f.host.dispose(s.id);await assert.rejects(s.call('get',{scope:input.scope,id:'x'}));}finally{await s.close();}
 const t=await setup(db,{python:'/nonexistent-memory51-runtime'});try{await assert.rejects(t.call('get',{scope:input.scope,id:'x'}),{code:'UNAVAILABLE'});}finally{await t.close();rmSync(dir,{recursive:true});}
});
