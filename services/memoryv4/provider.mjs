// Product-private bridge using frozen public SDK. No new ACAP binding or supervisor.
import {spawn} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {definePlugin} from '@alica/plugin-sdk';
import {AcapError} from '@alica/acap-contracts';
export const limits=Object.freeze({requestBytes:65536,responseBytes:2097152,active:4,maxDeadlineMs:30000});
const codes=new Set(['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','CONFLICT','FAILED_PRECONDITION','UNAVAILABLE','RESOURCE_EXHAUSTED','CANCELLED','DEADLINE_EXCEEDED']);
export function memoryProvider(descriptor,resolveAuthority,{python,databasePath}){
 if(!isAbsolute(python)||!isAbsolute(databasePath))throw new Error('explicit absolute runtime/store required');
 const active=new Set();let stopped=false;
 const fail=code=>new AcapError(code);
 async function invoke(operation,input,ctx){
  if(stopped)throw fail('UNAVAILABLE');
  const caller=ctx.caller;
  if(!caller||!['principal','instanceId','scope'].every(k=>typeof caller[k]==='string'&&caller[k]))throw fail('UNAUTHENTICATED');
  // Resolver is supplied by trusted operator composition, not serialized caller payload.
  const authority=resolveAuthority(caller);
  if(!authority)throw fail('PERMISSION_DENIED');
  if(ctx.signal.aborted)throw fail('CANCELLED');
  if(ctx.deadlineMs<=Date.now())throw fail('DEADLINE_EXCEEDED');
  if(active.size>=limits.active)throw fail('RESOURCE_EXHAUSTED');
  const deadlineMs=Math.min(ctx.deadlineMs,Date.now()+limits.maxDeadlineMs);
  if(ctx.idempotencyKey!==undefined)throw fail('INVALID_ARGUMENT');
  let payload=input,key=null;
  if(operation==='create'){
   const {requestKey,...body}=input;
   if(typeof requestKey!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(requestKey))throw fail('INVALID_ARGUMENT');
   payload=body;key='acap.candidates.v2:'+requestKey;
  }
  const data=Buffer.from(JSON.stringify({v:1,operation,payload,authority,key,requestId:ctx.requestId,deadlineMs}));
  if(data.length>limits.requestBytes)throw fail('RESOURCE_EXHAUSTED');
  return new Promise((resolve,reject)=>{
   const child=spawn(python,['-I',new URL('./bridge.py',import.meta.url).pathname],{env:{PATH:'/usr/bin:/bin',MEMORYV4_DB_PATH:databasePath},cwd:new URL('.',import.meta.url),stdio:['pipe','pipe','ignore']});
   let bytes=0,chunks=[],error,closed=false;
   const terminate=code=>{error??=fail(code);child.kill('SIGKILL');};
   const abort=()=>terminate('CANCELLED');
   const timer=setTimeout(()=>terminate('DEADLINE_EXCEEDED'),Math.max(1,deadlineMs-Date.now()));
   const record={child,stop:()=>terminate('UNAVAILABLE'),done:new Promise(r=>child.once('close',r))};active.add(record);
   ctx.signal.addEventListener('abort',abort,{once:true});
   child.on('error',()=>{error??=fail('UNAVAILABLE');});
   child.stdin.on('error',()=>{error??=fail('UNAVAILABLE');});
   child.stdout.on('data',b=>{bytes+=b.length;if(bytes>limits.responseBytes)terminate('RESOURCE_EXHAUSTED');else chunks.push(b);});
   child.once('close',code=>{
    closed=true;clearTimeout(timer);ctx.signal.removeEventListener('abort',abort);active.delete(record);
    if(error)return reject(error);if(code!==0)return reject(fail('UNAVAILABLE'));
    try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
     if(value.v!==1||Object.keys(value).length!==2)throw Error();
     if('error'in value){if(!codes.has(value.error))throw Error();return reject(fail(value.error));}
     if(!('result'in value))throw Error();resolve(value.result);
    }catch{reject(fail('UNAVAILABLE'));}
   });
   child.stdin.end(data);if(ctx.signal.aborted&&!closed)abort();
  });
 }
 return {active:()=>active.size,plugin:definePlugin({async activate(ctx){
  await ctx.effect(async own=>own(async()=>{stopped=true;const pending=[...active];for(const p of pending)p.stop();await Promise.all(pending.map(p=>p.done));}));
  ctx.provide(descriptor,Object.fromEntries(['create','get','search'].map(op=>[op,(input,c)=>invoke(op,input,c)])));
 }})};
}
