// Local Decision handoff unit fixtures. NOT public Host qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pluginBackend, attachBackend, topics } from '../../service/host-link.mjs';
function bus(){
  const subscriptions=[],messages=[];
  const make=(principal,instanceId)=>{
    const own=[],peer={principal,instanceId,scope:'root',scopeGeneration:1};let sequence=0;
    const context={...peer,async effect(fn){return fn(f=>own.push(f));},on(type,handler){const r={type,handler};subscriptions.push(r);const dispose=async()=>{const n=subscriptions.indexOf(r);if(n>=0)subscriptions.splice(n,1);};own.push(dispose);return dispose;},async emit(type,data){const e={type,data,sourceProvider:principal,sourceInstanceId:instanceId,sourceScope:'root',scopeGeneration:1,sequence:++sequence};messages.push(e);const targets=subscriptions.filter(s=>s.type===type);for(const s of targets)queueMicrotask(()=>s.handler(e));return {admitted:targets.length};}};
    return {context,peer,async close(){for(const f of own.reverse())await f();}};
  };
  const service=make('org.phase4.service','service'),backend=make('org.phase4.backend','backend');
  return {service,backend,messages,async deliver(e){for(const s of subscriptions.filter(s=>s.type===e.type))await s.handler(e);}};
}
const options=()=>({signal:new AbortController().signal,deadlineMs:Date.now()+1000});
async function pair(provider){const b=bus();const link=await attachBackend(b.backend.context,b.service.peer,provider);const p=await pluginBackend(b.service.context,b.backend.peer,provider.id,'session');return {...b,link,p,async close(){await b.service.close();await b.backend.close();assert.equal(link.inspect().pending,0);}};}
test('handoff returns result; forged reply identity/generation/correlation ignored',async()=>{
  let enter,release;const entered=new Promise(r=>enter=r);
  const x=await pair({id:'fixture',evaluate(){enter();return new Promise(r=>release=r);}});
  try{
    let settled=false;const p=x.p.evaluate({},options()).then(v=>{settled=true;return v;});await entered;
    const id=x.messages[0].data.id;
    const good={type:topics.reply,sourceProvider:x.backend.peer.principal,sourceInstanceId:'backend',sourceScope:'root',scopeGeneration:1,sequence:1,data:{id,status:'ok',result:{provider:'forged'}}};
    await x.deliver({...good,sourceInstanceId:'foreign'});await x.deliver({...good,scopeGeneration:2});await x.deliver({...good,data:{...good.data,id:'foreign'}});
    assert.equal(settled,false);release({provider:'fixture'});
    // The valid but wrong-correlation fixture above consumes its sequence; real
    // peer must advance its stream. Simulate that peer's unrelated valid event.
    await x.backend.context.emit('unrelated',{});
    assert.equal((await p).provider,'fixture');
  }finally{await x.close();}
});
test('handoff singleflight rejects competing request with no second backend dispatch',async()=>{
  let enter,release;const entered=new Promise(r=>enter=r);
  const x=await pair({id:'fixture',evaluate(){enter();return new Promise(r=>release=r);}});
  try{const first=x.p.evaluate({},options());await entered;await assert.rejects(x.p.evaluate({},options()),{code:'RESOURCE_EXHAUSTED'});release({provider:'fixture'});await first;assert.equal(x.link.inspect().dispatched,1);}finally{await x.close();}
});
test('handoff raw provider failure normalized without message or cause',async()=>{
  const x=await pair({id:'fixture',async evaluate(){throw new Error('SECRET_STATE_CANARY');}});
  try{await assert.rejects(x.p.evaluate({},options()),e=>e.code==='UNAVAILABLE'&&!String(e).includes('CANARY')&&!e.cause);}finally{await x.close();}
});
for(const kind of ['cancel','unload'])test('handoff '+kind+' aborts and joins owned request',async()=>{
  let enter,aborted=false;const entered=new Promise(r=>enter=r);
  const x=await pair({id:'fixture',evaluate(_r,{signal}){return new Promise((_resolve,reject)=>{enter();signal.addEventListener('abort',()=>{aborted=true;reject(Object.assign(new Error('CANCELLED'),{code:'CANCELLED'}));},{once:true});});}});
  const controller=new AbortController();const done=assert.rejects(x.p.evaluate({},{signal:controller.signal,deadlineMs:Date.now()+1000}),e=>['CANCELLED','UNAVAILABLE'].includes(e.code));
  await entered;if(kind==='cancel')controller.abort();
  await x.close();await done;assert.equal(aborted,true);assert.equal(x.link.inspect().closed,true);
});
test('handoff deadline/pre-cancellation/closed state reject before dispatch',async()=>{
  const x=await pair({id:'fixture',async evaluate(){throw new Error('unexpected');}});
  await assert.rejects(x.p.evaluate({},{...options(),deadlineMs:0}),{code:'DEADLINE_EXCEEDED'});
  const c=new AbortController();c.abort();await assert.rejects(x.p.evaluate({},{...options(),signal:c.signal}),{code:'CANCELLED'});
  await x.close();await assert.rejects(x.p.evaluate({},options()),{code:'UNAVAILABLE'});assert.equal(x.messages.length,0);
});
