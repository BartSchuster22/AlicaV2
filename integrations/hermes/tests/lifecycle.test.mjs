// Real public Host plus actual controlled child processes; NOT Hermes/H12.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createPluginContext} from '@alica/plugin-sdk';
import {fixture} from './topology.test.mjs';
import {providerSource,bridgeEvents,attachBridge} from '../adapter/bridge.mjs';
import {createProcessRunner} from '../adapter/process-runner.mjs';
const d=JSON.parse(readFileSync(new URL('../../../catalog/proposals/agent-execution/descriptor.json',import.meta.url),'utf8'));
const requirement={capabilityId:d.id,major:1,minMinor:0,operations:['execute'],features:[]};
const childCode=`let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{const x=JSON.parse(s);if(x.task==='hang'){setInterval(()=>{},1000);return}if(x.task==='crash'){process.exit(4)}if(x.task==='malformed'){process.stdout.write('NOT JSON');return}if(x.task==='overflow'){process.stdout.write('x'.repeat(40000));return}process.stdout.write(JSON.stringify({text:'controlled:'+x.task}))});`;
const makeRunner=(args=['-e',childCode])=>createProcessRunner({executable:process.execPath,args,cwd:process.cwd(),env:{},graceMs:20});
async function setup(t){
 const {host,pkg,grant}=fixture(t,d);
 const p=host.discover(pkg('org.phase3.lifecycle',providerSource(d),true,bridgeEvents));
 for(const event of bridgeEvents)host.issueGrant({schemaVersion:'acap.event-grant/v1',grantId:randomUUID(),...host.identity(p),eventType:event.id,operations:['publish','subscribe'],issuedAtMs:Date.now()-1,expiresAtMs:Date.now()+30000,revision:0});
 await host.activate(p);const runner=makeRunner();const bridge=await attachBridge(createPluginContext(host.context(p)),runner,{maxTaskMs:800});
 const c=host.discover(pkg('org.phase3.lifecycleconsumer','export async function activate(){}',false));await host.activate(c);grant(c);
 const h=await host.context(c).optional(requirement);
 return {host,pkg,p,c,h,runner,bridge,call:(task,options={})=>h.call('execute',{task},{deadlineMs:Date.now()+700,...options})};
}
test('H7-H11 controlled child public round trip, denied authority, cleanup and stale handle',async t=>{
 const {host,pkg,h,call,runner,bridge}=await setup(t);
 const denied=host.discover(pkg('org.phase3.denied','export async function activate(){}',false));await host.activate(denied);
 await assert.rejects(host.context(denied).optional(requirement),e=>e.code==='PERMISSION_DENIED');
 assert.deepEqual({...await call('success')},{text:'controlled:success'});
 await host.shutdown();assert.equal(runner.inspect().pending,0);assert.equal(bridge.inspect().pending,0);assert.equal(runner.inspect().closed,true);
 assert.deepEqual({...host.inspect().resources},{registrations:0,listeners:0,pendingCalls:0,effects:0});
 await assert.rejects(h.call('execute',{task:'late'},{deadlineMs:Date.now()+100}));
});
test('H10 controlled process crash, malformed output and overflow normalize without raw data',async t=>{
 const {call}=await setup(t);
 await assert.rejects(call('crash'),e=>e.code==='UNAVAILABLE');
 await assert.rejects(call('malformed'),e=>e.code==='INTERNAL');
 await assert.rejects(call('overflow'),e=>e.code==='INTERNAL');
 assert.equal((await call('recovery')).text,'controlled:recovery');
});
test('H11 cancellation, single flight, deadline and in-flight shutdown are bounded',async t=>{
 const {call,host,runner}=await setup(t);const a=new AbortController();
 const pending=call('hang',{signal:a.signal});const rejected=assert.rejects(pending,e=>e.code==='CANCELLED');
 await new Promise(r=>setTimeout(r,40));
 await assert.rejects(call('overlap'),e=>e.code==='RESOURCE_EXHAUSTED');a.abort();await rejected;
 // Cancellation acknowledgment at the caller is not yet process cleanup.
 await new Promise(r=>setTimeout(r,100));assert.equal(runner.inspect().pending,0);
 await assert.rejects(call('hang',{deadlineMs:Date.now()+80}),e=>e.code==='DEADLINE_EXCEEDED');
 await new Promise(r=>setTimeout(r,100));assert.equal(runner.inspect().pending,0);
 const flight=call('hang');const closed=assert.rejects(flight);await new Promise(r=>setTimeout(r,30));await host.shutdown();await closed;assert.equal(runner.inspect().pending,0);
});
test('H8 process runner rejects missing dependency and pre-aborted task without dispatch',async()=>{
 const runner=createProcessRunner({executable:'/nonexistent/phase3-python',args:[],cwd:process.cwd(),env:{}});
 await assert.rejects(runner.execute({task:'x'},{signal:new AbortController().signal,deadlineMs:Date.now()+300}),e=>e.code==='UNAVAILABLE');await runner.close();
 const r=makeRunner();const a=new AbortController();a.abort();await assert.rejects(r.execute({task:'x'},{signal:a.signal,deadlineMs:Date.now()+300}),e=>e.code==='CANCELLED');assert.equal(r.inspect().pending,0);await r.close();
});

test('H9 foreign granted event identity cannot dispatch or forge replies',async t=>{
 const {host,pkg,call,runner}=await setup(t);
 const foreign=host.discover(pkg('org.phase3.foreign','export async function activate(){}',false,bridgeEvents));
 for(const event of bridgeEvents)host.issueGrant({schemaVersion:'acap.event-grant/v1',grantId:randomUUID(),...host.identity(foreign),eventType:event.id,operations:['publish'],issuedAtMs:Date.now()-1,expiresAtMs:Date.now()+30000,revision:0});
 await host.activate(foreign);
 await host.context(foreign).emit(bridgeEvents[0].id,JSON.stringify({id:'foreign',deadlineMs:Date.now()+500,input:{task:'hang'},caller:{instanceId:foreign}}));
 await host.context(foreign).emit(bridgeEvents[1].id,JSON.stringify({id:'foreign',value:{text:'forged'}}));
 await new Promise(r=>setTimeout(r,30));assert.equal(runner.inspect().pending,0);
 assert.equal((await call('legitimate')).text,'controlled:legitimate');
});
test('H11 SIGTERM-resistant child escalates and closes without poisoning or residue',async()=>{
 const r=makeRunner(['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"]);
 const start=Date.now();await assert.rejects(r.execute({task:'x'},{signal:new AbortController().signal,deadlineMs:start+100}),e=>e.code==='DEADLINE_EXCEEDED');
 assert.ok(Date.now()-start<800);assert.equal(r.inspect().pending,0);assert.equal(r.inspect().poisoned,false);await r.close();
});
