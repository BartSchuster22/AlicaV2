// External consumer: public SDK plus a Catalog-selected requirement only.
// No MemoryV4, HTTP, bridge, filesystem or Store imports.
import {createPluginContext} from '@alica/plugin-sdk';
export async function memoryConsumer(hostContext, requirement, input, query){
 const capability=await createPluginContext(hostContext).require(requirement);
 const options=()=>({deadlineMs:Date.now()+10000});
 const created=await capability.call('create',input,options());
 const replay=await capability.call('create',input,options());
 const retrieved=await capability.call('get',{scope:input.scope,id:created.id},options());
 const searched=await capability.call('search',{scope:input.scope,query,limit:25,cursor:''},options());
 return {created,replay,retrieved,searched};
}
