// Adapter-internal wire only: not a Catalog transport or public capability.
export const requestEvent={schemaVersion:'acap.event-descriptor/v1',id:'io.alica.hermes.request',version:'1.0.0',payload:{type:'string',maxLength:65536}};
export const replyEvent={...requestEvent,id:'io.alica.hermes.reply'};
export const cancelEvent={...requestEvent,id:'io.alica.hermes.cancel'};
export const bridgeEvents=[requestEvent,replyEvent,cancelEvent];
// Generated verified-VM entrypoint uses only the supplied public context.
export function providerSource(descriptor){return `
export async function activate(ctx){
 const error=code=>Object.assign(new Error(code),{code});
 let active=null,stopped=false;
 const source=e=>e.sourceInstanceId===ctx.instanceId&&e.sourceScope===ctx.scope&&e.scopeGeneration===ctx.scopeGeneration;
 ctx.on('${replyEvent.id}',async e=>{
  if(!source(e)||!active)return;
  let r;try{r=JSON.parse(e.data)}catch{return}
  if(r.id!==active.id)return;
  if(r.code){const allowed=['INVALID_ARGUMENT','PERMISSION_DENIED','UNAVAILABLE','RESOURCE_EXHAUSTED','DEADLINE_EXCEEDED','CANCELLED','INTERNAL','FAILED_PRECONDITION'];active.finish(allowed.includes(r.code)?r.code:'INTERNAL');}
  else active.finish(null,r.value);
 });
 await ctx.effect(async register=>{register(async()=>{stopped=true;if(active)active.finish('UNAVAILABLE')});});
 ctx.provide(${JSON.stringify(descriptor)},{execute:async(input,op)=>{
  if(stopped)throw error('UNAVAILABLE');
  if(op.signal.aborted)throw error('CANCELLED');
  if(Date.now()>=op.deadlineMs)throw error('DEADLINE_EXCEEDED');
  if(active)throw error('RESOURCE_EXHAUSTED');
  return new Promise((resolve,reject)=>{
   const abort=()=>{const id=op.requestId;finish(Date.now()>=op.deadlineMs?'DEADLINE_EXCEEDED':'CANCELLED');void ctx.emit('${cancelEvent.id}',JSON.stringify({id})).catch(()=>{});};
   const finish=(code,value)=>{if(!active||active.id!==op.requestId)return;active=null;op.signal.removeEventListener('abort',abort);code?reject(error(code)):resolve(value)};
   active={id:op.requestId,finish};op.signal.addEventListener('abort',abort,{once:true});
   if(op.signal.aborted){abort();return;}
   void ctx.emit('${requestEvent.id}',JSON.stringify({id:op.requestId,deadlineMs:op.deadlineMs,input,caller:op.caller})).then(r=>{if(r.admitted!==1)finish('UNAVAILABLE')},()=>finish('UNAVAILABLE'));
  });
 }});
}`;}
const allowed=new Set(['INVALID_ARGUMENT','PERMISSION_DENIED','UNAVAILABLE','RESOURCE_EXHAUSTED','DEADLINE_EXCEEDED','CANCELLED','INTERNAL','FAILED_PRECONDITION']);
export async function attachBridge(ctx,runner,{maxTaskMs=120000}={}){
 if(!Number.isInteger(maxTaskMs)||maxTaskMs<1||maxTaskMs>120000)throw new Error('INVALID_ARGUMENT');
 let stopped=false,active=null,lastSequence=-1;
 const source=e=>e.sourceInstanceId===ctx.instanceId&&e.sourceScope===ctx.scope&&e.scopeGeneration===ctx.scopeGeneration&&e.sourceProvider===ctx.principal;
 const reply=async data=>{if(!stopped)await ctx.emit(replyEvent.id,JSON.stringify(data));};
 return ctx.effect(async register=>{
  const offCancel=ctx.on(cancelEvent.id,async e=>{if(!source(e))return;let r;try{r=JSON.parse(e.data)}catch{return}if(active?.id===r.id)active.controller.abort();});
  const offRequest=ctx.on(requestEvent.id,async e=>{
   if(stopped||!source(e)||e.sequence<=lastSequence)return;
   lastSequence=e.sequence;
   let r;try{r=JSON.parse(e.data)}catch{return}
   if(typeof r.id!=='string'||r.id.length>128||!Number.isSafeInteger(r.deadlineMs)||!r.caller||typeof r.caller.instanceId!=='string')return;
   if(active){await reply({id:r.id,code:'RESOURCE_EXHAUSTED'});return;}
   if(r.deadlineMs<=Date.now()){await reply({id:r.id,code:'DEADLINE_EXCEEDED'});return;}
   const controller=new AbortController(),deadline=Math.min(r.deadlineMs,Date.now()+maxTaskMs);
   const job={id:r.id,controller,done:null};active=job;
   const timer=setTimeout(()=>controller.abort(),Math.max(1,deadline-Date.now()));
   // Do not occupy the event dispatcher: cancellation must remain deliverable.
   job.done=(async()=>{
    try{const value=await runner.execute(r.input,{signal:controller.signal,deadlineMs:deadline,requestId:r.id,caller:r.caller});
     if(controller.signal.aborted)throw Object.assign(new Error(),{code:Date.now()>=deadline?'DEADLINE_EXCEEDED':'CANCELLED'});
     await reply({id:r.id,value});
    }catch(e){await reply({id:r.id,code:controller.signal.aborted?(Date.now()>=deadline?'DEADLINE_EXCEEDED':'CANCELLED'):(allowed.has(e?.code)?e.code:'INTERNAL')}).catch(()=>{});}
    finally{clearTimeout(timer);if(active===job)active=null;}
   })();
  });
  register(async()=>{stopped=true;await offRequest();await offCancel();active?.controller.abort();await runner.close();if(active)await active.done;});
  return Object.freeze({close:async()=>{stopped=true;await offRequest();await offCancel();active?.controller.abort();await runner.close();if(active)await active.done;},inspect:()=>({stopped,pending:active?1:0})});
 });
}
