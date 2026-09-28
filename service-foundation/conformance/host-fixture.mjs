// Test/operator harness only, NOT a Service Foundation runtime API.
// Same public Host inproc binding demonstrated by accepted SDK tutorial.
import {bootstrap} from '@alica/kernel';
import {canonical,digest,rawDigest} from '@alica/acap-contracts';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
export function hostFixture({syntheticSecret,cleanupMs=50,activationMs=100}={}){
 const root=mkdtempSync(join(tmpdir(),'phase50-host-')),now=Date.now();
 const key=()=>{const{publicKey,privateKey}=generateKeyPairSync('ed25519');const bytes=publicKey.export({type:'spki',format:'der'}).subarray(-32);return{privateKey,bytes,id:rawDigest(bytes)};};
 const authority=key(),publisher=key();
 const signature=(value,domain,k)=>({algorithm:'ed25519',keyId:k.id,signature:sign(null,Buffer.from(domain+'\n'+canonical(value)),k.privateKey).toString('base64')});
 const policy={schemaVersion:'alica.trust-policy/v1',version:1,rootKeyIds:[authority.id],publishers:[{id:'org.phase50.operator',keyIds:[publisher.id],executionModes:['inproc']}],issuedAtMs:now-100,expiresAtMs:now+60000,maxOfflineAgeMs:60000};
 const revocation={schemaVersion:'alica.revocation/v1',version:1,issuedAtMs:now-100,expiresAtMs:now+60000,revokedKeyIds:[],revokedArtifactDigests:[]};
 const trust={rootKeyId:authority.id,keys:{[authority.id]:authority.bytes.toString('base64'),[publisher.id]:publisher.bytes.toString('base64')},policy,policySignature:signature(policy,'ALICA-TRUST-POLICY-v1',authority),revocation,revocationSignature:signature(revocation,'ALICA-REVOCATION-v1',authority)};
 const host=bootstrap(canonical({cellId:'phase50',rootScope:'root',timeTrusted:true,maxCallMs:1000,cleanupMs,activationMs,eventQueue:4,auditCapacity:4096,maxInstances:64,maxScopes:32,maxGrants:128,maxEffects:128,maxCalls:64}),{trust,statePath:join(root,'trust.json'),initialize:true,...(syntheticSecret===undefined?{}:{syntheticSecret})});
 let counter=0;
 function discover({descriptor,requires=[],optionalRequires=[],secretReferences=[],source='export function activate(){}',scope='root'}={}){
  const id='org.phase50.instance'+(++counter);
  const manifest={schemaVersion:'alica.plugin/v1',id,version:'1.0.0',publisher:'org.phase50.operator',execution:'inproc',entrypoint:'entry.mjs',provides:descriptor?[{capabilityId:descriptor.id,version:descriptor.version,descriptorDigest:digest(descriptor),descriptorPath:'descriptor.json'}]:[],requires,optionalRequires,secretReferences,publishedEvents:[],subscribedEvents:[]};
  const files={'manifest.json':Buffer.from(canonical(manifest)),'entry.mjs':Buffer.from(source),...(descriptor?{'descriptor.json':Buffer.from(canonical(descriptor))}:{})};
  const index={schemaVersion:'alica.package-index/v1',pluginId:id,version:'1.0.0',manifestPath:'manifest.json',files:Object.entries(files).map(([path,b])=>({path,bytes:b.length,digest:rawDigest(b)})).sort((a,b)=>a.path<b.path?-1:1)};
  const indexText=canonical(index),profile={schemaVersion:'alica.profile/v1',profileId:'org.phase50.profile',version:'1.0.0',plugins:[{id,version:'1.0.0',packageDigest:digest(index)}],providerPins:[],scopes:[{id:'root',parent:null}]};
  const bundle={schemaVersion:'alica.bundle/v1',bundleId:'phase50',profileDigest:digest(profile),artifacts:[...index.files.map(f=>({...f,kind:f.path==='entry.mjs'?'plugin':f.path==='descriptor.json'?'descriptor':'manifest'})),{path:'package-index.json',bytes:Buffer.byteLength(indexText),digest:rawDigest(indexText),kind:'manifest'}]};
  return host.discover({files,indexText,profileText:canonical(profile),bundleText:canonical(bundle),signature:signature(bundle,'ALICA-BUNDLE-v1',publisher)},scope);
 }
 function grant(id,target,operations,{secret=false,scopeIdentity}={}){host.issueGrant({schemaVersion:secret?'acap.secret-grant/v1':'acap.grant/v1',grantId:randomUUID(),...host.identity(id),...scopeIdentity,[secret?'secretRef':'capabilityId']:target,operations,issuedAtMs:now-1,expiresAtMs:now+60000,revision:0});}
 return {host,discover,grant,root,async close(){try{return await host.shutdown();}finally{rmSync(root,{recursive:true,force:true});}}};
}
