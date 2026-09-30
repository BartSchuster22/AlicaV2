// Qualification-only signing material; no fixture, fake provider or implicit grants.
import {generateKeyPairSync,sign} from 'node:crypto';
import {canonical,digest,rawDigest} from '@alica/acap-contracts';
const key=()=>{const {publicKey,privateKey}=generateKeyPairSync('ed25519');const bytes=publicKey.export({type:'spki',format:'der'}).subarray(-32);return {bytes,privateKey,id:rawDigest(bytes)};};
function signed(value,domain,k){return {algorithm:'ed25519',keyId:k.id,signature:sign(null,Buffer.from(domain+'\n'+canonical(value)),k.privateKey).toString('base64')};}
export function operatorMaterial(){
 const now=Date.now(),authority=key(),publisher=key();
 const policy={schemaVersion:'alica.trust-policy/v1',version:1,rootKeyIds:[authority.id],publishers:[{id:'org.phase5a.operator',keyIds:[publisher.id],executionModes:['inproc']}],issuedAtMs:now-100,expiresAtMs:now+300000,maxOfflineAgeMs:300000};
 const revocation={schemaVersion:'alica.revocation/v1',version:1,issuedAtMs:now-100,expiresAtMs:now+300000,revokedKeyIds:[],revokedArtifactDigests:[]};
 const trust={rootKeyId:authority.id,keys:{[authority.id]:authority.bytes.toString('base64'),[publisher.id]:publisher.bytes.toString('base64')},policy,policySignature:signed(policy,'ALICA-TRUST-POLICY-v1',authority),revocation,revocationSignature:signed(revocation,'ALICA-REVOCATION-v1',authority)};
 let number=0;
 function packageBytes({source='export function activate(){}',descriptor,requires=[],extra={}}={}){
  const id='org.phase5a.package'+(++number);
  const manifest={schemaVersion:'alica.plugin/v1',id,version:'1.0.0',publisher:'org.phase5a.operator',execution:'inproc',entrypoint:'entry.mjs',provides:descriptor?[{capabilityId:descriptor.id,version:descriptor.version,descriptorDigest:digest(descriptor),descriptorPath:'descriptor.json'}]:[],requires,optionalRequires:[],secretReferences:[],publishedEvents:[],subscribedEvents:[]};
  const files={'manifest.json':Buffer.from(canonical(manifest)),'entry.mjs':Buffer.from(source),...(descriptor?{'descriptor.json':Buffer.from(canonical(descriptor))}:{}),...extra};
  const index={schemaVersion:'alica.package-index/v1',pluginId:id,version:'1.0.0',manifestPath:'manifest.json',files:Object.entries(files).map(([path,b])=>({path,bytes:b.length,digest:rawDigest(b)})).sort((a,b)=>a.path<b.path?-1:1)};
  const indexText=canonical(index),profile={schemaVersion:'alica.profile/v1',profileId:'org.phase5a.profile',version:'1.0.0',plugins:[{id,version:'1.0.0',packageDigest:digest(index)}],providerPins:[],scopes:[{id:'root',parent:null}]};
  const bundle={schemaVersion:'alica.bundle/v1',bundleId:'phase5a-native',profileDigest:digest(profile),artifacts:[...index.files.map(f=>({...f,kind:f.path.endsWith('.mjs')?'plugin':f.path==='descriptor.json'?'descriptor':'manifest'})),{path:'package-index.json',bytes:Buffer.byteLength(indexText),digest:rawDigest(indexText),kind:'manifest'}]};
  return {files,indexText,profileText:canonical(profile),bundleText:canonical(bundle),signature:signed(bundle,'ALICA-BUNDLE-v1',publisher)};
 }
 return {trust,packageBytes};
}
export const config={cellId:'phase5a-native-candidate',rootScope:'root',timeTrusted:true,maxCallMs:5000,cleanupMs:1500,activationMs:1500,eventQueue:16,auditCapacity:4096,maxInstances:32,maxScopes:32,maxGrants:128,maxEffects:32,maxCalls:32};
