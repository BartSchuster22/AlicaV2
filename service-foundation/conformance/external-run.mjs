import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const cwd='/external/operator';
function run(args){const p=spawnSync(process.execPath,['--experimental-vm-modules','operator.mjs',...args],{cwd,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});process.stdout.write(p.stdout??'');process.stderr.write(p.stderr??'');assert.equal(p.status,0,p.error?.message??p.stderr);}
run([]);
const directory=mkdtempSync(join(tmpdir(),'phase50-crash-'));
const child=spawn(process.execPath,['--experimental-vm-modules','operator.mjs','hold',directory],{cwd,stdio:['pipe','pipe','pipe']});
let output='',errors='';child.stderr.on('data',b=>errors+=b);
const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('crash readiness timed out '+errors)),10000);child.stdout.on('data',b=>{output+=b;if(output.includes('CRASH_READY')){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(Error('crash worker exited before readiness '+errors));});child.once('error',e=>{clearTimeout(timer);reject(e);});});
 child.kill('SIGKILL');const result=await exited;assert.equal(result.signal,'SIGKILL');run(['recover',directory]);
 console.log(JSON.stringify({kind:'EXTERNAL_AUTHOR_EXECUTED',...JSON.parse(readFileSync('/external/preparation.json','utf8')),noContainerRuntime:true,unchangedConsumer:true,normalStopRestart:true,crashRestart:'SIGKILL after completed write then fresh operator; no crash durability guarantee',supervisorProduct:false,status:'PASS'}));
}finally{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}rmSync(directory,{recursive:true,force:true});}
