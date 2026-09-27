import test from 'node:test';
import assert from 'node:assert/strict';
import {createProcessRunner} from '../adapter/process-runner.mjs';
const runner=source=>createProcessRunner({executable:process.execPath,args:['-e',source],cwd:'/tmp',env:{PATH:'/usr/bin:/bin'},graceMs:50});
test('split UTF8 bytes preserve exact result',async()=>{
 const r=runner(`process.stdin.resume();process.stdin.on('end',()=>{const b=Buffer.from(JSON.stringify({text:'é € 🌍'}));let i=0;const next=()=>{if(i===b.length)return;process.stdout.write(b.subarray(i,i+1));i++;setTimeout(next,4)};next()})`);
 assert.deepEqual(await r.execute({task:'fixture'},{signal:new AbortController().signal,deadlineMs:Date.now()+2000}),{text:'é € 🌍'});
 assert.equal(r.inspect().poisoned,false);await r.close();
});
for(const retain of [false,true])test(`descendant ${retain?'retains':'releases'} pipes: bounded cleanup or explicit poison`,async()=>{
 const r=runner(`const {spawn}=require('node:child_process');process.stdin.resume();process.stdin.on('end',()=>{spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:${retain?"['ignore',1,2]":"'ignore'"}}).unref();process.stdout.write(JSON.stringify({text:'fixture'}));})`);
 const start=Date.now();let error;
 try{await r.execute({task:'fixture'},{signal:new AbortController().signal,deadlineMs:start+400})}catch(e){error=e.code}
 assert.ok(Date.now()-start<1500);assert.equal(r.inspect().pending,0);
 if(retain)assert.equal(error,'DEADLINE_EXCEEDED');
 if(r.inspect().poisoned)assert.ok(error,'unconfirmed cleanup must not return success');
 await r.close();
});
