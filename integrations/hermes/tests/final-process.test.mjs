// H8/H17 finite process-lifetime regression. Controlled child, NOT native H12.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createProcessRunner} from '../adapter/process-runner.mjs';
const config={executable:process.execPath,args:['-e',"process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(JSON.stringify({text:'controlled restart'})))"],cwd:process.cwd(),env:{},graceMs:20};
const options=()=>({signal:new AbortController().signal,deadlineMs:Date.now()+2000});
test('H8/H17 three fresh runner lifetimes, closed predecessor cannot dispatch',async()=>{
 const retired=[];
 for(let cycle=0;cycle<3;cycle++){
  const runner=createProcessRunner(config);
  try{
   for(const old of retired){
    await assert.rejects(old.execute({task:'stale'},options()),e=>e.code==='UNAVAILABLE');
    assert.deepEqual(old.inspect(),{closed:true,poisoned:false,pending:0});
   }
   assert.deepEqual(await runner.execute({task:'fixture'},options()),{text:'controlled restart'});
  }finally{await runner.close()}
  await runner.close(); // idempotent close is not restart of this object
  assert.deepEqual(runner.inspect(),{closed:true,poisoned:false,pending:0});
  retired.push(runner);
 }
});
test('H17 absent/invalid trusted process configuration rejects before dispatch',()=>{
 for(const change of [{executable:undefined},{executable:'relative-python'},{args:undefined},{cwd:undefined},{env:undefined}]){
  assert.throws(()=>createProcessRunner({...config,...change}),e=>e.code==='INVALID_ARGUMENT');
 }
});
test('H10 controlled tool-like child failure exposes no stderr canary',async()=>{
 const canary='SYNTHETIC_FAILURE_DETAIL_NOT_AUTH';
 const runner=createProcessRunner({...config,args:['-e',`process.stdin.resume();process.stdin.on('end',()=>{process.stderr.write('${canary}');process.exit(2)})`]});
 try{
  await assert.rejects(runner.execute({task:'fixture'},options()),e=>e.code==='UNAVAILABLE'&&!String(e).includes(canary));
 }finally{await runner.close()}
 assert.deepEqual(runner.inspect(),{closed:true,poisoned:false,pending:0});
});
