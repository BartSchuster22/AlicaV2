// D4 disposable feasibility fixture only. NOT production Doghouse/D11.
import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,eventDescriptor} from '../../../tools/g3-fixtures.mjs';
const sdk='import {definePlugin} from "@alica/plugin-sdk";';
const desc=JSON.stringify(eventDescriptor);
test('D4 authorized synthetic source -> accepted SDK typed events -> isolated signal sink',async t=>{
 const e=environment(t);
 t.after(()=>{delete globalThis.phase52emit;delete globalThis.phase52sink;});
 const sink=e.load({id:'org.phase52.sink',provides:[],events:[eventDescriptor],subscribe:true,
  code:sdk+`export const activate=definePlugin({activate(ctx){globalThis.phase52sink=[];ctx.events(${desc}).on(async envelope=>{globalThis.phase52sink.push({producer:envelope.sourceInstanceId,observer:ctx.instanceId,scope:envelope.sourceScope,envelope});});}}).activate;`});
 const source=e.load({id:'org.phase52.source',provides:[],events:[eventDescriptor],publish:true,
  code:sdk+`export const activate=definePlugin({activate(ctx){globalThis.phase52emit=data=>ctx.events(${desc}).emit(data);}}).activate;`});
 e.grant(sink,undefined,['subscribe'],{schemaVersion:'acap.event-grant/v1',eventType:eventDescriptor.id});
 await e.host.activate(sink);await e.host.activate(source);
 await assert.rejects(globalThis.phase52emit('isolated-failure'),x=>x.code==='PERMISSION_DENIED');
 assert.equal(globalThis.phase52sink.length,0);
 const grant=e.grant(source,undefined,['publish'],{schemaVersion:'acap.event-grant/v1',eventType:eventDescriptor.id});
 assert.equal((await globalThis.phase52emit('isolated-failure')).admitted,1);
 for(let i=0;i<100&&globalThis.phase52sink.length===0;i++)await new Promise(r=>setTimeout(r,1));
 const [record]=globalThis.phase52sink;
 assert.ok(record);assert.equal(record.producer,source);assert.equal(record.observer,sink);
 assert.equal(record.envelope.data,'isolated-failure');
 assert.equal(record.envelope.sourceScope,'root');
 assert.ok(record.envelope.eventId);assert.equal(record.envelope.sequence,1);
 e.host.revokeGrant(grant.grantId);
 await assert.rejects(globalThis.phase52emit('revoked'),x=>x.code==='PERMISSION_DENIED');
 assert.equal(globalThis.phase52sink.length,1);
 await e.host.shutdown();
 assert.deepEqual({...e.host.inspect().resources},{registrations:0,listeners:0,pendingCalls:0,effects:0});
 console.log(JSON.stringify({gate:'D4',path:'signed synthetic plugins / public SDK events-on-emit / broker / disposable sink',deniedBeforeGrant:true,deniedAfterRevocation:true,brokerProvenance:true,cleanup:true,production:false,finishedD11:false}));
});
