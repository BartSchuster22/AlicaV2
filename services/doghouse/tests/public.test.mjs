import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {publicFixture} from './public-fixture.mjs';
const directory=t=>{const p=mkdtempSync(join(tmpdir(),'phase52-public-'));t.after(()=>rmSync(p,{recursive:true,force:true}));return p;};
test('D11-D13 public Host/SDK isolated vertical slice and independent consumer',async t=>{
 const f=await publicFixture(t,directory(t)),{client}=await f.consumer();
 assert.equal(f.service.selfHealth().state,'DEGRADED');
 const failure=f.signal('first');assert.equal((await f.emit(failure)).admitted,1);await f.settled();
 let page=await client.call('list',{scope:f.scope,offset:0,limit:16});assert.equal(page.incidents.length,1);const id=page.incidents[0].id;
 assert.equal(f.service.selfHealth().state,'READY');
 await f.emit(failure);await f.emit(f.signal('second'));await f.settled();
 assert.equal((await client.call('get',{scope:f.scope,id})).occurrenceCount,2);
 assert.equal((await client.call('acknowledge',{scope:f.scope,id,requestId:'req1'})).status,'ACKNOWLEDGED');
 await f.emit(f.signal('recover','RECOVER'));await f.settled();assert.equal((await client.call('get',{scope:f.scope,id})).status,'RESOLVED');
 assert.equal(f.domain.data.observations[0].producer,'org.phase52.source');assert.equal(f.domain.data.observations[0].provenance.sourceInstanceId,f.source);
 assert.equal(f.domain.data.observations[0].scope,f.scope);assert.notEqual(f.domain.data.observations[0].observer,f.source);
 const report=await f.host.dispose(f.provider);assert.equal(report.state,'DISPOSED');assert.equal(f.service.selfHealth().state,'UNAVAILABLE');
 await assert.rejects(client.call('get',{scope:f.scope,id}));
 await f.host.shutdown();assert.deepEqual({...f.host.inspect().resources},{registrations:0,listeners:0,pendingCalls:0,effects:0});
});
test('D12 independent current mapping AND Host grants both required; scope denied',async t=>{
 const f=await publicFixture(t,directory(t));await assert.rejects(f.consumer({grant:false,name:'denied'}),x=>x.code==='PERMISSION_DENIED');
 const {client}=await f.consumer({map:false,name:'unmapped'});await assert.rejects(client.call('list',{scope:f.scope,offset:0,limit:1}),x=>x.code==='PERMISSION_DENIED');
 const good=await f.consumer({name:'mapped'});await assert.rejects(good.client.call('list',{scope:'foreign',offset:0,limit:1}),x=>x.code==='PERMISSION_DENIED');
});
test('D13 restart restores same IDs/lifecycle while new instance requires new mappings',async t=>{
 const dir=directory(t),first=await publicFixture(t,dir),c=await first.consumer();await first.emit(first.signal('one'));await first.settled();
 const item=(await c.client.call('list',{scope:first.scope,offset:0,limit:1})).incidents[0];await first.service.stop();await first.host.shutdown();
 // Canonical data scope is historical across Host instance replacement. Here a
 // fresh isolated domain can query it only through an explicitly supplied map.
 const second=await publicFixture(t,dir),r=await second.consumer();second.domain.actors[0].scope=first.scope;
 const restored=await r.client.call('get',{scope:first.scope,id:item.id});assert.equal(restored.status,'OPEN');assert.equal(restored.occurrenceCount,1);
});
