// Runnable qualification operator example, not a framework service supervisor.
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostFixture} from '/external/operator/host-fixture.mjs';
import {echo as externalEcho} from '@phase50/external-author';
import {stateless,records,consumer,requirement} from '@alica/service-foundation/reference';
import {fileRecords} from '@alica/service-foundation/native-record-resource';
import {consumeSnapshot} from '@alica/catalog/release';
import {validate,localJSON} from '@alica/service-foundation';
const json=url=>JSON.parse(readFileSync(url,'utf8'));
const echo=json(new URL('/external/operator/echo.json',import.meta.url));
const selectedRecords=consumeSnapshot(json(new URL('/external/operator/record-snapshot.json',import.meta.url)));
assert.equal(selectedRecords.entries.length,1);assert.equal(selectedRecords.entries[0].definition.metadata.maturity,'experimental');
const record=selectedRecords.entries[0].descriptor;
const serviceManifest=name=>json(new URL('/external/operator/'+name+'/service.json',import.meta.url));
const f=hostFixture();
async function caller(d,scope,authorized=true){
 const id=f.discover({requires:[requirement(d)],scope});
 if(authorized){if(scope!=='root')f.grant(id,d.id,d.operations.map(x=>x.name),{scopeIdentity:{scope:'root',scopeGeneration:1}});f.grant(id,d.id,d.operations.map(x=>x.name));}
 await f.host.activate(id);const c=consumer(d);await c.plugin.activate(f.host.context(id));return {id,c};
}
async function attach(d,s){
 const source="import {AcapError} from '@alica/acap-contracts';let release;export function activate(c){release=c.provide("+JSON.stringify(d)+",{"+d.operations.map(o=>JSON.stringify(o.name)+":async()=>{await release();throw new AcapError('UNAVAILABLE');}").join(',')+"});}";
 const id=f.discover({descriptor:d,source});await f.host.activate(id);
 const bootstrap=await caller(d,'root');await assert.rejects(bootstrap.c.call(d.operations[0].name,d.id===echo.id?{text:'bootstrap'}:{key:'bootstrap',value:''}),{code:'UNAVAILABLE'});await f.host.dispose(bootstrap.id);
 assert.equal(f.host.inspect().registry.filter(r=>r.owner===id).length,0);
 const ctx=f.host.context(id).createScope();try{await s.plugin.activate(ctx);}catch(e){await f.host.dispose(id);throw e;}return{id,scope:ctx.scope};
}
const mode=process.argv[2]??'normal';
const directory='/state/domain/p2';
try{
 for(const name of ['stateless','stateful']){const root=new URL('/external/operator/'+name+'/',import.meta.url),snapshot=json(new URL('snapshot.json',root));const result=validate(serviceManifest(name),{snapshot,pin:snapshot.digest,readJSON:file=>localJSON(root.pathname,file),configuration:name==='stateful'?{directory}:{}});assert.equal(result.semantic.status,'PASS');assert.equal(result.executed.status,'NOT_TESTED');if(name==='stateful')assert.equal(snapshot.digest,selectedRecords.digest);}
 if(mode==='hold'){
  const s=records(record,fileRecords(directory),{declaredDomains:serviceManifest('stateful').data.authoritative}),p=await attach(record,s),{c}=await caller(record,p.scope);await c.call('put',{key:'committed',value:'before-crash'});assert.equal(s.health(),'READY');console.log('P2_COMPLETED_WRITE_AND_CLEAN_STOP');
 }else if(mode==='recover'){
  const s=records(record,fileRecords(directory),{declaredDomains:serviceManifest('stateful').data.authoritative}),p=await attach(record,s),{c}=await caller(record,p.scope);assert.deepEqual(await c.call('get',{key:'committed'}),{found:true,value:'before-crash'});console.log('RECOVERED_COMPLETED_WRITE_NO_CRASH_DURABILITY_CLAIM');
 }else{
  for(const factory of [stateless,externalEcho]){const s=factory(echo),p=await attach(echo,s),{c}=await caller(echo,p.scope);assert.equal(s.health(),'READY');assert.deepEqual(await c.call('echo',{text:'unchanged-consumer'}),{text:'unchanged-consumer'});await assert.rejects(caller(echo,p.scope,false),{code:'PERMISSION_DENIED'});await f.host.dispose(p.id);assert.equal(s.health(),'UNAVAILABLE');await assert.rejects(c.call('echo',{text:'stale'}));}
  for(const round of [0,1]){const s=records(record,fileRecords(directory),{declaredDomains:serviceManifest('stateful').data.authoritative}),p=await attach(record,s),{c}=await caller(record,p.scope);if(round===0)await c.call('put',{key:'persistent',value:'same-directory'});assert.deepEqual(await c.call('get',{key:'persistent'}),{found:true,value:'same-directory'});await f.host.dispose(p.id);assert.equal(s.health(),'UNAVAILABLE');}
 }
}finally{
 const result=await f.close();assert.deepEqual({...result.resources},{registrations:0,listeners:0,pendingCalls:0,effects:0});for(const i of result.instances){assert.deepEqual([...i.cleanup.failedDisposers],[]);assert.equal(i.cleanup.timedOutResources,0);}
 if(mode==='normal')rmSync(directory,{recursive:true,force:true});
 console.log(JSON.stringify({mode,publicHost:true,clean:true,externalAuthor:true,operatorOwnedNative:true,independentlySignedNative:false,catalogRecords:'EXPERIMENTAL_LOCAL_SNAPSHOT',catalogDigest:selectedRecords.digest,trustVerified:selectedRecords.trustVerified}));
}
