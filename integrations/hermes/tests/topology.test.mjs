// H6: actual frozen Host, public package roots only; ephemeral synthetic trust.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { bootstrap } from '@alica/kernel';
import { canonical, digest, rawDigest } from '@alica/acap-contracts';
import { createPluginContext } from '@alica/plugin-sdk';
const descriptor = {schemaVersion:'acap.capability/v1',id:'io.alica.phase3.probe',version:'1.0.0',features:[],operations:[{name:'execute',kind:'unary',idempotency:'none',input:{type:'string'},output:{type:'string'}}]};
const requirement={capabilityId:descriptor.id,major:1,minMinor:0,operations:['execute'],features:[]};
export function fixture(t, contract=descriptor) {
 const descriptor=contract;
 const requirement={capabilityId:descriptor.id,major:1,minMinor:0,operations:['execute'],features:[]};
 const key=()=>{const {publicKey,privateKey}=generateKeyPairSync('ed25519');const bytes=publicKey.export({type:'spki',format:'der'}).subarray(-32);return {privateKey,bytes,id:rawDigest(bytes)}};
 const authority=key(),publisher=key(),now=Date.now();
 const sig=(value,domain,k)=>({algorithm:'ed25519',keyId:k.id,signature:sign(null,Buffer.from(domain+'\n'+canonical(value)),k.privateKey).toString('base64')});
 const policy={schemaVersion:'alica.trust-policy/v1',version:1,rootKeyIds:[authority.id],publishers:[{id:'org.phase3.author',keyIds:[publisher.id],executionModes:['inproc']}],issuedAtMs:now-100,expiresAtMs:now+60000,maxOfflineAgeMs:60000};
 const revocation={schemaVersion:'alica.revocation/v1',version:1,issuedAtMs:now-100,expiresAtMs:now+60000,revokedKeyIds:[],revokedArtifactDigests:[]};
 const trust={rootKeyId:authority.id,keys:{[authority.id]:authority.bytes.toString('base64'),[publisher.id]:publisher.bytes.toString('base64')},policy,policySignature:sig(policy,'ALICA-TRUST-POLICY-v1',authority),revocation,revocationSignature:sig(revocation,'ALICA-REVOCATION-v1',authority)};
 function pkg(id,code,provides=true,events=[]) {
  const m={schemaVersion:'alica.plugin/v1',id,version:'1.0.0',publisher:'org.phase3.author',execution:'inproc',entrypoint:'index.js',provides:provides?[{capabilityId:descriptor.id,version:descriptor.version,descriptorDigest:digest(descriptor),descriptorPath:'descriptor.json'}]:[],requires:[],optionalRequires:provides?[]:[requirement],secretReferences:[],publishedEvents:[],subscribedEvents:[]};
  const files={'plugin.json':Buffer.from(canonical(m)),'index.js':Buffer.from(code),'descriptor.json':Buffer.from(canonical(descriptor))};
  for (const [n,event] of events.entries()) {
   const path=`event-${n}.json`; files[path]=Buffer.from(canonical(event));
   const binding={eventType:event.id,version:event.version,descriptorDigest:digest(event),descriptorPath:path};
   m.publishedEvents.push(binding);m.subscribedEvents.push(binding);
  }
  files['plugin.json']=Buffer.from(canonical(m));
  const index={schemaVersion:'alica.package-index/v1',pluginId:id,version:'1.0.0',manifestPath:'plugin.json',files:Object.entries(files).map(([path,b])=>({path,bytes:b.length,digest:rawDigest(b)})).sort((a,b)=>a.path.localeCompare(b.path))};
  const indexText=canonical(index),profile={schemaVersion:'alica.profile/v1',profileId:'org.phase3.profile',version:'1.0.0',plugins:[{id,version:'1.0.0',packageDigest:digest(index)}],providerPins:[],scopes:[{id:'root',parent:null}]};
  const bundle={schemaVersion:'alica.bundle/v1',bundleId:'phase3-probe',profileDigest:digest(profile),artifacts:[...index.files.map(f=>({...f,kind:f.path.endsWith('.js')?'plugin':f.path==='plugin.json'?'manifest':'descriptor'})),{path:'package-index.json',bytes:Buffer.byteLength(indexText),digest:rawDigest(indexText),kind:'manifest'}]};
  return {files,indexText,profileText:canonical(profile),bundleText:canonical(bundle),signature:sig(bundle,'ALICA-BUNDLE-v1',publisher)};
 }
 const dir=mkdtempSync(join(tmpdir(),'phase3-topology-'));
 const host=bootstrap(canonical({cellId:'phase3-probe',rootScope:'root',timeTrusted:true,maxCallMs:1000,cleanupMs:200,activationMs:1000,eventQueue:4,auditCapacity:128,maxInstances:16,maxScopes:16,maxGrants:64,maxEffects:128,maxCalls:16}),{trust,statePath:join(dir,'trust.json'),initialize:true});
 t.after(async()=>{await host.shutdown();rmSync(dir,{recursive:true,force:true})});
 const grant=(id,scope='root',scopeGeneration=host.identity(id).scopeGeneration)=>host.issueGrant({schemaVersion:'acap.grant/v1',grantId:randomUUID(),...host.identity(id),scope,scopeGeneration,capabilityId:descriptor.id,operations:['execute'],issuedAtMs:now-1,expiresAtMs:now+30000,revision:0});
 return {host,pkg,grant};
}
const stub=`export async function activate(ctx){ctx.provide(${JSON.stringify(descriptor)},{execute:async x=>x})}`;
test('H6: verified in-process plugin cannot statically import child_process',async t=>{
 const {host,pkg}=fixture(t);const id=host.discover(pkg('org.phase3.spawn',"import {spawn} from 'node:child_process';"+stub));
 await assert.rejects(host.activate(id),e=>e.code==='FAILED_PRECONDITION');
});
test('H6: declared provider cannot defer registration to operator after ACTIVE',async t=>{
 const {host,pkg}=fixture(t);const id=host.discover(pkg('org.phase3.empty','export async function activate(){}'));
 await assert.rejects(host.activate(id),e=>e.code==='FAILED_PRECONDITION');
 assert.throws(()=>host.context(id));
});
test('H6: public ACTIVE context cannot replace existing root handler',async t=>{
 const {host,pkg}=fixture(t);const id=host.discover(pkg('org.phase3.provider',stub));await host.activate(id);
 const ctx=createPluginContext(host.context(id));assert.throws(()=>ctx.provide(descriptor,{execute:async x=>x}),e=>e.code==='CONFLICT');
});
test('H6: child registration does not solve duplicate provider identity; grants still required',async t=>{
 const {host,pkg,grant}=fixture(t);const id=host.discover(pkg('org.phase3.provider',stub));await host.activate(id);
 const child=createPluginContext(host.context(id)).createScope();child.provide(descriptor,{execute:async x=>x});
 const c=host.discover(pkg('org.phase3.consumer','export async function activate(){}',false),child.scope);await host.activate(c);
 await assert.rejects(host.context(c).optional(requirement),e=>e.code==='PERMISSION_DENIED');
 // Explicit ancestor then child grant; no inheritance is assumed.
 grant(c,'root',host.identity(id).scopeGeneration);grant(c,child.scope,child.scopeGeneration);
 await assert.rejects(host.context(c).optional(requirement),e=>e.code==='CONFLICT');
});
