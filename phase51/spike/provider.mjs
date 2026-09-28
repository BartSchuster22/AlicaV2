// Neutral M3 spike only. Public SDK provider + one fixed private child operation.
import {spawn} from 'node:child_process';
import {definePlugin} from '@alica/plugin-sdk';
import {AcapError} from '@alica/acap-contracts';
const LIMIT=16384,MAX_ACTIVE=4;
export function neutral(descriptor,resolveAuthority,{python='/usr/bin/python3'}={}){
 const active=new Set();let stopped=false;
 const fail=code=>new AcapError(code);
 async function echo(input,ctx){
  if(stopped)throw fail('UNAVAILABLE');
  if(Object.keys(input).join(',')!=='text'||typeof input.text!=='string')throw fail('INVALID_ARGUMENT');
  // Host-created context, never input.actor/grants/scope. Resolver is operator-owned.
  const authority=resolveAuthority(ctx.caller);
  if(!authority||!authority.actor||!authority.scope||authority.permissions.join(',')!=='neutral.echo')throw fail('PERMISSION_DENIED');
  if(ctx.signal.aborted)throw fail('CANCELLED');
  if(ctx.deadlineMs<=Date.now())throw fail('DEADLINE_EXCEEDED');
  if(active.size>=MAX_ACTIVE)throw fail('RESOURCE_EXHAUSTED');
  const data=Buffer.from(JSON.stringify({v:1,text:input.text,authority,deadlineMs:ctx.deadlineMs}));
  if(data.length>LIMIT)throw fail('RESOURCE_EXHAUSTED');
  return new Promise((resolve,reject)=>{
   const child=spawn(python,['-I','-S',new URL('./neutral.py',import.meta.url).pathname],{env:{PATH:'/usr/bin:/bin'},stdio:['pipe','pipe','ignore']});
   let bytes=0,chunks=[],error,closed=false;
   const abort=()=>terminate('CANCELLED');
   const terminate=code=>{error??=fail(code);child.kill('SIGKILL');};
   const timer=setTimeout(()=>terminate('DEADLINE_EXCEEDED'),Math.max(1,ctx.deadlineMs-Date.now()));
   const record={child,stop:()=>terminate('UNAVAILABLE'),done:new Promise(r=>child.once('close',r))};active.add(record);
   ctx.signal.addEventListener('abort',abort,{once:true});
   child.on('error',()=>{error??=fail('UNAVAILABLE');});
   child.stdin.on('error',()=>{error??=fail('UNAVAILABLE');});
   child.stdout.on('data',b=>{bytes+=b.length;if(bytes>LIMIT)terminate('RESOURCE_EXHAUSTED');else chunks.push(b);});
   child.once('close',code=>{
    closed=true;clearTimeout(timer);ctx.signal.removeEventListener('abort',abort);active.delete(record);
    if(error)return reject(error);if(code!==0)return reject(fail('UNAVAILABLE'));
    try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(Object.keys(value).join(',')!=='text'||typeof value.text!=='string')throw Error();resolve(value);}catch{reject(fail('UNAVAILABLE'));}
   });
   child.stdin.end(data);
   if(ctx.signal.aborted&&!closed)abort();
  });
 }
 return {active:()=>active.size,plugin:definePlugin({async activate(ctx){
  await ctx.effect(async own=>own(async()=>{stopped=true;const pending=[...active];for(const p of pending)p.stop();await Promise.all(pending.map(p=>p.done));}));
  ctx.provide(descriptor,{echo});
 }})};
}
