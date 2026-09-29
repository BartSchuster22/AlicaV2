import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical} from '@alica/acap-contracts';
import {fixture,error,target} from './fixture.mjs';
import {correlation} from '../contracts.mjs';
test('D14-D16 canonical roundtrip with acknowledgements, resolutions and compatible continuation',async t=>{
 const a=fixture(t),b=fixture(t);await a.domain.ingest(a.signal('fail1'),'observer-original');
 const id=a.domain.data.incidents[0].id;await a.domain.operation('acknowledge',{scope:'scopeA',id,requestId:'ack1'},a.context());
 await a.domain.ingest(a.signal('fail2','FAIL',1),'observer-original');
 const text=a.domain.export();b.domain.import(text);assert.equal(b.domain.export(),text);
 assert.equal(b.domain.data.observations[0].observer,'observer-original');assert.equal(b.domain.data.incidents[0].acknowledgements[0].actor,'fixture-actor');
 assert.throws(()=>b.domain.import(text),error('FAILED_PRECONDITION'));
 const again=a.signal('fail1');again.eventId='redelivery';again.sourceInstanceId='new-current';
 b.domain.targets=[];await assert.rejects(b.domain.ingest(again,'new-observer'),error('PERMISSION_DENIED'));
 b.domain.targets=[{...target,instanceId:'new-current'}];assert.equal((await b.domain.ingest(again,'new-observer')).duplicate,true);assert.equal(b.domain.data.incidents[0].occurrenceCount,2);
 const recovery=a.signal('recover','RECOVER',2);recovery.sourceInstanceId='new-current';await b.domain.ingest(recovery,'new-observer');assert.equal(b.domain.data.incidents[0].status,'RESOLVED');
 const c=fixture(t);c.domain.import(b.domain.export());assert.equal(c.domain.export(),b.domain.export());
});
test('D15 imported producer/actor history grants neither query nor duplicate ingestion',async t=>{
 const a=fixture(t),b=fixture(t,{actors:[],targets:[]});await a.domain.ingest(a.signal(),'original');b.domain.import(a.domain.export());
 assert.throws(()=>b.domain.operation('list',{scope:'scopeA',offset:0,limit:1},a.context()),error('PERMISSION_DENIED'));
 await assert.rejects(b.domain.ingest(a.signal(),'observer'),error('PERMISSION_DENIED'));assert.equal(b.domain.data.incidents[0].occurrenceCount,1);
});
test('D16 unavailable historical rule preserved as HISTORICAL_ONLY, never reassessed or acknowledged',async t=>{
 const a=fixture(t),b=fixture(t);await a.domain.ingest(a.signal(),'historical-observer');const x=JSON.parse(a.domain.export());
 for(const o of x.observations)o.rule={id:'historical-v1-report',version:'0.1.0'};
 for(const i of x.incidents){i.rule={id:'historical-v1-report',version:'0.1.0'};i.compatibility='HISTORICAL_ONLY';i.classification='legacy-health-failure';i.correlationKey=correlation(i);}
 b.domain.import(canonical(x));assert.equal(b.domain.export(),canonical(x));
 const old=x.incidents[0];assert.equal((await b.get(old.id)).compatibility,'HISTORICAL_ONLY');
 await assert.rejects(b.domain.operation('acknowledge',{scope:'scopeA',id:old.id,requestId:'no-authority'},b.context()),error('FAILED_PRECONDITION'));
 await b.domain.ingest(b.signal('new-current','FAIL',1),'current-observer');assert.equal(b.domain.data.incidents.length,2);assert.equal(b.domain.data.incidents[0].classification,'legacy-health-failure');
});
for(const [name,mutate] of [
 ['extra grants',x=>x.grants=[]],['foreign schema',x=>x.schema='other/v1'],['count mismatch',x=>x.incidents[0].occurrenceCount=2],
 ['missing reference',x=>x.incidents[0].occurrences=['missing']],['dedupe mismatch',x=>x.dedupe[0].contentHash='0'.repeat(64)],
 ['duplicate observation',x=>x.observations.push(x.observations[0])],['privileged evidence',x=>x.observations[0].evidence.credentials='secret'],
 ['wrong correlation',x=>x.incidents[0].correlationKey='forged'],['invalid timestamp',x=>x.observations[0].occurredAtMs=-1],
 ['incompatible labelled current',x=>x.incidents[0].rule.version='9.0.0'],['unbacked resolution',x=>x.incidents[0].status='RESOLVED']
])test('D15 rejected import is atomic: '+name,async t=>{const a=fixture(t),b=fixture(t);await a.domain.ingest(a.signal(),'observer');const x=JSON.parse(a.domain.export());mutate(x);assert.throws(()=>b.domain.import(JSON.stringify(x)));assert.equal(b.domain.data.observations.length,0);});
test('D15 oversized/malformed import and nonempty target reject before mutation',async t=>{const b=fixture(t);assert.throws(()=>b.domain.import('x'.repeat(1048577)),error('RESOURCE_EXHAUSTED'));assert.throws(()=>b.domain.import('{'),error('INVALID_ARGUMENT'));assert.equal(b.domain.data.incidents.length,0);});
test('D17 acknowledgement retry content collision is durable and actor-bound',async t=>{
 const f=fixture(t);const a=await f.domain.ingest(f.signal('a'),'observer');await f.domain.operation('acknowledge',{scope:'scopeA',id:a.incidentId,requestId:'same'},f.context());
 await f.domain.ingest(f.signal('r','RECOVER',1),'observer');const b=await f.domain.ingest(f.signal('b','FAIL',2),'observer');
 await assert.rejects(f.domain.operation('acknowledge',{scope:'scopeA',id:b.incidentId,requestId:'same'},f.context()),error('CONFLICT'));
 assert.equal(f.domain.data.incidents[1].status,'OPEN');
});
