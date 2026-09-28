// Operator-only packaging/activation through frozen public Host APIs.
// Ephemeral signing keys qualify the local topology, not a production publisher.
import { bootstrap } from '@alica/kernel';
import { canonical, digest, rawDigest } from '@alica/acap-contracts';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { attachBackend, handoffDescriptors, topics } from './host-link.mjs';
export async function publicDecisionHost(descriptor, provider, { enabled=true }={}) {
  const root=mkdtempSync(join(tmpdir(),'phase4-public-host-')), now=Date.now();
  const key=()=>{const {publicKey,privateKey}=generateKeyPairSync('ed25519'); const bytes=publicKey.export({type:'spki',format:'der'}).subarray(-32);return {privateKey,bytes,id:rawDigest(bytes)};};
  const authority=key(),publisher=key();
  const signature=(value,domain,k)=>({algorithm:'ed25519',keyId:k.id,signature:sign(null,Buffer.from(domain+'\n'+canonical(value)),k.privateKey).toString('base64')});
  const policy={schemaVersion:'alica.trust-policy/v1',version:1,rootKeyIds:[authority.id],publishers:[{id:'org.phase4.operator',keyIds:[publisher.id],executionModes:['inproc']}],issuedAtMs:now-100,expiresAtMs:now+600000,maxOfflineAgeMs:600000};
  const revocation={schemaVersion:'alica.revocation/v1',version:1,issuedAtMs:now-100,expiresAtMs:now+600000,revokedKeyIds:[],revokedArtifactDigests:[]};
  const trust={rootKeyId:authority.id,keys:{[authority.id]:authority.bytes.toString('base64'),[publisher.id]:publisher.bytes.toString('base64')},policy,policySignature:signature(policy,'ALICA-TRUST-POLICY-v1',authority),revocation,revocationSignature:signature(revocation,'ALICA-REVOCATION-v1',authority)};
  const host=bootstrap(canonical({cellId:'phase4',rootScope:'root',timeTrusted:true,maxCallMs:30000,cleanupMs:2000,activationMs:2000,eventQueue:8,auditCapacity:4096,maxInstances:32,maxScopes:32,maxGrants:128,maxEffects:128,maxCalls:32}),{trust,statePath:join(root,'trust.json'),initialize:true});
  const events=handoffDescriptors(descriptor);
  const binding=k=>({eventType:topics[k],version:'1.0.0',descriptorDigest:digest(events[k]),descriptorPath:'events/'+k+'.json'});
  const requirement={capabilityId:descriptor.id,major:1,minMinor:0,operations:['evaluate'],features:[]};
  const manifest=(id,extra={})=>({schemaVersion:'alica.plugin/v1',id,version:'1.0.0',publisher:'org.phase4.operator',execution:'inproc',entrypoint:'entry.mjs',provides:[],requires:[],optionalRequires:[],secretReferences:[],publishedEvents:[],subscribedEvents:[],...extra});
  const pack=(m,source,modules={})=>{
    const files={'manifest.json':Buffer.from(canonical(m)),'entry.mjs':Buffer.from(source),...modules};
    for(const [k,v] of Object.entries(events))files['events/'+k+'.json']=Buffer.from(canonical(v));
    files['descriptor.json']=Buffer.from(canonical(descriptor));
    const index={schemaVersion:'alica.package-index/v1',pluginId:m.id,version:m.version,manifestPath:'manifest.json',files:Object.entries(files).map(([path,b])=>({path,bytes:b.length,digest:rawDigest(b)})).sort((a,b)=>a.path<b.path?-1:1)};
    const indexText=canonical(index),profile={schemaVersion:'alica.profile/v1',profileId:'org.phase4.profile',version:'1.0.0',plugins:[{id:m.id,version:m.version,packageDigest:digest(index)}],providerPins:[],scopes:[{id:'root',parent:null}]};
    const bundle={schemaVersion:'alica.bundle/v1',bundleId:'phase4',profileDigest:digest(profile),artifacts:[...index.files.map(f=>({...f,kind:f.path.endsWith('.mjs')?'plugin':f.path==='descriptor.json'||f.path.startsWith('events/')?'descriptor':'manifest'})),{path:'package-index.json',bytes:Buffer.byteLength(indexText),digest:rawDigest(indexText),kind:'manifest'}]};
    return {files,indexText,profileText:canonical(profile),bundleText:canonical(bundle),signature:signature(bundle,'ALICA-BUNDLE-v1',publisher)};
  };
  const grant=(instance,type,target,operations)=>host.issueGrant({schemaVersion:type,grantId:randomUUID(),...host.identity(instance),[type==='acap.grant/v1'?'capabilityId':'eventType']:target,operations,issuedAtMs:now-1,expiresAtMs:now+600000,revision:0});
  let bridge, service, closed=false, callerNumber=0;
  try {
    const backend=host.discover(pack(manifest('org.phase4.backend',{publishedEvents:[binding('reply')],subscribedEvents:[binding('request'),binding('cancel')]}),'export function activate(){}'));
    grant(backend,'acap.event-grant/v1',topics.reply,['publish']);
    for(const k of ['request','cancel'])grant(backend,'acap.event-grant/v1',topics[k],['subscribe']);
    await host.activate(backend);
    const modules={};
    for(const path of ['service/index.mjs','service/host-link.mjs','provider/contract.mjs','provider/decimal.mjs'])modules[path]=readFileSync(new URL('../'+path,import.meta.url));
    const source="import {decisionService} from './service/index.mjs';import {pluginBackend} from './service/host-link.mjs';export async function activate(context){const p=await pluginBackend(context,"+canonical(host.identity(backend))+','+JSON.stringify(provider.id)+','+JSON.stringify(randomUUID())+');await decisionService('+canonical(descriptor)+',p,{enabled:'+enabled+'}).activate(context);}';
    service=host.discover(pack(manifest('org.phase4.service',{provides:[{capabilityId:descriptor.id,version:descriptor.version,descriptorDigest:digest(descriptor),descriptorPath:'descriptor.json'}],publishedEvents:[binding('request'),binding('cancel')],subscribedEvents:[binding('reply')]}),source,modules));
    for(const k of ['request','cancel'])grant(service,'acap.event-grant/v1',topics[k],['publish']);
    grant(service,'acap.event-grant/v1',topics.reply,['subscribe']);
    bridge=await attachBackend(host.context(backend),host.identity(service),provider);
    await host.activate(service);
    return {
      async caller(factory,snapshot,{authorized=true,requirementOverride}={}) {
        const id=host.discover(pack(manifest('org.phase4.consumer'+(++callerNumber),{requires:[requirementOverride??requirement]}),'export function activate(){}'));
        if(authorized)grant(id,'acap.grant/v1',descriptor.id,['evaluate']);
        await host.activate(id);
        const client=factory(snapshot); await client.plugin.activate(host.context(id));
        return {evaluate:client.evaluate,dispose:()=>host.dispose(id)};
      },
      disposeService:async()=>{const result=await host.dispose(service);await host.dispose(backend);return result;},
      inspect:()=>({host:host.inspect(),backend:bridge.inspect()}),
      async close(){
        if(closed)throw new Error('FAILED_PRECONDITION'); closed=true;
        try {const final=await host.shutdown();return {resources:final.resources,unsettledWork:final.unsettledWork,instances:final.instances.map(i=>({principal:i.principal,...i.cleanup})),backend:bridge.inspect()};}
        finally {rmSync(root,{recursive:true,force:true});}
      },
    };
  } catch(e) {try{await host.shutdown();}finally{rmSync(root,{recursive:true,force:true});}throw e;}
}
