import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {consumeSnapshot} from '@alica/catalog/release';
import {createPluginContext} from '@alica/plugin-sdk';
import {fixture} from '../integrations/hermes/tests/topology.test.mjs';
import {providerSource,bridgeEvents} from '../integrations/hermes/adapter/bridge.mjs';
import {publicDecisionHost} from '../services/decision/service/public-host.mjs';
import {jevProvider,discoverModels} from '../services/decision/providers/typesafe-jev/index.mjs';
import {consumer} from '../examples/decision-consumer/consumer.mjs';
import {publicFixture} from '../services/doghouse/tests/public-fixture.mjs';
import {event} from '../services/doghouse/contracts.mjs';
process.chdir('/work');
const result={H:[],D:[],G:[],liveProviderCalls:0,remediation:0};
const hs=JSON.parse(readFileSync('/work/catalog/proposals/agent-execution/snapshot.json','utf8')),hd=consumeSnapshot(hs).entries.find(e=>e.definition.metadata.id==='acap://alica.io/agent/execution@1').descriptor;
for(let round=0;round<2;round++){
 const clean=[],f=fixture({after:x=>clean.push(x)},hd);
 try{
  const p=f.host.discover(f.pkg('org.phase5i.hermes',providerSource(hd),true,bridgeEvents));
  for(const event of bridgeEvents)f.host.issueGrant({schemaVersion:'acap.event-grant/v1',grantId:randomUUID(),...f.host.identity(p),eventType:event.id,operations:['publish','subscribe'],issuedAtMs:Date.now()-1,expiresAtMs:Date.now()+10000,revision:0});
  await f.host.activate(p);const identity=f.host.identity(p);
  const c=f.host.discover(f.pkg('org.phase5i.denied','export async function activate(){}',false));await f.host.activate(c);
  await assert.rejects(f.host.context(c).optional({capabilityId:hd.id,major:1,minMinor:0,operations:['execute'],features:[]}),{code:'PERMISSION_DENIED'});
  assert.equal(f.host.inspect().resources.registrations,1);await f.host.shutdown();assert.deepEqual({...f.host.inspect().resources},{registrations:0,listeners:0,effects:0,pendingCalls:0});
  result.H.push({round,identity,registration:true,denialBeforeExecute:true,runnerAttached:false,executeInvocations:0,resources:f.host.inspect().resources,evidenceClass:'REAL_COMPONENT'});
 }finally{for(const fn of clean)await fn();}
}
assert.notEqual(result.H[0].identity.instanceId,result.H[1].identity.instanceId);
const ds=JSON.parse(readFileSync('/work/catalog/proposals/decision-evaluate/snapshot.json','utf8')),dd=consumeSnapshot(ds).entries[0].descriptor;
let stale;
for(let round=0;round<2;round++){
 const dispatch=[];let bad=false;const transport={async send(x){dispatch.push({kind:x.kind,body:x.body});if(x.kind==='discovery')return JSON.stringify({models:[{name:'fixture-model',description:'Synthetic offline reference model',release_date:'2026-09-01'}]});assert.equal(JSON.parse(x.body).model,'fixture-model');return JSON.stringify({model:'fixture-model',answers:bad?{}:{q:{type:'noul',noul:0.75}},usage:{input_tokens:1,output_tokens:1}});}};
 const models=await discoverModels(transport,{deadlineMs:Date.now()+1500});const provider=jevProvider({transport,models,model:'fixture-model'});assert.equal(provider.id,'typesafe-jev');const runtime=await publicDecisionHost(dd,provider);let didClose=false;
 try{
  const c=await runtime.caller(consumer,ds);const req={state:{json:'{}'},questions:[{name:'q',kind:'boolean',instructions:{json:'{}'}}]};
  const r=await c.evaluate(req,{deadlineMs:Date.now()+1500});assert.equal(r.provider,'typesafe-jev');assert.equal(r.answers[0].probability,'0.75');
  const before=dispatch.length;await assert.rejects(runtime.caller(consumer,ds,{authorized:false}),{code:'PERMISSION_DENIED'});assert.equal(dispatch.length,before);
  bad=true;await assert.rejects(c.evaluate(req,{deadlineMs:Date.now()+1500}),{code:'CONTRACT_MISMATCH'});assert.equal(dispatch.length,3);
  if(stale){const n=dispatch.length;await assert.rejects(stale.evaluate(req,{deadlineMs:Date.now()+1500}));assert.equal(dispatch.length,n);}
  stale=c;const closed=await runtime.close();didClose=true;assert.deepEqual({...closed.resources},{registrations:0,listeners:0,effects:0,pendingCalls:0});assert.equal(closed.unsettledWork,0);assert.equal(closed.backend.pending,0);
  result.D.push({round,provider:r.provider,model:r.model,fixtureDispatches:dispatch,deniedWithoutDispatch:true,mappedFailure:'CONTRACT_MISMATCH',clean:closed.resources,evidenceClass:'OFFLINE_PROVIDER',remoteBoundary:'MOCK',liveAuthorityRenewed:false});
 }finally{if(!didClose)await runtime.close();}
}
const directory=mkdtempSync('/tmp/phase5i-two-source-');let receipt;
try{for(let round=0;round<2;round++){
 const clean=[],f=await publicFixture({after:x=>clean.push(x)},directory);
 try{
  const c=await f.consumer();let observations;
  if(round===0){
   const source=f.load({id:'org.phase5i.source.b',provides:[],events:[event],publish:true,code:'export function activate(){}'},f.scope);
   f.grant(source,undefined,['publish'],{schemaVersion:'acap.event-grant/v1',eventType:event.id,scope:'root',scopeGeneration:1});f.grant(source,undefined,['publish'],{schemaVersion:'acap.event-grant/v1',eventType:event.id});await f.host.activate(source);
   const sid=f.host.identity(source),a=f.host.identity(f.source);f.domain.targets.push({principal:sid.principal,instanceId:sid.instanceId,generation:sid.scopeGeneration,scope:sid.scope,target:'isolated-target-b'});
   await f.emit(f.signal('multi-a'));await createPluginContext(f.host.context(source)).events(event).emit({...f.signal('multi-b'),target:'isolated-target-b'});await f.settled();
   const records=await c.client.call('list',{scope:f.scope,offset:0,limit:10},{deadlineMs:Date.now()+1500});assert.equal(records.incidents.length,2);assert.deepEqual(records.incidents.map(x=>x.target).sort(),['isolated-target','isolated-target-b']);
   await f.emit({...f.signal('cross-source-denied'),target:'isolated-target-b'});await f.settled();const unchanged=await c.client.call('list',{scope:f.scope,offset:0,limit:10},{deadlineMs:Date.now()+1500});assert.deepEqual(unchanged.incidents,records.incidents);
   await assert.rejects(c.client.call('list',{scope:'unmapped-scope',offset:0,limit:10},{deadlineMs:Date.now()+1500}),{code:'PERMISSION_DENIED'});
   receipt={scope:f.scope,records:records.incidents,sources:[a,sid]};assert.notEqual(a.principal,sid.principal);observations='two authorized synthetic service-source observations; cross-source target rejected';
  }else{
   f.domain.actors.find(x=>x.actor==='reader').scope=receipt.scope;const records=await c.client.call('list',{scope:receipt.scope,offset:0,limit:10},{deadlineMs:Date.now()+1500});assert.deepEqual(records.incidents,receipt.records);observations='both persisted incidents recovered without new observations';
  }
  await f.host.shutdown();assert.deepEqual({...f.host.inspect().resources},{registrations:0,listeners:0,effects:0,pendingCalls:0});result.G.push({round,observations,sources:receipt.sources,records:receipt.records,clean:f.host.inspect().resources,evidenceClass:'REAL_COMPONENT',inputs:'MOCK synthetic signals; NOT live telemetry',productionProbes:0,remediation:0});
 }finally{for(const fn of clean)await fn();}
}}finally{rmSync(directory,{recursive:true,force:true});}
console.log('REVIEW_CLOSURES_PASS '+JSON.stringify(result));
