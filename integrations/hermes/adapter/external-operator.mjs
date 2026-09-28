// Public operator only; separate from the SDK-only consumer project.
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {bootstrap} from '@alica/kernel';
import {canonical,digest,rawDigest} from '@alica/acap-contracts';
import {consumeSnapshot} from '@alica/catalog/release';
import {createPluginContext} from '@alica/plugin-sdk';
import {attachBridge,bridgeEvents,providerSource} from './bridge.mjs';
import {createProcessRunner} from './process-runner.mjs';

// Fixed production credential location; never delete the durable grant/attempt.
const liveAuth='/home/alica-dev/phase3-live-grant/temporary-codex-auth.json';
export async function runExternal(options) {
 try {return await runOwnedExternal(options)}
 finally {
  if(options.mode==='hermes-live'){
   rmSync(liveAuth,{force:true});
   assert.throws(()=>lstatSync(liveAuth),e=>e.code==='ENOENT');
  }
 }
}
async function runOwnedExternal({consumerURL,snapshot,mode,python,upstream,entrypoint}) {
 assert.ok(['neutral','hermes-offline','hermes-live'].includes(mode));
 if(mode==='hermes-live')assert.equal(entrypoint,'/home/alica-dev/AlicaV2-phase3/integrations/hermes/adapter/live_entry.py');
 const consumed=consumeSnapshot(snapshot);
 const entry=consumed.entries.find(e=>e.definition.metadata.id==='acap://alica.io/agent/execution@1');
 assert.ok(entry);const descriptor=entry.descriptor;
 assert.ok(descriptor?.id);
 const {execute}=await import(consumerURL);
 const root=mkdtempSync(join(tmpdir(),'phase3-external-operator-'));
 let host,runner,bridge;
 try {
 const key=()=>{const {publicKey,privateKey}=generateKeyPairSync('ed25519');const bytes=publicKey.export({type:'spki',format:'der'}).subarray(-32);return {privateKey,bytes,id:rawDigest(bytes)}};
 const authority=key(),publisher=key(),now=Date.now();
 const sig=(value,domain,k)=>({algorithm:'ed25519',keyId:k.id,signature:sign(null,Buffer.from(domain+'\n'+canonical(value)),k.privateKey).toString('base64')});
 const policy={schemaVersion:'alica.trust-policy/v1',version:1,rootKeyIds:[authority.id],publishers:[{id:'org.phase3.author',keyIds:[publisher.id],executionModes:['inproc']}],issuedAtMs:now-100,expiresAtMs:now+180000,maxOfflineAgeMs:180000};
 const revocation={schemaVersion:'alica.revocation/v1',version:1,issuedAtMs:now-100,expiresAtMs:now+180000,revokedKeyIds:[],revokedArtifactDigests:[]};
 const trust={rootKeyId:authority.id,keys:{[authority.id]:authority.bytes.toString('base64'),[publisher.id]:publisher.bytes.toString('base64')},policy,policySignature:sig(policy,'ALICA-TRUST-POLICY-v1',authority),revocation,revocationSignature:sig(revocation,'ALICA-REVOCATION-v1',authority)};
 const requirement={capabilityId:descriptor.id,major:1,minMinor:0,operations:['execute'],features:[]};
 function pkg(id,code,provides,events=[]) {
  const m={schemaVersion:'alica.plugin/v1',id,version:'1.0.0',publisher:'org.phase3.author',execution:'inproc',entrypoint:'index.js',provides:provides?[{capabilityId:descriptor.id,version:descriptor.version,descriptorDigest:digest(descriptor),descriptorPath:'descriptor.json'}]:[],requires:provides?[]:[requirement],optionalRequires:[],secretReferences:[],publishedEvents:[],subscribedEvents:[]};
  const files={'index.js':Buffer.from(code),'descriptor.json':Buffer.from(canonical(descriptor))};
  for(const [n,event] of events.entries()){const path=`event-${n}.json`;files[path]=Buffer.from(canonical(event));const binding={eventType:event.id,version:event.version,descriptorDigest:digest(event),descriptorPath:path};m.publishedEvents.push(binding);m.subscribedEvents.push(binding)}
  files['plugin.json']=Buffer.from(canonical(m));
  const index={schemaVersion:'alica.package-index/v1',pluginId:id,version:'1.0.0',manifestPath:'plugin.json',files:Object.entries(files).map(([path,b])=>({path,bytes:b.length,digest:rawDigest(b)})).sort((a,b)=>a.path.localeCompare(b.path))};
  const indexText=canonical(index),profile={schemaVersion:'alica.profile/v1',profileId:'org.phase3.profile',version:'1.0.0',plugins:[{id,version:'1.0.0',packageDigest:digest(index)}],providerPins:[],scopes:[{id:'root',parent:null}]};
  const bundle={schemaVersion:'alica.bundle/v1',bundleId:'phase3-external',profileDigest:digest(profile),artifacts:[...index.files.map(f=>({...f,kind:f.path.endsWith('.js')?'plugin':f.path==='plugin.json'?'manifest':'descriptor'})),{path:'package-index.json',bytes:Buffer.byteLength(indexText),digest:rawDigest(indexText),kind:'manifest'}]};
  return {files,indexText,profileText:canonical(profile),bundleText:canonical(bundle),signature:sig(bundle,'ALICA-BUNDLE-v1',publisher)};
 }
 host=bootstrap(canonical({cellId:'phase3-external',rootScope:'root',timeTrusted:true,maxCallMs:30000,cleanupMs:1000,activationMs:5000,eventQueue:4,auditCapacity:128,maxInstances:16,maxScopes:16,maxGrants:64,maxEffects:128,maxCalls:16}),{trust,statePath:join(root,'trust.json'),initialize:true});
  const neutral=`export async function activate(ctx){ctx.provide(${JSON.stringify(descriptor)},{execute:async input=>{if(input.task!== 'Read the approved fixture and return its text exactly.')throw Object.assign(new Error('INVALID_ARGUMENT'),{code:'INVALID_ARGUMENT'});return {text:'ALICA request-scoped fixture'}}})}`;
  const p=host.discover(pkg('org.phase3.provider',mode==='neutral'?neutral:providerSource(descriptor),true,mode==='neutral'?[]:bridgeEvents));
  if(mode!=='neutral')for(const event of bridgeEvents)host.issueGrant({schemaVersion:'acap.event-grant/v1',grantId:randomUUID(),...host.identity(p),eventType:event.id,operations:['publish','subscribe'],issuedAtMs:now-1,expiresAtMs:now+150000,revision:0});
  await host.activate(p);
  if(mode!=='neutral'){
   const requestRoot=mkdtempSync(join(root,'request-'));
   runner=createProcessRunner({executable:python,args:[entrypoint,requestRoot],cwd:root,env:{PYTHONPATH:upstream,PYTHONDONTWRITEBYTECODE:'1',PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},graceMs:100});
   bridge=await attachBridge(createPluginContext(host.context(p)),runner);
  }
  // Required capabilities are authorized during activation, before context exists.
  const denied=host.discover(pkg('org.phase3.denied','export async function activate(){}',false));
  await assert.rejects(host.activate(denied),e=>e.code==='PERMISSION_DENIED');
  const c=host.discover(pkg('org.phase3.consumer','export async function activate(){}',false));
  host.issueGrant({schemaVersion:'acap.grant/v1',grantId:randomUUID(),...host.identity(c),capabilityId:descriptor.id,operations:['execute'],issuedAtMs:now-1,expiresAtMs:now+150000,revision:0});
  await host.activate(c);
  const result=await execute(host.context(c),descriptor,'Read the approved fixture and return its text exactly.',{deadlineMs:Date.now()+120000});
  assert.equal(result.text,'ALICA request-scoped fixture');
  await host.shutdown();
  assert.deepEqual({...host.inspect().resources},{registrations:0,listeners:0,pendingCalls:0,effects:0});
  if(runner){assert.deepEqual(runner.inspect(),{closed:true,poisoned:false,pending:0});assert.equal(bridge.inspect().pending,0)}
  return {mode,result,snapshotDigest:snapshot.digest,deniedBeforeGrant:true,resources:host.inspect().resources,runner:runner?.inspect(),liveInference:mode==='hermes-live'};
 }finally{
  try {if(host)await host.shutdown()}
  finally {
   try {
    if(runner){await runner.close();assert.deepEqual(runner.inspect(),{closed:true,poisoned:false,pending:0})}
   }finally{rmSync(root,{recursive:true,force:true});assert.throws(()=>lstatSync(root),e=>e.code==='ENOENT')}
  }
 }
}
