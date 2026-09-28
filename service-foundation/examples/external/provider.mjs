// Independent native author example. No Host/Kernel/testkit import.
import {definePlugin} from '@alica/plugin-sdk';
export function echo(descriptor){
 let state='UNAVAILABLE';
 return {health:()=>state,plugin:definePlugin({async activate(ctx){
  await ctx.effect(async own=>own(async()=>{state='UNAVAILABLE';}));
  ctx.provide(descriptor,{echo:async input=>({text:input.text.split('').join('')})});state='READY';
 }})};
}
