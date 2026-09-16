import {definePlugin,clientEndpoint} from '@alica/plugin-sdk';
import type {OperationContext} from '@alica/plugin-sdk';
import {createClient,descriptor} from '../generated/client.mjs';
import type {handlers as GeneratedHandlers} from '../generated/provider.mjs';
export const requirement={capabilityId:descriptor.id,major:1,minMinor:0,operations:['add'],features:[]};
export const resultDescriptor={...descriptor,id:'org.tutorial.result'};
export const activate=definePlugin({async activate(ctx){
 const handle=await ctx.require(requirement);
 const client=createClient(clientEndpoint(handle,descriptor));
 const resource=await ctx.effect(async own=>{const state={open:true};own(async()=>{state.open=false});return state});
 ctx.provide(resultDescriptor,{add:async(input:Parameters<typeof GeneratedHandlers.add>[0],call:OperationContext)=>{if(!resource.open)throw {code:'UNAVAILABLE'};return client.add(input,{deadlineMs:call.deadlineMs,signal:call.signal})}});
}}).activate;
