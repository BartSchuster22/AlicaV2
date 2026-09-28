import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostFixture} from '../conformance/host-fixture.mjs';
import {stateless,records,consumer,requirement} from '../reference/services.mjs';
import {fileRecords} from '../reference/file-records.mjs';
const json=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const echo=json('../../catalog/capabilities/core/echo/descriptor.json');
const record=json('../../catalog/proposals/service-records/descriptor.json');
// The shell root capability deliberately rejects operations. The native service
// registers the same declared descriptor in its owned child scope, through the
// EXISTING public context API. Consumers are discovered in that scope. This is
// operator-trusted native attachment, not signed-author sandbox qualification.
async function attach(f,d,service){
 const source="import {AcapError} from '@alica/acap-contracts';let release;export function activate(c){release=c.provide("+JSON.stringify(d)+",{"+d.operations.map(o=>JSON.stringify(o.name)+":async()=>{await release();throw new AcapError('UNAVAILABLE');}").join(',')+"});}";
 const id=f.discover({descriptor:d,source});await f.host.activate(id);
 // Existing Host forbids duplicate visible provider identities, even across
 // scopes. Retire bootstrap registration by an ordinary granted ACAP call.
 // This test-only shell never reports a successful business operation.
 const probe=await caller(f,d,'root');
 await assert.rejects(probe.client.call(d.operations[0].name,d.id===echo.id?{text:'bootstrap'}:{key:'bootstrap',value:''}),{code:'UNAVAILABLE'});
 await f.host.dispose(probe.id);
 assert.equal(f.host.inspect().registry.filter(r=>r.owner===id).length,0);
 const context=f.host.context(id).createScope();
 try{await service.plugin.activate(context);}catch(e){await f.host.dispose(id);throw e;}
 return {id,scope:context.scope,context};
}
async function caller(f,d,scope,{authorized=true}={}){const id=f.discover({requires:[requirement(d)],scope});if(authorized){if(scope&&scope!=='root')f.grant(id,d.id,d.operations.map(o=>o.name),{scopeIdentity:{scope:'root',scopeGeneration:1}});f.grant(id,d.id,d.operations.map(o=>o.name));}await f.host.activate(id);const client=consumer(d);await client.plugin.activate(f.host.context(id));return {id,client};}
async function close(f,{dirty=false}={}){const end=await f.close();assert.equal(end.resources.registrations,0);assert.equal(end.resources.pendingCalls,0);assert.equal(end.resources.listeners,0);if(!dirty)for(const i of end.instances){assert.deepEqual([...i.cleanup.failedDisposers],[]);assert.equal(i.cleanup.timedOutResources,0);}return end;}
test('PUBLIC_HOST stateless native attachment, permission denial and cleanup',{timeout:10000},async()=>{const f=hostFixture();try{const service=stateless(echo),p=await attach(f,echo,service),{client}=await caller(f,echo,p.scope);assert.equal(service.health(),'READY');assert.deepEqual(await client.call('echo',{text:'public-host'}),{text:'public-host'});await assert.rejects(caller(f,echo,p.scope,{authorized:false}),{code:'PERMISSION_DENIED'});const report=await f.host.dispose(p.id);assert.equal(report.state,'DISPOSED');assert.equal(service.health(),'UNAVAILABLE');await assert.rejects(client.call('echo',{text:'stale'}));}finally{await close(f);}});
test('PUBLIC_HOST proposed records persist across normal stop/new instance; health and stale handle',{timeout:10000},async()=>{
 const directory=mkdtempSync(join(tmpdir(),'phase50-public-records-')),f=hostFixture();
 try{const first=records(record,fileRecords(directory)),p=await attach(f,record,first),c=await caller(f,record,p.scope);assert.deepEqual(await c.client.call('put',{key:'one',value:'persisted'}),{stored:true});await f.host.dispose(c.id);await f.host.dispose(p.id);assert.equal(first.health(),'UNAVAILABLE');await assert.rejects(c.client.call('get',{key:'one'}));
 const second=records(record,fileRecords(directory)),q=await attach(f,record,second),next=await caller(f,record,q.scope);assert.equal(second.health(),'READY');assert.deepEqual(await next.client.call('get',{key:'one'}),{found:true,value:'persisted'});assert.deepEqual(await next.client.call('get',{key:'absent'}),{found:false,value:''});
 }finally{await close(f);rmSync(directory,{recursive:true,force:true});}
});
test('PUBLIC_HOST actual required dependency absent, not successful EMPTY',{timeout:10000},async()=>{const f=hostFixture();try{const id=f.discover({requires:[requirement(echo)]});f.grant(id,echo.id,['echo']);await assert.rejects(f.host.activate(id),{code:'NOT_FOUND'});}finally{await close(f);}});
test('PUBLIC_HOST actual signed startup failure and readiness timeout',{timeout:10000},async()=>{const f=hostFixture();try{const failed=f.discover({source:"import {AcapError} from '@alica/acap-contracts';export function activate(){throw new AcapError('UNAVAILABLE')}"});await assert.rejects(f.host.activate(failed),{code:'UNAVAILABLE'});const timeout=f.discover({source:'export async function activate(){await new Promise(()=>{})}'});await assert.rejects(f.host.activate(timeout),{code:'DEADLINE_EXCEEDED'});const observed=f.host.inspect().instances.find(i=>i.id===timeout).cleanup;assert.equal(observed.restartRequired,true);assert(observed.failedDisposers.includes('DEADLINE_EXCEEDED'));}finally{await close(f,{dirty:true});}});
test('PUBLIC_HOST actual secret reference declaration/grant/existence checks',{timeout:10000},async()=>{
 for(const configured of [false,true]){const f=hostFixture(configured?{syntheticSecret:'synthetic-fixture-value'}:{});try{
  const id=f.discover({secretReferences:['synthetic-test']});await f.host.activate(id);const ctx=f.host.context(id);await assert.rejects(ctx.secret('synthetic-test'),{code:'PERMISSION_DENIED'});f.grant(id,'synthetic-test',['read'],{secret:true});if(configured)assert.equal(await ctx.secret('synthetic-test'),'synthetic-fixture-value');else await assert.rejects(ctx.secret('synthetic-test'),{code:'NOT_FOUND'});
  await assert.rejects(ctx.secret('undeclared'),{code:'PERMISSION_DENIED'});
 }finally{await close(f);}}
});
test('PUBLIC_HOST actual bounded stop timeout is reported, not clean PASS',{timeout:10000},async()=>{const f=hostFixture();try{const id=f.discover();await f.host.activate(id);await f.host.context(id).effect(async register=>{register(async()=>new Promise(()=>{}));});const report=await f.host.dispose(id);assert.equal(report.restartRequired,true);assert.equal(report.timedOutResources,1);assert(report.failedDisposers.includes('DEADLINE_EXCEEDED'));}finally{await close(f,{dirty:true});}});
test('PUBLIC_HOST service-owned quota health DEGRADED and storage failure UNAVAILABLE',{timeout:10000},async()=>{
 const directory=mkdtempSync(join(tmpdir(),'phase50-health-')),f=hostFixture();try{const resource=fileRecords(directory),s=records(record,resource),p=await attach(f,record,s),c=await caller(f,record,p.scope);for(let i=0;i<32;i++)await c.client.call('put',{key:'k'+i,value:'v'});await assert.rejects(c.client.call('put',{key:'overflow',value:'v'}),{code:'RESOURCE_EXHAUSTED'});assert.equal(s.health(),'DEGRADED');await c.client.call('get',{key:'k0'});assert.equal(s.health(),'READY');await resource.close();await assert.rejects(c.client.call('get',{key:'k0'}),{code:'UNAVAILABLE'});assert.equal(s.health(),'UNAVAILABLE');assert.equal(f.host.inspect().instances.find(i=>i.id===p.id).state,'ACTIVE');}finally{await close(f);rmSync(directory,{recursive:true,force:true});}
});
test('PUBLIC_HOST undeclared data-domain rejected by reference, not filesystem confinement',{timeout:10000},async()=>{const directory=mkdtempSync(join(tmpdir(),'phase50-authority-')),f=hostFixture();try{await assert.rejects(attach(f,record,records(record,fileRecords(directory),{domain:'unowned.records'})),{code:'FAILED_PRECONDITION'});}finally{await close(f);rmSync(directory,{recursive:true,force:true});}});
test('PUBLIC_HOST scope identity cannot be changed by a forged grant',{timeout:10000},async()=>{const f=hostFixture();try{const p=await attach(f,echo,stateless(echo)),id=f.discover({requires:[requirement(echo)],scope:p.scope});assert.throws(()=>f.grant(id,echo.id,['echo'],{scopeIdentity:{scope:'missing-scope',scopeGeneration:1}}),{code:'PERMISSION_DENIED'});await assert.rejects(f.host.activate(id),{code:'PERMISSION_DENIED'});}finally{await close(f);}});
