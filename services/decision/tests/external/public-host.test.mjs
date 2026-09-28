import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicDecisionHost } from '../../service/public-host.mjs';
import { neutralProvider } from '../../provider/neutral.mjs';
import { consumer } from '../../../../examples/decision-consumer/consumer.mjs';
import { consumeSnapshot } from '@alica/catalog/release';
const snapshot=JSON.parse(readFileSync(new URL('../../../../catalog/proposals/decision-evaluate/snapshot.json',import.meta.url),'utf8'));
const descriptor=consumeSnapshot(snapshot).entries[0].descriptor;
const request={state:{json:'{}'},questions:[{name:'q',kind:'boolean',instructions:{json:'{}'}}]};
const options=()=>({deadlineMs:Date.now()+1500});
async function clean(runtime){
  const c=await runtime.close();
  assert.deepEqual({...c.resources},{registrations:0,listeners:0,pendingCalls:0,effects:0});
  assert.equal(c.unsettledWork,0);assert.equal(c.backend.pending,0);assert.equal(c.backend.closed,true);
  for(const r of c.instances){assert.deepEqual(r.failedDisposers,[]);assert.equal(r.restartRequired,false);assert.equal(r.timedOutResources,0);}
}
test('public Host signed inventory, generic neutral call, grant denial and source-preserving caller',async()=>{
  const runtime=await publicDecisionHost(descriptor,neutralProvider());
  try{
    const c=await runtime.caller(consumer,snapshot);
    const r=await c.evaluate(request,options());assert.equal(r.provider,'neutral-reference');
    await assert.rejects(runtime.caller(consumer,snapshot,{authorized:false}),{code:'PERMISSION_DENIED'});
    assert.equal(runtime.inspect().backend.dispatched,1);
  }finally{await clean(runtime);}
});
test('public Host unload/restart and stale handle; fresh instance/grants only',async()=>{
  const a=await publicDecisionHost(descriptor,neutralProvider());let stale;
  try{stale=await a.caller(consumer,snapshot);await stale.evaluate(request,options());await a.disposeService();await assert.rejects(stale.evaluate(request,options()),e=>['FAILED_PRECONDITION','UNAVAILABLE'].includes(e.code));}finally{await clean(a);}
  const b=await publicDecisionHost(descriptor,neutralProvider());
  try{const fresh=await b.caller(consumer,snapshot);await fresh.evaluate(request,options());await assert.rejects(stale.evaluate(request,options()));}finally{await clean(b);}
});
test('public Host disabled provider and incompatible capability version never dispatch',async()=>{
  const runtime=await publicDecisionHost(descriptor,neutralProvider(),{enabled:false});
  try{
    const c=await runtime.caller(consumer,snapshot);await assert.rejects(c.evaluate(request,options()),{code:'FAILED_PRECONDITION'});
    await assert.rejects(runtime.caller(consumer,snapshot,{requirementOverride:{capabilityId:descriptor.id,major:2,minMinor:0,operations:['evaluate'],features:[]}}),e=>['INCOMPATIBLE_VERSION','NOT_FOUND'].includes(e.code));
    assert.equal(runtime.inspect().backend.dispatched,0);
    const wrong=structuredClone(snapshot);wrong.digest='sha256:'+'0'.repeat(64);assert.throws(()=>consumer(wrong));
  }finally{await clean(runtime);}
});
test('public Host raw backend failure normalized; malformed request rejected before dispatch',async()=>{
  const runtime=await publicDecisionHost(descriptor,{id:'fixture-failure',async evaluate(){throw new Error('SECRET_STATE_CANARY');}});
  try{
    const c=await runtime.caller(consumer,snapshot);
    await assert.rejects(c.evaluate({...request,questions:[]},options()),{code:'INVALID_ARGUMENT'});assert.equal(runtime.inspect().backend.dispatched,0);
    await assert.rejects(c.evaluate(request,options()),e=>e.code==='UNAVAILABLE'&&!String(e).includes('CANARY'));
    assert.equal(runtime.inspect().backend.dispatched,1);
  }finally{await clean(runtime);}
});
for(const action of ['cancel','deadline','unload'])test('public Host in-flight '+action+' aborts effect-owned backend and joins cleanup',async()=>{
  let started,aborted=false;const entered=new Promise(r=>started=r);
  const runtime=await publicDecisionHost(descriptor,{id:'fixture-wait',evaluate(_r,{signal}){return new Promise((_resolve,reject)=>{started();const stop=()=>{aborted=true;reject(Object.assign(new Error('CANCELLED'),{code:'CANCELLED'}));};if(signal.aborted)stop();else signal.addEventListener('abort',stop,{once:true});});}});
  try{
    const c=await runtime.caller(consumer,snapshot), controller=new AbortController();
    const pending=c.evaluate(request,{deadlineMs:Date.now()+(action==='deadline'?100:1500),signal:controller.signal});
    const rejected=assert.rejects(pending,e=>['CANCELLED','DEADLINE_EXCEEDED','UNAVAILABLE','FAILED_PRECONDITION'].includes(e.code));
    await entered;
    if(action==='cancel')controller.abort();
    if(action==='unload')await runtime.disposeService();
    await rejected;
    // Closing joins the actual effect-owned cancellation, not a sleep-based guess.
  }finally{await clean(runtime);}
  assert.equal(aborted,true);
});
