import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hostFixture} from '../../service-foundation/conformance/host-fixture.mjs';
import {requirement} from '../../service-foundation/reference/services.mjs';
import {neutral} from './provider.mjs';
const d=JSON.parse(readFileSync(new URL('../../catalog/capabilities/core/echo/descriptor.json',import.meta.url)));
async function caller(f,scope,authorized=true){const id=f.discover({requires:[requirement(d)],scope});if(authorized){if(scope!=='root')f.grant(id,d.id,['echo'],{scopeIdentity:{scope:'root',scopeGeneration:1}});f.grant(id,d.id,['echo']);}await f.host.activate(id);return{id,handle:await f.host.context(id).require(requirement(d))};}
async function setup(options={}){
 const f=hostFixture({cleanupMs:1000,activationMs:1000}),identities=new Map();let seen;
 const service=neutral(d,c=>{seen=c;return identities.get(c.instanceId);},options);
 const source="import {AcapError} from '@alica/acap-contracts';let release;export function activate(c){release=c.provide("+JSON.stringify(d)+",{echo:async()=>{await release();throw new AcapError('UNAVAILABLE');}});}";
 const id=f.discover({descriptor:d,source});await f.host.activate(id);
 const probe=await caller(f,'root');await assert.rejects(probe.handle.call('echo',{text:'bootstrap'},{deadlineMs:Date.now()+1000}),{code:'UNAVAILABLE'});await f.host.dispose(probe.id);
 const context=f.host.context(id).createScope();await service.plugin.activate(context);
 const c=await caller(f,context.scope);identities.set(c.id,{actor:'actor:'+c.id,scope:'tenant:offline',permissions:['neutral.echo']});
 return {f,id,c,context,service,identities,seen:()=>seen,call:(text,options={})=>c.handle.call('echo',{text},{deadlineMs:Date.now()+1000,...options}),async close(){const report=await f.close();assert.equal(report.resources.pendingCalls,0);assert.equal(report.resources.registrations,0);assert.equal(service.active(),0);for(const i of report.instances){assert.equal(i.cleanup.timedOutResources,0);assert.deepEqual([...i.cleanup.failedDisposers],[]);}}};
}
test('M3 public Host/SDK registration, Python invocation, trusted caller, forged inputs and missing authority',{timeout:15000},async()=>{const s=await setup();try{
 assert.deepEqual(JSON.parse(JSON.stringify(await s.call('python'))),{text:'python'});
 assert.equal(s.seen().instanceId,s.c.id);assert.equal(s.seen().scope,s.context.scope);
 assert.equal(s.seen().principal,s.f.host.context(s.c.id).principal);
 assert.deepEqual(JSON.parse((await s.call('__authority__')).text),s.identities.get(s.c.id));
 for(const forgery of [{actor:'admin'},{permissions:['memory.admin']},{caller:{principal:'admin'}},{scope:'global'}])await assert.rejects(s.c.handle.call('echo',{text:'forged',...forgery},{deadlineMs:Date.now()+1000}),{code:'INVALID_ARGUMENT'});
 await assert.rejects(caller(s.f,s.context.scope,false),{code:'PERMISSION_DENIED'});
 s.identities.delete(s.c.id);await assert.rejects(s.call('no mapping'),{code:'PERMISSION_DENIED'});
}finally{await s.close();}});
test('M3 crash, malformed frame, response limit, restart/new child and stale handle',{timeout:15000},async()=>{const s=await setup();try{
 for(const text of ['__crash__','__malformed__'])await assert.rejects(s.call(text),{code:'UNAVAILABLE'});
 await assert.rejects(s.call('__oversize__'),{code:'RESOURCE_EXHAUSTED'});
 assert.deepEqual(JSON.parse(JSON.stringify(await s.call('recovered'))),{text:'recovered'});
 await s.f.host.dispose(s.id);await assert.rejects(s.call('stale'));
}finally{await s.close();}});
test('M3 deadlines, cancellation and disposal reap actual Python child',{timeout:15000},async()=>{const s=await setup();try{
 await assert.rejects(s.call('__hang__',{deadlineMs:Date.now()+60}),{code:'DEADLINE_EXCEEDED'});
 const ac=new AbortController(),pending=s.call('__hang__',{signal:ac.signal});setTimeout(()=>ac.abort(),40);await assert.rejects(pending,{code:'CANCELLED'});
 const stopping=s.call('__hang__');const caught=assert.rejects(stopping);await new Promise(r=>setTimeout(r,40));await s.f.host.dispose(s.id);await caught;
}finally{await s.close();}});
test('M3 bounded admission and request-frame bytes, no queue',{timeout:15000},async()=>{const s=await setup();try{
 await assert.rejects(s.call('\u0000'.repeat(4096)),{code:'RESOURCE_EXHAUSTED'});
 const ac=new AbortController();const pending=Array.from({length:4},()=>s.call('__hang__',{signal:ac.signal}));
 const checked=pending.map(p=>assert.rejects(p,{code:'CANCELLED'}));
 const until=Date.now()+500;while(s.service.active()<4&&Date.now()<until)await new Promise(r=>setTimeout(r,2));
 assert.equal(s.service.active(),4);await assert.rejects(s.call('overflow'),{code:'RESOURCE_EXHAUSTED'});
 ac.abort();await Promise.all(checked);
}finally{await s.close();}});
test('M3 executable unavailable bounded and normalized',{timeout:15000},async()=>{const s=await setup({python:'/nonexistent-phase51-python'});try{await assert.rejects(s.call('x'),{code:'UNAVAILABLE'});}finally{await s.close();}});
