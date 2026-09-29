import {environment} from '../../../tools/g3-fixtures.mjs';
import {createPluginContext} from '@alica/plugin-sdk';
import {descriptor,event} from '../contracts.mjs';
import {Assurance} from '../core.mjs';
import {FileStore} from '../store.mjs';
import {doghouse} from '../adapter.mjs';
import {incidentConsumer} from '../../../examples/phase52-consumer/consumer.mjs';
export async function publicFixture(t,directory){
 const e=environment(t,{cleanupMs:2500}),req=incidentConsumer(descriptor).requirement;
 const issue=e.grant,expiresAtMs=Date.now()+600000;e.grant=(id,cap,ops,extra={})=>issue(id,cap,ops,{...extra,expiresAtMs});
 const code=`import {AcapError} from '@alica/acap-contracts';let release;export function activate(c){release=c.provide(${JSON.stringify(descriptor)},{${descriptor.operations.map(o=>`${o.name}:async()=>{await release();throw new AcapError('UNAVAILABLE');}`).join(',')}});}`;
 const provider=e.load({id:'org.phase52.provider',provides:[descriptor],events:[event],subscribe:true,code});await e.host.activate(provider);
 const boot=e.load({id:'org.phase52.bootstrap',provides:[],requires:[req],code:'export function activate(){}'});e.grant(boot,descriptor.id,['get','list','acknowledge']);await e.host.activate(boot);
 const bh=await e.host.context(boot).require(req);try{await bh.call('list',{scope:'root',offset:0,limit:1},{deadlineMs:Date.now()+1000});}catch(x){if(x.code!=='UNAVAILABLE')throw x;}await e.host.dispose(boot);
 const ctx=e.host.context(provider).createScope();
 e.grant(provider,undefined,['subscribe'],{schemaVersion:'acap.event-grant/v1',eventType:event.id});
 e.grant(provider,undefined,['subscribe'],{schemaVersion:'acap.event-grant/v1',eventType:event.id,scope:ctx.scope,scopeGeneration:ctx.scopeGeneration});
 const source=e.load({id:'org.phase52.source',provides:[],events:[event],publish:true,code:'export function activate(){}'},ctx.scope);
 e.grant(source,undefined,['publish'],{schemaVersion:'acap.event-grant/v1',eventType:event.id,scope:'root',scopeGeneration:1});
 e.grant(source,undefined,['publish'],{schemaVersion:'acap.event-grant/v1',eventType:event.id});await e.host.activate(source);
 const sid=e.host.identity(source),sourceContext=createPluginContext(e.host.context(source));
 const domain=new Assurance(new FileStore(directory),{targets:[{principal:sid.principal,instanceId:sid.instanceId,generation:sid.scopeGeneration,scope:sid.scope,target:'isolated-target'}]});
 const service=doghouse(domain);await service.plugin.activate(ctx);
 async function consumer({grant=true,map=true,name='reader'}={}){
  const id=e.load({id:'org.phase52.'+name,provides:[],requires:[req],code:'export function activate(){}'},ctx.scope);
  if(grant){e.grant(id,descriptor.id,['get','list','acknowledge'],{scope:'root',scopeGeneration:1});e.grant(id,descriptor.id,['get','list','acknowledge']);}
  await e.host.activate(id);const identity=e.host.identity(id);
  if(map)domain.actors.push({principal:identity.principal,instanceId:id,hostScope:ctx.scope,scope:ctx.scope,actor:name,permissions:['read','acknowledge']});
  const client=incidentConsumer(descriptor);await client.plugin.activate(e.host.context(id));return {id,client};
 }
 let timestamp=Date.now();
 const signal=(id,kind='FAIL')=>({observationId:id,target:'isolated-target',occurredAtMs:timestamp++,observedAtMs:timestamp-1,signal:kind,evidence:{code:kind==='FAIL'?'CHECK_FAILED':'CHECK_RECOVERED',sha256:'a'.repeat(64)}});
 const emit=payload=>sourceContext.events(event).emit(payload);
 const settled=async()=>{for(let n=0;n<100;n++){await new Promise(r=>setTimeout(r,2));if(domain.pending===0)return;}throw Error('fixture drain timeout');};
 return {...e,provider,source,domain,service,scope:ctx.scope,consumer,signal,emit,settled};
}
