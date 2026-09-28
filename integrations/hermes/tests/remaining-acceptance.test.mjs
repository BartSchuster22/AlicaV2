// Original H8/H15/H17 only. Public Host/Catalog/SDK; native traffic is MOCK.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync,readdirSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest} from '@alica/acap-contracts';
import {consumeSnapshot} from '@alica/catalog/release';
import {createPluginContext} from '@alica/plugin-sdk';
import {fixture} from './topology.test.mjs';
import {providerSource,bridgeEvents,attachBridge} from '../adapter/bridge.mjs';
import {createProcessRunner} from '../adapter/process-runner.mjs';
const snapshot=JSON.parse(readFileSync(new URL('../../../catalog/proposals/agent-execution/snapshot.json',import.meta.url),'utf8'));
const d=consumeSnapshot(snapshot).entries.find(e=>e.definition.metadata.id==='acap://alica.io/agent/execution@1').descriptor;
const requirement={capabilityId:d.id,major:1,minMinor:0,operations:['execute'],features:[]};
const zero={registrations:0,listeners:0,pendingCalls:0,effects:0};
const task='Read the approved fixture and return its text exactly.';
function eventGrants(host,p){
 const identity=host.identity(p),expiresAtMs=Date.now()+45000;
 const scopes=identity.scope==='root'?[identity]:[{scope:'root',scopeGeneration:host.inspect().scopes.find(s=>s.id==='root').generation},identity];
 for(const scope of scopes)for(const event of bridgeEvents)host.issueGrant({schemaVersion:'acap.event-grant/v1',grantId:randomUUID(),...identity,...scope,eventType:event.id,operations:['publish','subscribe'],issuedAtMs:Date.now()-1,expiresAtMs,revision:0});
}
async function provider(host,pkg,runner,scope='root'){
 const p=host.discover(pkg('org.phase3.remainingprovider',providerSource(d),true,bridgeEvents),scope);
 eventGrants(host,p);await host.activate(p);
 const bridge=await attachBridge(createPluginContext(host.context(p)),runner);
 return {p,bridge};
}
function controlled(){return createProcessRunner({executable:process.execPath,args:['-e',"process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(JSON.stringify({text:'controlled'})))"],cwd:process.cwd(),env:{}})}
async function consumer(host,pkg,grant,scope='root'){
 const c=host.discover(pkg('org.phase3.remainingconsumer','export async function activate(){}',false),scope);
 await host.activate(c);
 if(scope!=='root')grant(c,'root',host.inspect().scopes.find(s=>s.id==='root').generation);
 grant(c,scope);
 return {c,h:await host.context(c).optional(requirement)};
}
test('H8/H17 actual Host unload/reload, new instance, stale handle never rebinds',async t=>{
 const {host,pkg,grant}=fixture(t,d);
 const first=controlled(),a=await provider(host,pkg,first),{c,h}=await consumer(host,pkg,grant);
 assert.equal((await h.call('execute',{task},{deadlineMs:Date.now()+800})).text,'controlled');
 const report=await host.dispose(a.p);
 assert.equal(report.state,'DISPOSED');assert.equal(report.restartRequired,false);
 assert.deepEqual(first.inspect(),{closed:true,poisoned:false,pending:0});
 const second=controlled(),b=await provider(host,pkg,second);
 assert.notEqual(a.p,b.p);
 await assert.rejects(h.call('execute',{task},{deadlineMs:Date.now()+800}),{code:'UNAVAILABLE'});
 const fresh=await host.context(c).optional(requirement);
 assert.equal((await fresh.call('execute',{task},{deadlineMs:Date.now()+800})).text,'controlled');
 await host.shutdown();assert.deepEqual({...host.inspect().resources},zero);
 assert.deepEqual(second.inspect(),{closed:true,poisoned:false,pending:0});
});
test('H8/H17 actual Host recreated scope increments generation; old context/handle stay dead',async t=>{
 const {host,pkg,grant}=fixture(t,d);host.createScope('root',undefined,'phase3-generation');
 const first=controlled(),a=await provider(host,pkg,first,'phase3-generation');
 const old=await consumer(host,pkg,grant,'phase3-generation'),identity=host.identity(a.p),ctx=host.context(old.c);
 assert.equal((await old.h.call('execute',{task},{deadlineMs:Date.now()+800})).text,'controlled');
 await host.destroyScope('phase3-generation');host.createScope('root',undefined,'phase3-generation');
 const second=controlled(),b=await provider(host,pkg,second,'phase3-generation');
 assert.equal(host.identity(b.p).scopeGeneration,identity.scopeGeneration+1);
 assert.notEqual(b.p,a.p);
 await assert.rejects(ctx.optional(requirement),{code:'FAILED_PRECONDITION'});
 // Public context reports closed scope; the retained ContractSession reports
 // disposed provider as UNAVAILABLE before attempting new dispatch.
 await assert.rejects(old.h.call('execute',{task},{deadlineMs:Date.now()+800}),{code:'UNAVAILABLE'});
 const fresh=await consumer(host,pkg,grant,'phase3-generation');
 assert.equal((await fresh.h.call('execute',{task},{deadlineMs:Date.now()+800})).text,'controlled');
 await host.shutdown();assert.deepEqual({...host.inspect().resources},zero);
 for(const r of [first,second])assert.deepEqual(r.inspect(),{closed:true,poisoned:false,pending:0});
});
test('H17 selected Phase3 snapshot integrity and index mismatch reject',()=>{
 const wrong=structuredClone(snapshot);wrong.content.version='9.0.0';
 assert.throws(()=>consumeSnapshot(wrong),{code:'SNAPSHOT_INTEGRITY'});
 const mismatch=structuredClone(snapshot);mismatch.content.index.entries=[];mismatch.digest=digest(mismatch.content);
 assert.throws(()=>consumeSnapshot(mismatch),{code:'INDEX_MISMATCH'});
});
test('H17 selected capability incompatible major is unavailable through actual Host',async t=>{
 const incompatible={...requirement,major:2};
 const {host,pkg,grant}=fixture(t,d,{consumerRequirement:incompatible});
 const r=controlled();await provider(host,pkg,r);
 const c=host.discover(pkg('org.phase3.versionconsumer','export async function activate(){}',false));await host.activate(c);grant(c);
 assert.equal(await host.context(c).optional(incompatible),null);
 assert.equal(r.inspect().pending,0);
 await host.shutdown();assert.deepEqual({...host.inspect().resources},zero);
});
function scan(root){for(const n of readdirSync(root)){const p=join(root,n);if(statSync(p).isDirectory())scan(p);else assert.ok(!readFileSync(p).includes(Buffer.from('SYNTHETIC_TOOL_FAILURE_NOT_A_SECRET')),`canary in ${n}`)}}
for(const outcome of ['success','tool-failure'])test(`H15/H17 MOCK native public ${outcome} has bounded reconstructable evidence`,{timeout:45000},async t=>{
 const python=process.env.PHASE3_PYTHON,upstream=process.env.PHASE3_HERMES;
 assert.ok(python?.startsWith('/')&&upstream?.startsWith('/'),'explicit pinned native test prerequisites required');
 const root=mkdtempSync(join(tmpdir(),'phase3-public-native-'));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const {host,pkg,grant}=fixture(t,d,{hostConfig:{maxCallMs:30000,cleanupMs:1000}});
 const entry=fileURLToPath(new URL(outcome==='success'?'../adapter/offline_entry.py':'../adapter/mock_tool_failure_entry.py',import.meta.url));
 const runner=createProcessRunner({executable:python,args:[entry,root],cwd:resolve(root),env:{PYTHONPATH:upstream,PYTHONDONTWRITEBYTECODE:'1',PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},graceMs:100});
 // Operator-owned observation at existing runner boundary. Fixed closed record,
 // no raw error/message, input, native output, credentials or generic telemetry.
 const executions=[];
 const safeId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
 const observed={inspect:runner.inspect,close:runner.close,async execute(input,options){
  assert.equal(executions.length,0);assert.match(options.requestId,safeId);
  const record={requestId:options.requestId,startMs:Date.now(),endMs:null,code:null,publicError:null};executions.push(record);
  try{return await runner.execute(input,options)}catch(e){assert.equal(e.code,'UNAVAILABLE');record.code=e.code;throw e}finally{record.endMs=Date.now()}
 }};
 const {p,bridge}=await provider(host,pkg,observed),{h}=await consumer(host,pkg,grant);
 const active=host.inspect().instances.find(i=>i.id===p);assert.equal(active.state,'ACTIVE');
 if(outcome==='success')assert.equal((await h.call('execute',{task},{deadlineMs:Date.now()+30000})).text,'ALICA request-scoped fixture');
 else {
  await assert.rejects(h.call('execute',{task},{deadlineMs:Date.now()+30000}),e=>{
   assert.equal(e.code,'UNAVAILABLE');assert.match(e.correlationId,safeId);
   // Frozen normalization creates an error correlation ID, not the operation ID.
   // Link actual observations through this one awaited call and one execution;
   // neither equality nor inequality of the two independently issued IDs is required.
   assert.equal(executions.length,1);assert.equal(executions[0].code,e.code);
   assert.ok(Number.isSafeInteger(executions[0].endMs));assert.equal(runner.inspect().pending,0);
   executions[0].publicError={correlationId:e.correlationId,code:e.code,link:'single-awaited-invocation'};
   return !String(e).includes('SYNTHETIC_');
  });
  assert.deepEqual(JSON.parse(readFileSync(join(root,'mock-tool-dispatch.json'),'utf8')),{mode:'MOCK',nativeToolInvocations:1,failed:true});
 }
 assert.equal(executions.length,1);assert.ok(executions[0].endMs>=executions[0].startMs);assert.ok(executions[0].endMs-executions[0].startMs<30000);
 scan(root);await host.shutdown();
 const final=host.inspect(),instance=final.instances.find(i=>i.id===p);
 assert.equal(instance.state,'DISPOSED');assert.equal(instance.cleanup.restartRequired,false);
 assert.deepEqual({...final.resources},zero);assert.equal(final.unsettledWork,0);
 assert.deepEqual(runner.inspect(),{closed:true,poisoned:false,pending:0});assert.equal(bridge.inspect().pending,0);
 const evidence={mode:'MOCK',outcome,capability:d.id,provider:active.principal,providerInstance:p,scopeGeneration:active.generation,lifecycle:instance.history,execution:executions[0],cleanup:instance.cleanup,resources:final.resources,runner:runner.inspect(),snapshotDigest:snapshot.digest,liveH12:false};
 const text=JSON.stringify(evidence);assert.ok(text.length<8192);assert.ok(!text.includes('SYNTHETIC_'));
 console.log('PHASE3_PUBLIC_EVIDENCE '+text);
});
