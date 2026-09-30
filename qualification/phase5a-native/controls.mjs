// Host native-admission controls. No Memory operation or placeholder provider.
import {bootstrap} from '@alica/kernel';
import {canonical,digest,rawDigest,AcapError} from '@alica/acap-contracts';
import {operatorMaterial,config} from './signing.mjs';
import {writeFileSync,mkdirSync,readFileSync,symlinkSync} from 'node:fs';
import {memoryNativeArtifacts} from '/home/alica-dev/AlicaV2-native-candidate/service-foundation/tooling/native-memory.mjs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=process.cwd(),results=[];let serial=0;
function setup({source='export function activate(){}',descriptor,activate=()=>{},approval={},badConfig=false,without=false,activationMs=1000}={}){
 const dir=root+'/state/control-'+(++serial);mkdirSync(dir);const asset=dir+'/approved.txt';writeFileSync(asset,'approved implementation sentinel for Host control test');
 const material=operatorMaterial(),pkg=material.packageBytes({source,descriptor});
 const admission={schemaVersion:'alica.native-admission/v1',implementationId:'control',packageDigest:digest(JSON.parse(pkg.indexText)),configurationDigest:digest({purpose:'control'}),artifacts:[{path:asset,digest:rawDigest(readFileSync(asset))}],issuedAtMs:Date.now()-1,expiresAtMs:Date.now()+30000,...approval};
 const configuration={purpose:badConfig?'wrong':'control'};
 const host=bootstrap(canonical({...config,activationMs}),{trust:material.trust,statePath:dir+'/trust.json',initialize:true,...(without?{}:{nativeImplementations:[{admission,configuration,activate}]})});
 return {host,id:host.discover(pkg),asset,admission,configuration,pkg};
}
async function check(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS',name);}
async function clean(e){const r=await e.host.shutdown();for(const k of ['effects','registrations','listeners','pendingCalls'])assert.equal(r.resources[k],0);return r;}
await check('missing operator admission denies before activation',async()=>{const e=setup({without:true});try{assert.throws(()=>e.host.activateNative(e.id,'control'),{code:'PERMISSION_DENIED'});}finally{await clean(e);}});
await check('wrong signed package binding denied before native callback',async()=>{let n=0;const e=setup({activate:()=>n++,approval:{packageDigest:'sha256:'+'0'.repeat(64)}});try{assert.throws(()=>e.host.activateNative(e.id,'control'),{code:'PERMISSION_DENIED'});assert.equal(n,0);}finally{await clean(e);}});
await check('wrong configuration digest rejected at bootstrap',async()=>assert.throws(()=>setup({badConfig:true}),{code:'PERMISSION_DENIED'}));
await check('changed approved file denied before callback',async()=>{let n=0;const e=setup({activate:()=>n++});try{writeFileSync(e.asset,'changed');assert.throws(()=>e.host.activateNative(e.id,'control'),{code:'PERMISSION_DENIED'});assert.equal(n,0);}finally{await clean(e);}});
await check('expired native admission denied',async()=>{const now=Date.now(),e=setup({approval:{issuedAtMs:now-1000,expiresAtMs:now-1}});try{assert.throws(()=>e.host.activateNative(e.id,'control'),{code:'PERMISSION_DENIED'});}finally{await clean(e);}});
await check('not-yet-valid native admission denied',async()=>{const now=Date.now(),e=setup({approval:{issuedAtMs:now+5000,expiresAtMs:now+10000}});try{assert.throws(()=>e.host.activateNative(e.id,'control'),{code:'PERMISSION_DENIED'});}finally{await clean(e);}});
await check('admission/configuration copied and frozen against caller mutation',async()=>{let observed;const e=setup({activate:(_ctx,cfg)=>{observed=cfg;}});try{e.admission.packageDigest='sha256:'+'f'.repeat(64);e.configuration.purpose='changed';await e.host.activateNative(e.id,'control');assert.equal(observed.purpose,'control');assert.deepEqual(Object.keys(observed),['purpose']);assert(Object.isFrozen(observed));}finally{await clean(e);}});
await check('ordinary plugin linker unchanged; no automatic native fallback',async()=>{let n=0;const e=setup({source:"import 'node:fs';export function activate(){}",activate:()=>n++});try{await assert.rejects(e.host.activate(e.id),{code:'FAILED_PRECONDITION'});assert.equal(n,0);}finally{await clean(e);}});
await check('native callback cannot register undeclared descriptor',async()=>{const d=JSON.parse(readFileSync('/home/alica-dev/AlicaV2-native-candidate/catalog/proposals/memory-candidates-v2/descriptor.json'));const e=setup({activate:ctx=>ctx.provide(d,{})});try{await assert.rejects(e.host.activateNative(e.id,'control'),{code:'CONTRACT_MISMATCH'});}finally{await clean(e);}});
await check('declared capability completeness enforced for native activation',async()=>{const d=JSON.parse(readFileSync('/home/alica-dev/AlicaV2-native-candidate/catalog/proposals/memory-candidates-v2/descriptor.json'));const e=setup({descriptor:d});try{await assert.rejects(e.host.activateNative(e.id,'control'),{code:'FAILED_PRECONDITION'});}finally{await clean(e);}});
async function childCase(timeout){
 let child,closed,pid,cleaned=false;const e=setup({activationMs:50,activate:async ctx=>{
  await ctx.effect(async own=>{own(async()=>{if(child){child.kill('SIGKILL');await closed;}cleaned=true;});child=spawn('/usr/bin/sleep',['30'],{stdio:'ignore'});pid=child.pid;closed=new Promise(r=>child.once('close',r));});
  if(timeout)await new Promise(()=>{});else throw new AcapError('UNAVAILABLE');
 }});
 try{await assert.rejects(e.host.activateNative(e.id,'control'),{code:timeout?'DEADLINE_EXCEEDED':'UNAVAILABLE'});assert(cleaned);assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});assert.throws(()=>e.host.context(e.id),{code:'FAILED_PRECONDITION'});}finally{const report=await clean(e);if(timeout)assert.equal(report.instances.find(i=>i.id===e.id).cleanup.restartRequired,true);}
}
await check('partial native failure kills owned child and publishes no authority',()=>childCase(false));
await check('bounded native timeout kills owned child; restartRequired truthful',()=>childCase(true));
await check('idle native admission expiry proactively cleans without a call',async()=>{
 let resolve,cleaned=new Promise(r=>resolve=r);const e=setup({approval:{issuedAtMs:Date.now()-1,expiresAtMs:Date.now()+150},activate:ctx=>ctx.effect(async own=>own(()=>resolve()))});
 let timer;try{await e.host.activateNative(e.id,'control');await Promise.race([cleaned,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('expiry did not dispose')),3000))]);assert.throws(()=>e.host.context(e.id),{code:'FAILED_PRECONDITION'});assert(JSON.stringify(e.host.drainAudit()).includes('NATIVE_EXPIRED:'));}finally{clearTimeout(timer);await clean(e);}
});
await check('explicit native revocation cleans and prevents reactivation',async()=>{let n=0;const e=setup({activate:ctx=>ctx.effect(async own=>own(()=>{n++;}))});try{await e.host.activateNative(e.id,'control');await e.host.revokeNative('control');assert.equal(n,1);assert.throws(()=>e.host.activateNative(e.id,'control'));}finally{await clean(e);}});
await check('artifact enumeration includes cache bytes and package metadata; directory cycles bounded',async()=>{
 const v=root+'/state/inventory-only-venv';mkdirSync(v+'/bin',{recursive:true});const cache=v+'/lib/python3.12/site-packages/__pycache__';mkdirSync(cache,{recursive:true});
 symlinkSync('/usr/bin/python3.12',v+'/bin/python');writeFileSync(v+'/pyvenv.cfg','inventory-only test, never executed');writeFileSync(cache+'/sentinel.pyc','cache-bytes-for-inventory-test');symlinkSync(v+'/lib/python3.12/site-packages',cache+'/cycle');
 const artifacts=memoryNativeArtifacts(v+'/bin/python');assert.equal(artifacts.find(x=>x.path===cache+'/sentinel.pyc').digest,rawDigest(readFileSync(cache+'/sentinel.pyc')));assert(artifacts.some(x=>x.path.endsWith('/packages/plugin-sdk/package.json')));assert(artifacts.some(x=>x.path.endsWith('/services/memoryv4/app/domain.py')));
});
writeFileSync(root+'/evidence/native-controls.json',JSON.stringify({status:'PASS',tests:results},null,2)+'\n');console.log('CONTROL_RESULT',results.length);
