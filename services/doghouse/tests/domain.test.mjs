import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Assurance} from '../core.mjs';
import {FileStore} from '../store.mjs';
import {fixture,error,caller} from './fixture.mjs';
test('D9-D10 native lifecycle distinct occurrences, acknowledgement, recovery, recurrence and restart',async t=>{
 const f=fixture(t),first=await f.domain.ingest(f.signal(),'observer');
 assert.equal((await f.get(first.incidentId)).status,'OPEN');
 await f.domain.ingest(f.signal('obs2','FAIL',1),'observer');
 const ack={scope:'scopeA',id:first.incidentId,requestId:'ack1'};
 assert.equal((await f.domain.operation('acknowledge',ack,f.context())).status,'ACKNOWLEDGED');
 await f.domain.operation('acknowledge',ack,f.context());assert.equal(f.domain.data.ackRequests.length,1);
 await f.domain.ingest(f.signal('obs3','RECOVER',2),'observer');assert.equal((await f.get(first.incidentId)).status,'RESOLVED');
 const next=await f.domain.ingest(f.signal('obs4','FAIL',3),'observer');assert.notEqual(next.incidentId,first.incidentId);
 const canonical=f.domain.export();await f.domain.close();
 const d=new Assurance(new FileStore(f.dir));d.open();assert.equal(d.export(),canonical);await d.close();
});
test('duplicate old redelivery is idempotent; payload conflict rejected',async t=>{
 const f=fixture(t),signal=f.signal();await f.domain.ingest(signal,'observer');f.clock.wall+=600000;
 const again=structuredClone(signal);again.eventId='other-envelope';assert.equal((await f.domain.ingest(again,'new-observer')).duplicate,true);
 again.data.signal='RECOVER';again.data.evidence.code='CHECK_RECOVERED';await assert.rejects(f.domain.ingest(again,'observer'),error('CONFLICT'));
 assert.equal(f.domain.data.incidents[0].occurrenceCount,1);
});
for(const [name,edit,code] of [
 ['forged producer',x=>x.sourceProvider='org.forged.source','PERMISSION_DENIED'],
 ['wrong instance',x=>x.sourceInstanceId='another','PERMISSION_DENIED'],
 ['wrong generation',x=>x.scopeGeneration=2,'PERMISSION_DENIED'],
 ['cross scope',x=>x.sourceScope='scopeB','PERMISSION_DENIED'],
 ['unregistered target',x=>x.data.target='targetB','PERMISSION_DENIED'],
 ['secret-bearing extra evidence',x=>x.data.evidence.token='secret','INVALID_ARGUMENT'],
 ['bad evidence hash',x=>x.data.evidence.sha256='z'.repeat(64),'INVALID_ARGUMENT'],
 ['future skew',x=>{x.data.occurredAtMs+=5001;x.data.observedAtMs+=5001;},'INVALID_ARGUMENT'],
 ['stale observation',x=>{x.data.occurredAtMs-=300001;x.data.observedAtMs-=300001;},'INVALID_ARGUMENT'],
 ['recovery evidence mismatch',x=>x.data.evidence.code='CHECK_RECOVERED','INVALID_ARGUMENT'],
 ['oversize',x=>x.data.unbounded='x'.repeat(5000),'RESOURCE_EXHAUSTED']
])test('D17 '+name,async t=>{const f=fixture(t),x=f.signal();edit(x);await assert.rejects(f.domain.ingest(x,'observer'),error(code));assert.equal(f.domain.data.observations.length,0);});
test('D17 out-of-order recovery cannot resolve; silence and self-health not recovery',async t=>{
 const f=fixture(t);await f.domain.ingest(f.signal(),'observer');await assert.rejects(f.domain.ingest(f.signal('later','RECOVER',-1),'observer'),error('FAILED_PRECONDITION'));
 f.clock.wall+=600000;assert.equal(f.domain.selfHealth().state,'DEGRADED');assert.equal(f.domain.data.incidents[0].status,'OPEN');
});
test('D17 query/ack scope and unknown manual operation denied',async t=>{
 const f=fixture(t),r=await f.domain.ingest(f.signal(),'observer');
 assert.throws(()=>f.domain.operation('get',{scope:'scopeB',id:r.incidentId},f.context()),error('PERMISSION_DENIED'));
 assert.throws(()=>f.domain.operation('get',{scope:'scopeA',id:r.incidentId},{caller:{...caller,instanceId:'forged'}}),error('PERMISSION_DENIED'));
 assert.throws(()=>f.domain.operation('resolve',{scope:'scopeA',id:r.incidentId},f.context()),error('INVALID_ARGUMENT'));
});
test('D17 durable write failure leaves no partial state; uncertain post-rename fails closed',async t=>{
 let point='beforeWrite';const f=fixture(t,{storeOptions:{checkpoint:p=>{if(p===point)throw Error('isolated fault');}}});
 await assert.rejects(f.domain.ingest(f.signal(),'observer'),error('UNAVAILABLE'));assert.equal(f.domain.data.observations.length,0);
 point='afterRename';await assert.rejects(f.domain.ingest(f.signal(),'observer'),error('UNAVAILABLE'));assert.equal(f.domain.selfHealth().state,'UNAVAILABLE');
 await f.domain.close();const s=new FileStore(f.dir);const restored=s.open();assert.equal(restored.observations.length,1);s.close();
});
test('D17 exclusive ownership and corrupt-store fail closed',async t=>{
 const f=fixture(t);assert.throws(()=>new FileStore(f.dir).open(),error('UNAVAILABLE'));await f.domain.close();writeFileSync(join(f.dir,'assurance.json'),'invalid');assert.throws(()=>new FileStore(f.dir).open(),error('FAILED_PRECONDITION'));assert.equal(readFileSync(join(f.dir,'assurance.json'),'utf8'),'invalid');
});
test('D17 occurrence capacity rejects without eviction',async t=>{const f=fixture(t);for(let n=0;n<32;n++)await f.domain.ingest(f.signal('o'+n,'FAIL',n),'observer');const before=f.domain.export();await assert.rejects(f.domain.ingest(f.signal('overflow','FAIL',33),'observer'),error('RESOURCE_EXHAUSTED'));assert.equal(f.domain.export(),before);});
test('D17 cooperative queue wait, overload, cancellation and shutdown refusal',async t=>{
 let unblock;const blocked=new Promise(r=>unblock=r);const f=fixture(t,{beforeWork:()=>blocked});
 const pending=Array.from({length:8},(_,n)=>f.domain.ingest(f.signal('q'+n,'FAIL',n),'observer').catch(e=>e));
 await assert.rejects(f.domain.ingest(f.signal('overflow'),'observer'),error('RESOURCE_EXHAUSTED'));
 f.clock.mono=251;unblock();const results=await Promise.all(pending);assert.equal(results.filter(x=>x.code==='DEADLINE_EXCEEDED').length,7);assert.equal(f.domain.data.observations.length,1); // First dequeued item is executing, not waiting.
 const abort=new AbortController();abort.abort();await assert.rejects(f.domain.operation('list',{scope:'scopeA',offset:0,limit:1},{...f.context(),signal:abort.signal}),error('CANCELLED'));
 await f.domain.close();await assert.rejects(f.domain.ingest(f.signal(),'observer'),error('UNAVAILABLE'));
});
test('D17 postcommit cooperative deadline reports uncertainty, retry is duplicate',async t=>{
 const f=fixture(t);f.store.checkpoint=p=>{if(p==='afterRename')f.clock.mono=1001;};
 const signal=f.signal();await assert.rejects(f.domain.ingest(signal,'observer'),error('DEADLINE_EXCEEDED'));assert.equal(f.domain.data.incidents.length,1);
 f.store.checkpoint=()=>{};assert.equal((await f.domain.ingest(signal,'observer')).duplicate,true);
});
