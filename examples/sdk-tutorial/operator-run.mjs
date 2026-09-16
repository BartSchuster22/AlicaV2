// Public operator API only. Synthetic trust ceremony; private keys stay in memory.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {dirname,join,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {bootstrap} from '@alica/kernel';
import {canonical,digest,rawDigest} from '@alica/acap-contracts';
const root=resolve(dirname(fileURLToPath(import.meta.resolve('@tutorial/plugins/provider'))),'..');
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]);
const inventoryFiles=Object.fromEntries(walk(root).filter(p=>!relative(root,p).startsWith('node_modules/')).map(p=>[relative(root,p).replaceAll('\\','/'),new Uint8Array(readFileSync(p))]));
function key(){const {publicKey,privateKey}=generateKeyPairSync('ed25519');const bytes=publicKey.export({type:'spki',format:'der'}).subarray(-32);return {privateKey,bytes,id:rawDigest(bytes)}}
const authority=key(),publisher=key(),now=Date.now();
function signature(value,domain,k){return {algorithm:'ed25519',keyId:k.id,signature:sign(null,Buffer.from(domain+'\n'+canonical(value)),k.privateKey).toString('base64')}}
const policy={schemaVersion:'alica.trust-policy/v1',version:1,rootKeyIds:[authority.id],publishers:[{id:'org.tutorial.author',keyIds:[publisher.id],executionModes:['inproc']}],issuedAtMs:now-100,expiresAtMs:now+60000,maxOfflineAgeMs:60000};
const revocation={schemaVersion:'alica.revocation/v1',version:1,issuedAtMs:now-100,expiresAtMs:now+60000,revokedKeyIds:[],revokedArtifactDigests:[]};
const trust={rootKeyId:authority.id,keys:{[authority.id]:authority.bytes.toString('base64'),[publisher.id]:publisher.bytes.toString('base64')},policy,policySignature:signature(policy,'ALICA-TRUST-POLICY-v1',authority),revocation,revocationSignature:signature(revocation,'ALICA-REVOCATION-v1',authority)};
function packageOf(role){let files={...inventoryFiles};if(role==='probe'){const manifest={schemaVersion:'alica.plugin/v1',id:'org.tutorial.probe',version:'1.0.0',publisher:'org.tutorial.author',execution:'inproc',entrypoint:'dist/probe.js',provides:[],requires:[{capabilityId:'org.tutorial.result',major:1,minMinor:0,operations:['add'],features:[]}],optionalRequires:[],secretReferences:[],publishedEvents:[],subscribedEvents:[]};files={'probe.plugin.json':Buffer.from(canonical(manifest)),'dist/probe.js':Buffer.from("import {definePlugin} from '@alica/plugin-sdk';export const activate=definePlugin({activate(){}}).activate;")}}const m=JSON.parse(Buffer.from(files[role+'.plugin.json']).toString());const index={schemaVersion:'alica.package-index/v1',pluginId:m.id,version:m.version,manifestPath:role+'.plugin.json',files:Object.entries(files).map(([path,b])=>({path,bytes:b.length,digest:rawDigest(b)})).sort((a,b)=>a.path<b.path?-1:1)};const indexText=canonical(index);const profile={schemaVersion:'alica.profile/v1',profileId:'org.tutorial.profile',version:'1.0.0',plugins:[{id:m.id,version:m.version,packageDigest:digest(index)}],providerPins:[],scopes:[{id:'root',parent:null}]};const bundle={schemaVersion:'alica.bundle/v1',bundleId:'tutorial',profileDigest:digest(profile),artifacts:[...index.files.map(f=>({...f,kind:f.path.endsWith('.js')||f.path.endsWith('.mjs')?'plugin':f.path.startsWith('contracts/')?'descriptor':'manifest'})),{path:'package-index.json',bytes:Buffer.byteLength(indexText),digest:rawDigest(indexText),kind:'manifest'}]};return {files,indexText,profileText:canonical(profile),bundleText:canonical(bundle),signature:signature(bundle,'ALICA-BUNDLE-v1',publisher)}}
const dir=mkdtempSync(join(tmpdir(),'alica-public-host-'));
const host=bootstrap(canonical({cellId:'tutorial',rootScope:'root',timeTrusted:true,maxCallMs:1000,cleanupMs:100,activationMs:1000,eventQueue:4,auditCapacity:4096,maxInstances:16,maxScopes:16,maxGrants:64,maxEffects:128,maxCalls:64}),{trust,statePath:join(dir,'trust-state.json'),initialize:true});
try{
 const provider=host.discover(packageOf('provider'));
 const consumer=host.discover(packageOf('consumer'));
 const grant={schemaVersion:'acap.grant/v1',grantId:randomUUID(),...host.identity(consumer),capabilityId:'org.tutorial.math',operations:['add'],issuedAtMs:now-1,expiresAtMs:now+30000,revision:0};host.issueGrant(grant);
 const probe=host.discover(packageOf('probe'));
 const resultGrant={...grant,...host.identity(probe),grantId:randomUUID(),capabilityId:'org.tutorial.result'};host.issueGrant(resultGrant);
 await host.activate(probe);
 const req={capabilityId:'org.tutorial.result',major:1,minMinor:0,operations:['add'],features:[]};
 // Actual broker path: operator probe -> handwritten consumer -> generated client -> provider.
 const handle=await host.context(probe).require(req);
 const result=await handle.call('add',{left:20,right:22},{deadlineMs:Date.now()+1000});assert.equal(result,42);
 await assert.rejects(handle.call('add',{left:'bad',right:22},{deadlineMs:Date.now()+1000}),e=>e.code==='INVALID_ARGUMENT');
 const cleanup=await host.dispose(consumer);assert.equal(cleanup.state,'DISPOSED');assert.equal(cleanup.restartRequired,false);
 await assert.rejects(handle.call('add',{left:1,right:2},{deadlineMs:Date.now()+1000}),e=>e.code==='UNAVAILABLE');
 console.log(JSON.stringify({level:'PROVIDER',transport:'inproc',signedPackageVerified:true,inventoryOnlyModules:true,publicSdk:true,result,cleanup,providerActivated:!!provider}));
}finally{await host.shutdown();rmSync(dir,{recursive:true,force:true})}
