import {definePlugin} from '@alica/plugin-sdk';
import {descriptor,event} from './contracts.mjs';
// Operator composition follows frozen Foundation native resource injection.
// Neither public consumer nor signed plugin modules import a Kernel private API.
export function doghouse(domain){
 let disposeEvents,disposeProvider;
 const plugin=definePlugin({async activate(ctx){
  await ctx.effect(async register=>{
   register(async()=>{await domain.close();await disposeEvents?.();await disposeProvider?.();});
   domain.open();
  });
  disposeEvents=ctx.events(event).on(async envelope=>{try{await domain.ingest(envelope,ctx.instanceId);}catch{/* Domain rejection counters only; no secret-bearing logs or recovery. */}});
  disposeProvider=ctx.provide(descriptor,Object.fromEntries(descriptor.operations.map(o=>[o.name,async(input,context)=>domain.operation(o.name,input,context)])));
  domain.subscription=true;
 }});
 return {plugin,selfHealth:()=>domain.selfHealth(),async stop(){const result=await domain.close();await disposeEvents?.();await disposeProvider?.();return result;}};
}
