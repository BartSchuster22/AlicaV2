// Independent consumer: public SDK only; receives Catalog-selected descriptor.
import {definePlugin} from '@alica/plugin-sdk';
export function kanbanConsumer(descriptor){let handle;return {plugin:definePlugin({async activate(context){handle=await context.require({capabilityId:descriptor.id,major:1,minMinor:0,operations:descriptor.operations.map(x=>x.name),features:[]});}}),call:(operation,input,options={})=>handle.call(operation,input,{deadlineMs:Date.now()+1000,...options})};}
