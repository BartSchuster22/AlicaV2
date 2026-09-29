import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {consumeSnapshot} from '@alica/catalog/release';
import {validate,localJSON} from '../../../service-foundation/tooling/validate.mjs';
import {hostFixture} from '../../../service-foundation/conformance/host-fixture.mjs';
import {kanbanAdapter} from '../index.mjs';
import {kanbanConsumer} from '../../../examples/phase5k-consumer/consumer.mjs';
const frozen=JSON.parse(readFileSync(new URL('../../../docs/phase5k/design/descriptor.json',import.meta.url))),actual=new URL('../../../catalog/proposals/hermes-kanban/',import.meta.url);let selected=frozen;
if(existsSync(new URL('snapshot.json',actual))){const snapshot=JSON.parse(readFileSync(new URL('snapshot.json',actual))),catalog=consumeSnapshot(snapshot),manifest=JSON.parse(readFileSync(new URL('service.json',actual))),configuration=JSON.parse(readFileSync(new URL('../../../docs/phase5k/design/config.json',import.meta.url)));assert.equal(catalog.entries[0].definition.metadata.maturity,'experimental');selected=catalog.entries[0].descriptor;assert.deepEqual(selected,frozen);const result=validate(manifest,{snapshot,pin:manifest.catalog.digest,readJSON:n=>localJSON(new URL('../../../docs/phase5k/design/',import.meta.url).pathname,n),configuration});assert.equal(result.structural.status,'PASS');assert.equal(result.semantic.status,'PASS');console.log('K20B_ACTUAL_EXPERIMENTAL_CATALOG',catalog.digest);}else console.log('K20_PROPOSED_DESIGN_CONFORMANCE_ONLY');
export const descriptor=selected;
export const requirement={capabilityId:descriptor.id,major:1,minMinor:0,operations:descriptor.operations.map(o=>o.name),features:[]};
export const plain=v=>JSON.parse(JSON.stringify(v));
export async function setup({baseURL='http://127.0.0.1:19119',token=process.env.HERMES_DASHBOARD_SESSION_TOKEN,isolatedNonlaunching=true,secretGrant=true}={}){
 const f=hostFixture({syntheticSecret:token??undefined,cleanupMs:1200,activationMs:1200}),identities=new Map();
 const source="import {AcapError} from '@alica/acap-contracts';let release;export function activate(c){release=c.provide("+JSON.stringify(descriptor)+",{"+descriptor.operations.map(o=>o.name+":async()=>{await release();throw new AcapError('UNAVAILABLE');}").join(',')+"});}";
 const id=f.discover({descriptor,source,secretReferences:['synthetic-test']});if(secretGrant)f.grant(id,'synthetic-test',['read'],{secret:true});await f.host.activate(id);
 const probe=f.discover({requires:[requirement]});f.grant(probe,descriptor.id,requirement.operations);await f.host.activate(probe);const h=await f.host.context(probe).require(requirement);await assert.rejects(h.call('board',{board:'public'},{deadlineMs:Date.now()+1000}),{code:'UNAVAILABLE'});await f.host.dispose(probe);
 const service=kanbanAdapter(descriptor,c=>identities.get(JSON.stringify([c.principal,c.instanceId,c.scope])),{baseURL,isolatedNonlaunching});
 try{await service.plugin.activate(f.host.context(id));}catch(e){await f.close();throw e;}
 async function caller({mapped=true,board='public',backendBoard='default',permissions=['kanban.read','kanban.mutate'],granted=true}={}){
  const cid=f.discover({requires:[requirement]});if(granted)f.grant(cid,descriptor.id,requirement.operations);await f.host.activate(cid);const ctx=f.host.context(cid),key=JSON.stringify([ctx.principal,cid,ctx.scope]);
  if(mapped)identities.set(key,{actor:'fixture:owner',publicBoard:board,backendBoard,permissions});const client=kanbanConsumer(descriptor);await client.plugin.activate(ctx);return {id:cid,key,client,call:async(op,input,options)=>plain(await client.call(op,input,options)),context:ctx};
 }
 const client=await caller();return {f,id,service,identities,client,caller,async close(){const result=await f.close();assert.equal(result.resources.pendingCalls,0);assert.equal(result.resources.registrations,0);assert.equal(result.resources.effects,0);assert.equal(service.active(),0);}};
}
