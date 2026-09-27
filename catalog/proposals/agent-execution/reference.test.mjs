import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { descriptor, canonical, runConformance } from '@alica/acap-contracts';
import { validateProposal } from '@alica/catalog/governance';
import { createTestCell } from '@alica/testkit';
import { definePlugin, clientEndpoint } from '@alica/plugin-sdk';
import { handlers, fixtureTask, fixtureText } from './reference.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const d=descriptor(canonical(read('./descriptor.json')));
const requirement={capabilityId:d.id,major:1,minMinor:0,operations:['execute'],features:[]};
const consume=endpoint=>endpoint.call('execute',{task:fixtureTask},{deadlineMs:Date.now()+500});
test('H4/H5 candidate proposal validates; public ACAP reference conformance',async()=>{
 assert.equal(validateProposal(read('./proposal.json')).draft,'acap://alica.io/agent/execution@1');
 const report=await runConformance(d,handlers,[{name:'finite fixture task',operation:'execute',input:{task:fixtureTask},expected:{text:fixtureText}}]);
 assert.equal(report.passed,true,canonical(report));
});
test('H5 neutral SDK consumer, invalid input, denied authority and disposal (testkit only)',async t=>{
 const cell=createTestCell();t.after(()=>cell.close());
 const p=cell.instance({id:'org.phase3.reference'});await p.activate(definePlugin({activate(ctx){ctx.provide(d,handlers)}}));
 const c=cell.instance({id:'org.phase3.consumer',permissions:{capabilities:{[d.id]:['execute']}}});await c.activate(definePlugin({activate(){}}));
 const h=await c.context.require(requirement);assert.equal(canonical(await consume(clientEndpoint(h,d))),canonical({text:fixtureText}));
 for(const input of [{task:''},{task:fixtureTask,model:'caller-choice'},{task:'unsupported'}])await assert.rejects(h.call('execute',input,{deadlineMs:Date.now()+500}),e=>e.code==='INVALID_ARGUMENT');
 const denied=cell.instance({id:'org.phase3.denied'});await denied.activate(definePlugin({activate(){}}));await assert.rejects(denied.context.require(requirement),e=>e.code==='PERMISSION_DENIED');
 const a=new AbortController();a.abort();await assert.rejects(h.call('execute',{task:fixtureTask},{deadlineMs:Date.now()+500,signal:a.signal}),e=>e.code==='CANCELLED');
 await assert.rejects(h.call('execute',{task:fixtureTask},{deadlineMs:Date.now()-1}),e=>e.code==='DEADLINE_EXCEEDED');
 await p.dispose();await assert.rejects(consume(clientEndpoint(h,d)),e=>e.code==='UNAVAILABLE');
});
