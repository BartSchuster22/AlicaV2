import {definePlugin} from '@alica/plugin-sdk';
import {AcapError} from '@alica/acap-contracts';
// Service health is owned here. The operator observes it; no lifecycle engine.
export function stateless(descriptor){
 let health='UNAVAILABLE';
 return {health:()=>health,plugin:definePlugin({async activate(context){
  await context.effect(async register=>{register(async()=>{health='UNAVAILABLE';});});
  context.provide(descriptor,{echo:async({text})=>({text})});health='READY';
 }})};
}
// The native operator supplies ONE explicit service-owned record resource.
// This is not a Kernel filesystem API, secret resolver, or generic storage broker.
export function records(descriptor,resource,{domain='example.records'}={}){
 let health='UNAVAILABLE';
 return {health:()=>health,plugin:definePlugin({async activate(context){
  if(domain!=='example.records')throw new AcapError('FAILED_PRECONDITION');
  await context.effect(async register=>{register(async()=>{try{await resource.close();}finally{health='UNAVAILABLE';}});await resource.open();});
  context.provide(descriptor,{
   put:async({key,value})=>{try{await resource.put(key,value);health='READY';return {stored:true};}catch(e){if(e.code==='RESOURCE_EXHAUSTED'){health='DEGRADED';throw e;}health='UNAVAILABLE';throw new AcapError('UNAVAILABLE');}},
   get:async({key})=>{try{const value=await resource.get(key);health='READY';return value===undefined?{found:false,value:''}:{found:true,value};}catch(e){if(e.code==='RESOURCE_EXHAUSTED'){health='DEGRADED';throw e;}health='UNAVAILABLE';throw new AcapError('UNAVAILABLE');}}
  });health='READY';
 }})};
}
export const requirement=d=>({capabilityId:d.id,major:1,minMinor:0,operations:d.operations.map(o=>o.name),features:[]});
// Identical consumer across independent providers and normal restart.
export function consumer(descriptor){let handle;return {plugin:definePlugin({async activate(context){handle=await context.require(requirement(descriptor));}}),call:async(operation,input)=>JSON.parse(JSON.stringify(await handle.call(operation,input,{deadlineMs:Date.now()+1000})))};}
