// H6/H7 bounded public bridge feasibility, not real Hermes/H12 evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPluginContext } from '@alica/plugin-sdk';
import { fixture } from './topology.test.mjs';
const descriptor={schemaVersion:'acap.capability/v1',id:'io.alica.phase3.probe',version:'1.0.0',features:[],operations:[{name:'execute',kind:'unary',idempotency:'none',input:{type:'string'},output:{type:'string'}}]};
const requirement={capabilityId:descriptor.id,major:1,minMinor:0,operations:['execute'],features:[]};
const request={schemaVersion:'acap.event-descriptor/v1',id:'io.alica.phase3.request',version:'1.0.0',payload:{type:'string',maxLength:128}};
const reply={...request,id:'io.alica.phase3.reply'};
const code=`export async function activate(ctx){
 let pending;
 ctx.on('${reply.id}',async event=>{if(pending){const done=pending;pending=null;done(event.data)}});
 ctx.provide(${JSON.stringify(descriptor)},{execute:async input=>{
  if(pending)throw Object.assign(new Error('busy'),{code:'RESOURCE_EXHAUSTED'});
  return new Promise((resolve,reject)=>{pending=resolve;ctx.emit('${request.id}',input).then(x=>{if(x.admitted!==1){pending=null;reject(Object.assign(new Error('no bridge'),{code:'UNAVAILABLE'}))}},reject)})
 }});
}`;
test('H6/H7 public operator context event/effect bridge crosses verified VM and cleans up',async t=>{
 const {host,pkg,grant}=fixture(t);
 const p=host.discover(pkg('org.phase3.bridge',code,true,[request,reply]));
 const eventGrant=(event,ops)=>host.issueGrant({schemaVersion:'acap.event-grant/v1',grantId:randomUUID(),...host.identity(p),eventType:event.id,operations:ops,issuedAtMs:Date.now()-1,expiresAtMs:Date.now()+30000,revision:0});
 eventGrant(request,['publish','subscribe']);eventGrant(reply,['publish','subscribe']);
 await host.activate(p);
 const operator=createPluginContext(host.context(p));let disposed=0,dispatched=0;
 await operator.effect(async register=>{register(async()=>{disposed++});return true});
 operator.on(request.id,async event=>{assert.equal(event.sourceInstanceId,p);dispatched++;await operator.emit(reply.id,'bridge:'+event.data)});
 const c=host.discover(pkg('org.phase3.external','export async function activate(){}',false));await host.activate(c);
 await assert.rejects(host.context(c).optional(requirement),e=>e.code==='PERMISSION_DENIED');assert.equal(dispatched,0);
 grant(c);const handle=await host.context(c).optional(requirement);assert.ok(handle);
 assert.equal(await handle.call('execute','fixture',{deadlineMs:Date.now()+500}),'bridge:fixture');assert.equal(dispatched,1);
 await host.shutdown();assert.equal(disposed,1);
 assert.deepEqual({...host.inspect().resources},{registrations:0,listeners:0,pendingCalls:0,effects:0});
 await assert.rejects(handle.call('execute','late',{deadlineMs:Date.now()+500}));
});
