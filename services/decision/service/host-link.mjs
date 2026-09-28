// Decision-local public Host event handoff. Not a general transport API.
// No Node, Kernel internals, credential, or provider imports in this plugin module.
const codes = ['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','CONTRACT_MISMATCH','DEADLINE_EXCEEDED','CANCELLED','UNAVAILABLE','RESOURCE_EXHAUSTED','FAILED_PRECONDITION'];
export const topics = { request: 'org.phase4.decision.request', cancel: 'org.phase4.decision.cancel', reply: 'org.phase4.decision.reply' };
const error = code => Object.assign(new Error(code), { code });
const trusted = (e,p) => e.sourceInstanceId === p.instanceId && e.sourceProvider === p.principal && e.sourceScope === p.scope && e.scopeGeneration === p.scopeGeneration;
export function handoffDescriptors(descriptor) {
  const str = { type:'string',minLength:1,maxLength:128 }, id = str;
  const object = (properties,required=Object.keys(properties)) => ({ type:'object',properties,required,additionalProperties:false });
  const op = descriptor.operations[0];
  return {
    request: { schemaVersion:'acap.event-descriptor/v1',id:topics.request,version:'1.0.0',payload:object({id,deadlineMs:{type:'integer',minimum:0,maximum:9007199254740991},request:op.input}) },
    cancel: { schemaVersion:'acap.event-descriptor/v1',id:topics.cancel,version:'1.0.0',payload:object({id}) },
    reply: { schemaVersion:'acap.event-descriptor/v1',id:topics.reply,version:'1.0.0',payload:object({id,status:{type:'string',enum:['ok','error']},result:op.output,code:{type:'string',enum:codes}},['id','status']) },
  };
}
export async function pluginBackend(context, peer, providerId, session) {
  let closed=false, active, sequence=0, received=0;
  await context.effect(async own => {
    own(async () => { closed=true; if(active) active.abort('UNAVAILABLE'); });
    context.on(topics.reply, async e => {
      if(closed || !trusted(e,peer) || e.sequence<=received) return;
      received=e.sequence;
      if(!active || e.data.id!==active.id) return;
      const p=active;
      if(e.data.status==='ok' && e.data.result && !('code' in e.data)) p.resolve(e.data.result);
      else p.reject(error(e.data.status==='error' && !('result' in e.data) && codes.includes(e.data.code) ? e.data.code : 'CONTRACT_MISMATCH'));
    });
  });
  return { id:providerId, evaluate(request,{signal,deadlineMs}) {
    if(closed) return Promise.reject(error('UNAVAILABLE'));
    if(active) return Promise.reject(error('RESOURCE_EXHAUSTED'));
    if(signal.aborted) return Promise.reject(error('CANCELLED'));
    if(deadlineMs<=Date.now()) return Promise.reject(error('DEADLINE_EXCEEDED'));
    return new Promise((resolve,reject) => {
      const id=session+'.'+(++sequence), stop=() => active?.abort('CANCELLED');
      const finish=(fn,v) => { if(active?.id!==id)return; signal.removeEventListener('abort',stop); active=undefined; fn(v); };
      active={ id, resolve:v=>finish(resolve,v), reject:e=>finish(reject,e), abort:code=>{
        // Host may already be quiescing. Never turn a rejected cancel into raw logs.
        try { Promise.resolve(context.emit(topics.cancel,{id})).catch(()=>{}); } catch {}
        finish(reject,error(code));
      }};
      signal.addEventListener('abort',stop,{once:true});
      Promise.resolve().then(()=>context.emit(topics.request,{id,deadlineMs,request})).then(r=>{
        if(r.admitted!==1 && active?.id===id) active.reject(error('UNAVAILABLE'));
      },()=>{ if(active?.id===id)active.reject(error('UNAVAILABLE')); });
    });
  }};
}
export async function attachBackend(context, peer, provider) {
  let closed=false, active, received=0, dispatched=0;
  await context.effect(async own => {
    own(async () => { closed=true; if(active) { active.controller.abort(); await active.task; } });
    context.on(topics.cancel, async e => {
      if(trusted(e,peer) && active?.id===e.data.id) active.controller.abort();
    });
    context.on(topics.request, async e => {
      if(closed || !trusted(e,peer) || e.sequence<=received) return;
      received=e.sequence;
      const {id,request,deadlineMs}=e.data;
      const reply=async data=>{if(!closed) {try{await context.emit(topics.reply,{id,...data});}catch{}}};
      if(active) { await reply({status:'error',code:'RESOURCE_EXHAUSTED'}); return; }
      const remaining=Math.min(30000,deadlineMs-Date.now());
      if(remaining<=0) {await reply({status:'error',code:'DEADLINE_EXCEEDED'});return;}
      const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),remaining);
      const current={id,controller,task:undefined}; active=current; dispatched++;
      current.task=Promise.resolve().then(()=>provider.evaluate(request,{signal:controller.signal,deadlineMs:Math.min(deadlineMs,Date.now()+remaining)}))
        .then(result=>reply({status:'ok',result}),e=>reply({status:'error',code:codes.includes(e?.code)?e.code:'UNAVAILABLE'}))
        .finally(()=>{clearTimeout(timer);if(active===current)active=undefined;});
      // Do not hold the frozen Host's <=2s event callback open for network work.
      // The request is owned/joined by the public effect above, including unload.
    });
  });
  return { inspect:()=>({closed,pending:active?1:0,dispatched}) };
}
