// Real candidate operator composition, public native Host admission, no fixture/placeholder.
// Signing material is qualification-only; bearer issuer is the isolated profile.
import assert from 'node:assert/strict';
import https from 'node:https';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {startMemoryReadComposition} from '/home/alica-dev/AlicaV2-native-candidate/service-foundation/tooling/native-memory-composition.mjs';
import {memoryNativeArtifacts} from '/home/alica-dev/AlicaV2-native-candidate/service-foundation/tooling/native-memory.mjs';
import {operatorMaterial,config} from './signing.mjs';
import {canonical,digest} from '@alica/acap-contracts';
import {createPluginContext} from '@alica/plugin-sdk';
import {createSessionVerifier,createReadBinding} from './binding.mjs';
const root=process.cwd(),results=[];
assert(import.meta.resolve('@alica/kernel').includes('/AlicaV2-native-candidate/'));
const mounts=readFileSync('/proc/self/mountinfo','utf8').split('\n').filter(x=>x.includes('/AlicaV2-native-candidate ')||x.includes('/memory-python-r2 '));
assert.equal(mounts.length,2);assert(mounts.every(x=>x.split(' ')[5].split(',').includes('ro')));
writeFileSync(root+'/evidence/runtime-boundary.json',JSON.stringify({kernel:import.meta.resolve('@alica/kernel'),mounts},null,2));
const d=JSON.parse(readFileSync('/home/alica-dev/AlicaV2-phase5i/catalog/proposals/memory-candidates-v2/descriptor.json'));
const requirement={capabilityId:d.id,major:2,minMinor:0,operations:['get','search'],features:[]};
const identities=new Map();
let providerReads=0,providerMutationCalls=0;
const python='/home/alica-dev/phase5i/memory-python-r2/bin/python';
async function createRuntime(epoch){
 const material=operatorMaterial();
 const signedProviderPackage=material.packageBytes({descriptor:d,source:"import './provider.mjs'; export function activate(){throw Error('explicit native admission required');}",extra:{'provider.mjs':readFileSync('/home/alica-dev/AlicaV2-native-candidate/services/memoryv4/provider.mjs')}});
 const configuration={python,databasePath:root+'/state/memory.sqlite3'};
 const admission={schemaVersion:'alica.native-admission/v1',implementationId:'memory-v1',packageDigest:digest(JSON.parse(signedProviderPackage.indexText)),configurationDigest:digest(configuration),artifacts:memoryNativeArtifacts(python),issuedAtMs:Date.now()-1,expiresAtMs:Date.now()+180000};
 assert(admission.artifacts.some(f=>f.path.endsWith('/services/memoryv4/app/domain.py')));assert(admission.artifacts.some(f=>f.path.endsWith('/packages/plugin-sdk/package.json')));assert(admission.artifacts.some(f=>f.path.endsWith('/packages/acap-contracts/package.json')));
 writeFileSync(root+'/evidence/native-admission-'+epoch+'.json',JSON.stringify(admission,null,2));
 const composition=await startMemoryReadComposition({configText:canonical(config),bootstrapOptions:{trust:material.trust,statePath:root+'/state/trust-'+epoch+'.json',initialize:true},signedProviderPackage,admission,configuration,descriptor:d,resolveAuthority:caller=>{providerReads++;return identities.get(JSON.stringify([caller.principal,caller.instanceId,caller.scope]));}});
 return {...composition,discover:({requires,scope})=>composition.host.discover(material.packageBytes({requires}),scope)};
}
let f=await createRuntime('first'),id=f.providerId;
async function caller(scope){
 const cid=f.discover({requires:[requirement],scope}),grants=[],expiresAtMs=Date.now()+45000;
 for(const override of scope==='root'?[{}]:[{scope:'root',scopeGeneration:1},{}]){const grantId=randomUUID();f.host.issueGrant({schemaVersion:'acap.grant/v1',grantId,...f.host.identity(cid),...override,capabilityId:d.id,operations:requirement.operations,issuedAtMs:Date.now()-1,expiresAtMs,revision:0});grants.push(grantId);}
 await f.host.activate(cid);const ctx=createPluginContext(f.host.context(cid));const handle=await ctx.require(requirement);
 return {cid,ctx,handle,grants};
}
let binding;let cleanup;
try {
 const nativeContext=f.host.context(id);
 const policies=new Map(),callers={};
 for(const subject of ['A','B']){
  const c=await caller(nativeContext.scope);callers[subject]=c;
  const dataScope=subject==='A'?'tenant:offline/project:a':'tenant:foreign/project:b';
  const authority=Object.freeze({actor:'worker:application-'+subject,scope_path:subject==='A'?'tenant:offline':'tenant:foreign',permissions:Object.freeze(['memory.read','memory.search'])});
  const identityKey=JSON.stringify([c.ctx.principal,c.cid,c.ctx.scope]);identities.set(identityKey,authority);
  policies.set(subject,Object.freeze({version:1,capability:d.id,capabilityVersion:d.version,instance:id,callerInstance:c.cid,dataScope,read:(op,input,opts)=>{if(!['get','search'].includes(op)){providerMutationCalls++;throw Error('forbidden mutation');}return c.handle.call(op,input,opts);},reauthorize:async()=>{if(identities.get(identityKey)!==authority)throw Object.assign(Error('PERMISSION_DENIED'),{code:'PERMISSION_DENIED'});await c.ctx.require(requirement);if(identities.get(identityKey)!==authority)throw Object.assign(Error('PERMISSION_DENIED'),{code:'PERMISSION_DENIED'});}}));
 }
 let clockOffset=0;
 const cert=readFileSync(root+'/tls/cert.pem');let verifier=createSessionVerifier({clock:()=>Date.now()+clockOffset});
 let deliveryHook=async()=>{};
 binding=createReadBinding({tls:{key:readFileSync(root+'/tls/key.pem'),cert},verifier,resolvePolicy:s=>policies.get(s),beforeDelivery:x=>deliveryHook(x)});
 await new Promise(r=>binding.server.listen(0,'127.0.0.1',r));let port=binding.server.address().port;
 const a=verifier.issue('A'),b=verifier.issue('B');
 function request(token,body,{path='/v1/memory/read',headers={},method='POST',raw}={}) {return new Promise((resolve,reject)=>{
  const bytes=raw===undefined?JSON.stringify(body):raw;const req=https.request({host:'127.0.0.1',port,path,method,ca:cert,rejectUnauthorized:true,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...headers}},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>{try{resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(text)});}catch(e){reject(e);}});});req.setTimeout(5000,()=>req.destroy(Error('client deadline')));req.on('error',reject);req.end(bytes);
 });}
 const query={operation:'search',input:{query:'lexical',limit:25,cursor:''}};
 async function check(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS',name);}
 let record;
 await check('real HTTPS + verified certificate -> SDK/Host -> real Memory search',async()=>{const r=await request(a,query);assert.equal(r.status,200);assert(r.body.result.candidates.length>0);record=r.body.result.candidates[0];assert.equal(record.scope,'tenant:offline/project:a');assert.equal(r.headers['cache-control'],'private, no-store');assert.equal(r.body.continuity,'unknown');assert.equal(r.body.source.capability,d.id);assert.equal(r.body.source.version,d.version);assert.equal(r.body.source.instance,id);});
 await check('actual Memory detail matches search stable ID',async()=>{const r=await request(a,{operation:'get',input:{id:record.id}});assert.equal(r.status,200);assert.deepEqual(r.body.result,record);});
 await check('B cannot retrieve A record through trusted scope mapping',async()=>{const r=await request(b,{operation:'get',input:{id:record.id}});assert.notEqual(r.status,200);assert(!JSON.stringify(r.body).includes(record.content));});
 await check('B search is successful empty scoped result, not copied A cache',async()=>{const r=await request(b,query);assert.equal(r.status,200);assert.deepEqual(r.body.result.candidates,[]);});
 await check('no credentials / forged token / expired session / unknown subject denied',async()=>{for(const token of [null,'x'.repeat(43),verifier.issue('A',{ttlMs:-1}),verifier.issue('unknown')]){const r=await request(token,query);assert([401,403].includes(r.status));}});
 await check('forged scope/principal/actor rejected before provider dispatch',async()=>{const count=providerReads;for(const x of [{...query,principal:'admin'},{...query,input:{...query.input,scope:'tenant:foreign'}},{...query,input:{...query.input,actor:'admin'}}])assert.equal((await request(a,x)).status,400);assert.equal(providerReads,count);});
 await check('create/update/control/upload/download/issuer endpoints absent',async()=>{const count=providerReads;for(const op of ['create','update','execute'])assert.equal((await request(a,{operation:op,input:{}})).status,403);for(const path of ['/upload','/download','/issue','/v1/capability/call'])assert.equal((await request(a,query,{path})).status,404);assert.equal(providerReads,count);});
 await check('browser origin/cookie rejected; selected profile is bearer-only headless',async()=>{for(const headers of [{origin:'https://evil.invalid'},{cookie:'session=forged'}])assert.equal((await request(a,query,{headers})).status,403);});
 await check('invalid JSON, unknown fields and pagination bounds rejected',async()=>{assert.equal((await request(a,query,{raw:'{'})).status,400);for(const limit of [0,26,1.5])assert.equal((await request(a,{...query,input:{...query.input,limit}})).status,400);assert.equal((await request(a,{...query,input:{...query.input,query:'x'.repeat(501)}})).status,400);});
 await check('overlarge request rejected without provider dispatch',async()=>{const count=providerReads;assert.equal((await request(a,query,{raw:' '.repeat(65537)})).status,413);assert.equal(providerReads,count);});
 async function inFlight(action,token=a){let entered,release;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);deliveryHook=async()=>{entered();await gate;};const pending=request(token,query);await waiting;action();release();const r=await pending;deliveryHook=async()=>{};assert.notEqual(r.status,200);assert(!JSON.stringify(r.body).includes(record.content));}
 await check('session revoked after real read: response body suppressed',async()=>{const t=verifier.issue('A');await inFlight(()=>verifier.revoke(t),t);assert.equal((await request(t,query)).status,401);});
 await check('policy scope downgrade during read: late body suppressed',async()=>{const old=policies.get('A');await inFlight(()=>policies.set('A',Object.freeze({...old,version:2,dataScope:'tenant:foreign/project:b'})));policies.set('A',old);});
 await check('expired session after real read suppressed (controlled verifier clock)',async()=>{const t=verifier.issue('A');try{await inFlight(()=>{clockOffset=61000;},t);}finally{clockOffset=0;}});
 await check('domain authority removed after real read: late result suppressed',async()=>{const c=callers.A,key=JSON.stringify([c.ctx.principal,c.cid,c.ctx.scope]),old=identities.get(key);try{await inFlight(()=>identities.delete(key));}finally{identities.set(key,old);}});
 await check('TLS peer without trusted certificate fails closed',async()=>{await assert.rejects(new Promise((resolve,reject)=>{const r=https.get({host:'127.0.0.1',port,path:'/',rejectUnauthorized:true},resolve);r.on('error',reject);}),e=>e.code==='DEPTH_ZERO_SELF_SIGNED_CERT');});
 await check('four-query session bound rejects fifth with no extra dispatch',async()=>{let release;const gate=new Promise(r=>release=r);let entered=0,ready;const all=new Promise(r=>ready=r);deliveryHook=async()=>{if(++entered===4)ready();await gate;};const pending=Array.from({length:4},()=>request(a,query));await all;const r=await request(a,query);assert.equal(r.status,429);release();for(const r of await Promise.all(pending))assert.equal(r.status,200);deliveryHook=async()=>{};});
 await check('current Host grant revoked after read: no protected delivery',async()=>{await inFlight(()=>f.host.revokeGrant(callers.A.grants.at(-1)));const r=await request(a,query);assert.equal(r.status,403);});
 await check('domain permission removal independently denies B reads',async()=>{const c=callers.B;identities.set(JSON.stringify([c.ctx.principal,c.cid,c.ctx.scope]),{actor:'worker:application-B',scope_path:'tenant:foreign',permissions:[]});const r=await request(b,query);assert.equal(r.status,401);assert.equal(r.body.error.code,'UNAUTHENTICATED');});
 await check('new session cannot revive revoked Host authority',async()=>{assert.equal((await request(verifier.issue('A'),query)).status,403);});
 async function installFreshCaller(){
  const c=await caller('root'),key=JSON.stringify([c.ctx.principal,c.cid,c.ctx.scope]);
  const authority=Object.freeze({actor:'worker:reconstruction',scope_path:'tenant:offline',permissions:['memory.read','memory.search']});identities.set(key,authority);
  policies.set('A',Object.freeze({version:1,capability:d.id,capabilityVersion:d.version,instance:f.providerId,dataScope:'tenant:offline/project:a',read:(op,input,opts)=>c.handle.call(op,input,opts),reauthorize:async()=>{assert.equal(identities.get(key),authority);await c.ctx.require(requirement);}}));
  return c;
 }
 const liveCaller=await installFreshCaller(),oldSession=verifier.issue('A');
 const detail={operation:'get',input:{id:record.id}};
 assert.equal((await request(oldSession,detail)).status,200);
 const oldProvider=id;
 await check('clean shutdown rejects previously live old handle',async()=>{
  await binding.close();verifier.clear();const stopped=await f.close();assert.equal(f.active(),0);
  for(const k of ['effects','registrations','listeners','pendingCalls'])assert.equal(stopped.resources[k],0);
  await assert.rejects(liveCaller.handle.call('get',{scope:'tenant:offline/project:a',id:record.id},{deadlineMs:Date.now()+1000}));
 });
 identities.clear();policies.clear();f=await createRuntime('reconstructed');id=f.providerId;assert.notEqual(id,oldProvider);
 await installFreshCaller();verifier=createSessionVerifier();
 binding=createReadBinding({tls:{key:readFileSync(root+'/tls/key.pem'),cert},verifier,resolvePolicy:s=>policies.get(s),beforeDelivery:x=>deliveryHook(x)});
 await new Promise(r=>binding.server.listen(0,'127.0.0.1',r));port=binding.server.address().port;
 await check('reconstructed composition rejects old bearer session',async()=>assert.equal((await request(oldSession,detail)).status,401));
 const freshSession=verifier.issue('A');
 await check('new authorized session reads original record after reconstruction',async()=>{const r=await request(freshSession,detail);assert.equal(r.status,200);assert.deepEqual(r.body.result,record);});
 await check('native approval revocation suppresses pending real result',async()=>{await inFlight(()=>{void f.host.revokeNative('memory-v1');},freshSession);assert.notEqual((await request(freshSession,detail)).status,200);});
 assert.equal(providerMutationCalls,0);assert.equal(binding.stats().active,0);
 verifier.clear();
 console.log('RESULT',JSON.stringify({tests:results.length,providerReads,providerMutationCalls,applicationCalls:binding.stats().calls}));
} finally {
 if(binding)await binding.close();cleanup=await f.close();assert.equal(f.active(),0);assert.equal(cleanup.resources.pendingCalls,0);assert.equal(cleanup.resources.registrations,0);assert.equal(cleanup.resources.listeners,0);assert.equal(cleanup.resources.effects,0);
 writeFileSync(root+'/evidence/result.json',JSON.stringify({status:results.length===23?'PASS_NATIVE_CANDIDATE_READ_RECONSTRUCTION':'INCOMPLETE',tests:results,providerReads,providerMutationCalls,cleanup:cleanup.resources,limitations:['Operator signing keys are ephemeral qualification authority, not production key custody','Bearer-only isolated verifier; no browser login/SSO','Trusted native in-process activation is not an OS sandbox','No UI, production rollout, live inference or domain mutations'],G01:results.length===23?'fixture-free public native admission and real read composition exercised':'INCOMPLETE - inspect test results',G02:'isolated bearer profile retained'},null,2)+'\n');
}
