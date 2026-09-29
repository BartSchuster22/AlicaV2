import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {canonical} from '@alica/acap-contracts';
import {fixture,error} from './fixture.mjs';
import {contentHash,correlation} from '../contracts.mjs';
import {FileStore} from '../store.mjs';
async function history(t){
 const a=fixture(t);for(const [id,kind,time] of [['first','FAIL',0],['recovered','RECOVER',10],['next','FAIL',20],['last','RECOVER',30]])await a.domain.ingest(a.signal(id,kind,time),'observer');
 return {a,x:JSON.parse(a.domain.export())};
}
function move(x,id,time){const o=x.observations.find(o=>o.sourceObservationId===id),i=x.incidents.find(i=>i.occurrences.includes(o.id));o.occurredAtMs=o.observedAtMs=time;i.firstObservedAtMs=i.lastObservedAtMs=i.windowStartMs=time;x.dedupe.find(d=>d.observationId===o.id).contentHash=contentHash(o);}
function activate(x){const i=x.incidents[0],id=i.resolutions[0].observationId; x.observations=x.observations.filter(o=>o.id!==id);const d=x.dedupe.find(d=>d.observationId===id);x.dedupe=x.dedupe.filter(v=>v!==d);i.dedupeKeys=i.dedupeKeys.filter(k=>k!==d.key);i.resolutions=[];i.status='OPEN';i.lastDistinctObservationId=i.occurrences.at(-1);}
for(const [name,mutate] of [
 ['resolved overlap',(x,t)=>move(x,'next',t+5)],
 ['equal recovery/start',(x,t)=>move(x,'next',t+10)],
 ['equal starts',(x,t)=>move(x,'next',t)],
 ['active predecessor',x=>activate(x)],
 ['acknowledged predecessor',x=>{activate(x);const i=x.incidents[0];i.status='ACKNOWLEDGED';i.acknowledgements=[{actor:'fixture-actor',requestId:'old-ack',atMs:i.firstObservedAtMs}];x.ackRequests=[{actor:'fixture-actor',scope:i.scope,requestId:'old-ack',incidentId:i.id}];}]
])for(const reversed of [false,true])test(`R2 ${name}, reversed=${reversed}: atomic import, store commit/open rejection`,async t=>{
 const {a,x}=await history(t),b=fixture(t);mutate(x,a.clock.wall);if(reversed)x.incidents.reverse();
 const before=b.domain.export(),diskBefore=existsSync(b.store.file)?readFileSync(b.store.file):null;
 assert.throws(()=>b.domain.import(canonical(x)),error('FAILED_PRECONDITION'));assert.equal(b.domain.export(),before);assert.equal(existsSync(b.store.file),diskBefore!==null);
 const stored=readFileSync(a.store.file);assert.throws(()=>a.store.commit(x),error('FAILED_PRECONDITION'));assert.deepEqual(readFileSync(a.store.file),stored);
 await b.domain.close();writeFileSync(b.store.file,canonical({...x,schema:'doghouse.store/v1',generation:1}));const badBytes=readFileSync(b.store.file);
 const reopened=new FileStore(b.dir);assert.throws(()=>reopened.open(),error('FAILED_PRECONDITION'));assert.equal(reopened.opened,false);assert.equal(existsSync(join(b.dir,'.writer')),false);assert.deepEqual(readFileSync(b.store.file),badBytes);
});
test('R2 valid reversed recurrence survives restart and authorized continuation',async t=>{
 const {a,x}=await history(t),b=fixture(t);x.incidents.reverse();b.domain.import(canonical(x));await b.domain.close();b.domain.open();assert.equal(b.domain.export(),canonical(x));
 await b.domain.ingest(a.signal('later','FAIL',40),'observer');await b.domain.ingest(a.signal('later-recovery','RECOVER',50),'observer');assert.equal(b.domain.data.incidents.length,3);assert.ok(b.domain.data.incidents.every(i=>i.status==='RESOLVED'));
});
test('R2 unknown-rule overlapping historical-only evidence is not assigned understood semantics',async t=>{
 const {a,x}=await history(t),b=fixture(t);move(x,'next',a.clock.wall+5);for(const o of x.observations)o.rule={id:'legacy-unknown',version:'0.1.0'};for(const i of x.incidents){i.rule={id:'legacy-unknown',version:'0.1.0'};i.compatibility='HISTORICAL_ONLY';i.correlationKey=correlation(i);for(const r of i.resolutions)r.rule={...i.rule};}x.incidents.reverse();
 b.domain.import(canonical(x));assert.equal(b.domain.export(),canonical(x));await b.domain.ingest(a.signal('current','FAIL',40),'observer');assert.equal(b.domain.data.incidents.length,3);assert.deepEqual(b.domain.data.incidents.slice(0,2),x.incidents);
});
