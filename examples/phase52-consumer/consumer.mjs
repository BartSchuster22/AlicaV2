// Independent consumer surface: only accepted public SDK and supplied Catalog descriptor.
import {definePlugin} from '@alica/plugin-sdk';
export function incidentConsumer(descriptor){
 let handle;
 const requirement={capabilityId:descriptor.id,major:1,minMinor:0,operations:['get','list','acknowledge'],features:[]};
 return {plugin:definePlugin({async activate(ctx){handle=await ctx.require(requirement);}}),requirement,
  call:(operation,input)=>handle.call(operation,input,{deadlineMs:Date.now()+1000})};
}
