// Portable exact-method regression. Explicit FS/effect mocks; NOT native proof.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve,dirname,basename} from 'node:path';
const cell=readFileSync(new URL('../tools/g7-cell.mjs',import.meta.url),'utf8');
const helper=readFileSync(new URL('../tools/g7-cell-rotation.mjs',import.meta.url),'utf8');
const durable=readFileSync(new URL('../tools/g7-durable.mjs',import.meta.url),'utf8');
const denyImport=s=>{throw Error('unmapped import '+s)};
const context=vm.createContext({}, {codeGeneration:{strings:false,wasm:false}});
new vm.SourceTextModule(cell,{context,importModuleDynamically:denyImport}); // PARSE ONLY
const h=new vm.SourceTextModule(helper,{context,importModuleDynamically:denyImport});
assert.deepEqual(h.dependencySpecifiers,[]);await h.link(denyImport);await h.evaluate({timeout:1000});
function method(name){
 const start=new RegExp('^  (?:async )?'+name.replace('#','\\#')+'\\(','m');
 const match=start.exec(cell);assert(match,name);
 const rest=cell.slice(match.index+match[0].length);
 const end=/^  (?:async )?[#a-zA-Z]\w*\(/m.exec(rest);
 return cell.slice(match.index,end?match.index+match[0].length+end.index:cell.lastIndexOf('\n}'));
}
const names=['#shutdown','#run','#guard','#base','#status','#validatedStatus','#initialize','#ownedLifecycle','#ownedOperation','#stage','#recover','#startAccepted','initialize','stage','install','recover','startAccepted','status','ownedBegin','ownedReinstall','ownedUpgrade','ownedServe','ownedMaintain','ownedRecoverPrior','ownedFinish','ownedBackup','ownedRestoreStage','ownedRestoreConstruct','ownedRestoreRun','#ownedRestore'];
const methods=names.map(method).join('\n');
const fields=[...cell.slice(cell.indexOf('export class CellPreparation'),cell.indexOf('  // Starts the actual')).matchAll(/^  (#\w+)(?:[^\n]*);/gm)].map(m=>m[1]);
const refs=[...new Set([...methods.matchAll(/this\.(#\w+)/g)].map(m=>m[1]))];
const stubs=refs.filter(n=>!names.includes(n)&&!fields.includes(n));
const floor={rootKeyId:'root',policyVersion:1,revocationVersion:1,lastWallMs:1};
let fixture,events,effects;
const effect=n=>{effects.push(n);throw Object.assign(Error('effect '+n),{code:'EFFECT'});};
const check=(v,code='INVALID_ARGUMENT')=>{if(!v)throw Object.assign(Error(code),{code});};
// Execute REAL listPrivate with mocked owned/readdir/parent boundary. No disk IO.
const lp=durable.slice(durable.indexOf('export function listPrivate('),durable.indexOf('// Bounded enumeration')).replace('export ','');
Object.assign(context,{
 check,resolve,dirname,basename,Buffer,process:{pid:42},console,
 requireOrdinaryCellRoot:h.namespace.requireOrdinaryCellRoot,
 owned:()=>events.push('owned-root'),
 readdirSync:()=>{events.push('root-list');if(fixture.error)throw Object.assign(Error(fixture.error),{code:fixture.error});return fixture.names;},
 parent:()=>effect('marker-or-subdirectory-open'),closeSync:()=>events.push('close-independent-input'),
 readPrivate:(fd,p)=>{events.push(p==='request'?'independent-input-read':'read:'+p);if(p==='kernel.json')return Buffer.from('{}');if(p==='request')return Buffer.from(JSON.stringify({approval:{},authorization:{},checkpoint:floor,trust:{}}));throw Error('unexpected read '+p);},
 openPrivateRoot:()=>{events.push('open-independent-input');return 8;},
 canonical:JSON.stringify,parse:JSON.parse,same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
 cellSchema:(n,v)=>v,validateHistory:()=>{},limits:{verifyTimeoutMs:1000},
 outcome:(e,r)=>Object.assign(e,{runtime:r}),digest:()=> 'prior',
 deadline:()=>({}),recoveryRecipientId:()=> 'key',
 ownedStop:()=>effect('ownedStop'),bootstrap:()=>effect('bootstrap'),
 encryptBackup:()=>effect('encryptBackup'),stageBackupTransport:()=>effect('stageBackupTransport'),
 inspectRelease:()=>effect('inspectRelease'),inspectStoredRelease:()=>effect('inspectStoredRelease'),
 randomUUID:()=> 'id',configuration:()=> '{}',monotonic:()=>{},
 stub:(n,...a)=>{events.push(n);if(n==='#read'){if(a[0]==='identity.json')return {schemaVersion:'alica.cell-identity/v1',cellId:'cell'};if(a[0]==='floor.json')return floor;throw Error('unexpected #read');}if(n==='#journals')return [];if(n==='#local')return {archive:'/archive',trust:{},authorization:{}};return effect(n);},
 watch:{assert:()=>events.push('guard'),abandon:()=>events.push('abandon'),seal:()=>events.push('safety-seal'),finish:()=>effect('finish'),protect:()=>effect('protect')},
});
new vm.Script(lp+`\nclass Harness { ${fields.map(n=>n+';').join('\n')}
 constructor(mode){this.#fd=7;this.#root='/cell';this.#stopped=true;this.#channel=mode==='channel'?{}:undefined;if(mode==='maintain'){this.#session=true;this.#watch=watch;this.#serving=true;}if(mode==='session'){this.#session=true;this.#watch=watch;}if(mode==='prior'){this.#session=true;this.#watch=watch;this.#priorRecovery='prior';}}
 ${stubs.map(n=>n+'(...args){return stub('+JSON.stringify(n)+',...args)}').join('\n')}
 ${methods}
} globalThis.Harness=Harness;`).runInContext(context,{timeout:1000});
const options={age:'/age',destination:'/destination',recipient:'recipient'};
const calls=[['status',undefined,[]],['stage',undefined,['/archive',{},{}]],['install',undefined,['/archive',{},{}]],['recover',undefined,[{}]],['startAccepted','channel',[{},{},'prior']],['initialize',undefined,[{policy:{version:1},revocation:{version:1}},floor]],['ownedBegin',undefined,['/inputs']],['ownedReinstall',undefined,['/inputs']],['ownedUpgrade',undefined,['/inputs','/target']],['ownedMaintain','maintain',['/inputs']],['ownedServe','session',['/inputs']],['ownedRecoverPrior','prior',['/inputs']],['ownedFinish','session',[]],['ownedBackup','session',['/inputs',options]],...['ownedRestoreStage','ownedRestoreConstruct','ownedRestoreRun'].map(name=>[name,'session',['/approval/request',{...options,cipher:'/cipher',identity:'/identity',...(name!=='ownedRestoreStage'?{construction:'/construction'}:{}),...(name==='ownedRestoreRun'?{runtimeInput:'/runtime'}:{})}]])];
const variants=[['empty',{kind:'directory',contents:[]}],['malformed',{kind:'directory',contents:['bad']}],['populated',{kind:'directory',contents:['sealed-history']}],['file',{kind:'file'}],['symlink',{kind:'symlink'}],['unreadable-marker',{kind:'directory',readError:'EACCES'}]];
let cases=0;
for(const [label,marker] of variants)for(const [name,mode,args]of calls){
 fixture={names:['rotations'],marker};events=[];effects=[];let error;
 try{await new context.Harness(mode)[name](...args)}catch(e){error=e}
 assert(error,label+' '+name+' must deny');
 assert.deepEqual(effects,[],label+' '+name+' effects before denial');
 assert(events.includes('root-list'),name+' must observe root');
 if(name==='ownedMaintain')assert(events.indexOf('safety-seal')<events.indexOf('root-list'),'existing live safety seal precedes stopped observation');
 assert(!events.some(e=>e.startsWith('read:')||e==='#read'||e==='#journals'),name+' must deny before state/history reads');
 assert(['FAILED_PRECONDITION','CONFLICT'].includes(error.code),label+' '+name+' '+error.code);cases++;
}
for(const code of ['EACCES','EIO','ENOENT'])for(const [name,mode,args]of calls){
 fixture={error:code};events=[];effects=[];await assert.rejects(async()=>new context.Harness(mode)[name](...args),e=>e.code===code);assert.deepEqual(effects,[]);cases++;
}
// Missing marker preserves real ordinary base/status and reaches old effect boundaries.
for(const [name,mode,args]of calls.slice(0,9)){
 fixture={names:name==='initialize'?[]:['identity.json','floor.json','kernel.json']};events=[];effects=[];
 if(name==='status'){assert.equal(new context.Harness(mode).status().cellId,'cell');}
 else {await assert.rejects(async()=>new context.Harness(mode)[name](...args),e=>e.code==='EFFECT'||(name==='startAccepted'&&e.code==='FAILED_PRECONDITION'));}
 if(['ownedBegin','ownedReinstall','ownedUpgrade'].includes(name))assert.deepEqual(effects,['ownedStop']);
 cases++;
}
for(const bad of [null,{},['rotations/retained'],[1]])assert.throws(()=>h.namespace.requireOrdinaryCellRoot(bad),e=>e.code==='FAILED_PRECONDITION');
assert.doesNotThrow(()=>h.namespace.requireOrdinaryCellRoot([]));
console.log(JSON.stringify({pass:true,cases,helperNegative:4,markerContentsNeverOpened:true,scope:'exact Cell/helper/listPrivate logic; FS/effect mocks; NOT native proof'}));
