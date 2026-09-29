import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {hostFixture} from '../service-foundation/conformance/host-fixture.mjs';
import {memoryProvider} from '../services/memoryv4/provider.mjs';
import {publicFixture} from '../services/doghouse/tests/public-fixture.mjs';
process.chdir('/work');
const python=resolve('.tools/memory-python/bin/python');
const d=JSON.parse(readFileSync('catalog/proposals/memory-candidates-v2/descriptor.json'));
const req={capabilityId:d.id,major:2,minMinor:0,operations:['create','get','search'],features:[]};
const input={requestKey:'durable-request-001',scope:'tenant:offline/project:a',title:'fixture',content:'lexical durable candidate',sourceRefs:['urn:offline:source'],provenance:{source:'offline fixture'}};
const plain=v=>JSON.parse(JSON.stringify(v));
async function setup(db,{runtime=python,shift=false}={}){
 const f=hostFixture({cleanupMs:1500,activationMs:1500}),identities=new Map();let resolutions=0;
 if(shift)f.discover();
 const service=memoryProvider(d,c=>{resolutions++;return identities.get(JSON.stringify([c.principal,c.instanceId,c.scope]));},{python:runtime,databasePath:db});
 const source="import {AcapError} from '@alica/acap-contracts';let release;export function activate(c){release=c.provide("+JSON.stringify(d)+",{get:async()=>{await release();throw new AcapError('UNAVAILABLE');},create:async()=>{},search:async()=>{}});}";
 const id=f.discover({descriptor:d,source});await f.host.activate(id);
 const grants=[],grantExpires=Date.now()+60000;
 async function caller(scope){const cid=f.discover({requires:[req],scope});for(const override of scope==='root'?[{}]:[{scope:'root',scopeGeneration:1},{}]){const grantId=randomUUID();f.host.issueGrant({schemaVersion:'acap.grant/v1',grantId,...f.host.identity(cid),...override,capabilityId:d.id,operations:req.operations,issuedAtMs:Date.now()-1,expiresAtMs:grantExpires,revision:0});grants.push(grantId);}await f.host.activate(cid);return {id:cid,handle:await f.host.context(cid).require(req)};}
 const probe=await caller('root');await assert.rejects(probe.handle.call('get',{scope:input.scope,id:'bootstrap'},{deadlineMs:Date.now()+2000}),{code:'UNAVAILABLE'});await f.host.dispose(probe.id);
 const context=f.host.context(id).createScope();await service.plugin.activate(context);
 const c=await caller(context.scope),principal=f.host.context(c.id).principal;
 const identity=JSON.stringify([principal,c.id,context.scope]);
 const trusted={actor:'worker:fixture',scope_path:'tenant:offline',permissions:['memory.create-working','memory.read','memory.search']};identities.set(identity,trusted);
 return {f,c,service,identities,identity,trusted,grants,resolutions:()=>resolutions,
 call:(op,data,opts={})=>c.handle.call(op,data,{deadlineMs:Date.now()+5000,...opts}),
 async close(){const report=await f.close();assert.equal(report.resources.pendingCalls,0);assert.equal(report.resources.registrations,0);assert.equal(service.active(),0);for(const i of report.instances){assert.equal(i.cleanup.timedOutResources,0);assert.deepEqual([...i.cleanup.failedDisposers],[]);}}};
}
const mode=process.argv[2];assert(['write','read'].includes(mode));
const receiptPath='/state/domain/receipt.json';
const old=mode==='read'?JSON.parse(readFileSync(receiptPath)):null;
const result={mode,evidenceClass:'REAL_COMPONENT',memory:null,doghouse:null};
const m=await setup('/state/domain/m/memory.sqlite3',{shift:mode==='read'});
try {
 const record=await m.call('create',input); // read round is authorized exact replay, not blind duplicate creation.
 if(old)assert.deepEqual(plain(record),old.memory.record);
 assert.equal((await m.call('get',{scope:input.scope,id:record.id})).id,record.id);
 assert.equal((await m.call('search',{scope:input.scope,query:'lexical',limit:25,cursor:''})).candidates[0].id,record.id);
 result.memory={record,scope:input.scope,actor:'worker:fixture',caller:m.c.id,replay:!!old};
} finally {await m.close();}
const cleanup=[];const f=await publicFixture({after:fn=>cleanup.push(fn)},'/state/domain/g');
try {
 const {client}=await f.consumer();
 if(mode==='write'){
  assert.equal(f.service.selfHealth().state,'DEGRADED');
  assert.equal((await f.emit(f.signal('phase5i-owned-synthetic-observation'))).admitted,1);await f.settled();
  const items=await client.call('list',{scope:f.scope,offset:0,limit:16});assert.equal(items.incidents.length,1);
  const id=items.incidents[0].id;
  const record=await client.call('acknowledge',{scope:f.scope,id,requestId:'phase5i-ack-001'});
  assert.equal(record.status,'ACKNOWLEDGED');result.doghouse={record:plain(record),scope:f.scope};
 } else {
  f.domain.actors[0].scope=old.doghouse.scope; // documented D13 current principal to historical data-scope mapping.
  const record=await client.call('get',{scope:old.doghouse.scope,id:old.doghouse.record.id});
  assert.deepEqual(plain(record),old.doghouse.record);assert.equal(f.service.selfHealth().state,'DEGRADED');
  result.doghouse={record:plain(record),scope:old.doghouse.scope,health:'DEGRADED',newObservationClaim:false};
 }
 await assert.rejects(client.call('list',{scope:'foreign',offset:0,limit:1}),{code:'PERMISSION_DENIED'});
} finally {
 await f.service.stop();await f.host.shutdown();assert.deepEqual({...f.host.inspect().resources},{registrations:0,listeners:0,pendingCalls:0,effects:0});
 for(const cleanupFn of cleanup.reverse())await cleanupFn();
}
if(mode==='write')writeFileSync(receiptPath,JSON.stringify(result,null,2)+'\n');
console.log('WHOLE_REFERENCE_DOMAIN_'+mode.toUpperCase()+'_PASS',JSON.stringify(result));
