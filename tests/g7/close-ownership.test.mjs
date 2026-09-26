// G7-10: real tiny FS operations with narrowly injected syscall/callback errors.
// Run directly: node --experimental-vm-modules tests/g7/close-ownership.test.mjs
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { SourceTextModule, SyntheticModule } from 'node:vm';
const source = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
// Exact production utility excerpts; no schema/Ajv/Kernel initialization.
const validation = source('packages/acap-contracts/src/validation.ts');
const excerpt = validation.slice(validation.indexOf('export class AcapError'),
  validation.indexOf('export function normalized')) +
  validation.slice(validation.indexOf('export function rawDigest'),
  validation.indexOf('export function digest('));
assert.ok(excerpt.startsWith('export class AcapError'));
// Finite type erasure of this exact excerpt, including TS parameter properties.
// No compiler/Wasm or unrelated contract initialization in the test closure.
let utilityJS = excerpt;
for (const [typed, js] of [
  ['  readonly correlationId: string;\n', ''],
  ['  readonly retryable = false;', '  retryable = false;'],
  ['    readonly code: ErrorCode,', '    code,'],
  ['    correlationId: string = randomUUID(),', '    correlationId = randomUUID(),'],
  ['    super(code);', '    super(code); this.code = code;'],
  ['fail(code: ErrorCode): never', 'fail(code)'],
  ['  ok: unknown,', '  ok,'],
  ["  code: ErrorCode = 'INVALID_ARGUMENT',", "  code = 'INVALID_ARGUMENT',"],
  ['): asserts ok {', ') {'],
  ['rawDigest(bytes: string | Uint8Array): string', 'rawDigest(bytes)'],
]) {
  assert.equal(utilityJS.split(typed).length, 2, 'exact utility type erasure');
  utilityJS = utilityJS.replace(typed, js);
}
const contracts = new SourceTextModule(
  "import {createHash, randomUUID} from 'node:crypto';\n" + utilityJS);
let observe = null;
const fsModule = new SyntheticModule(Object.keys(fs), function () {
  for (const key of Object.keys(fs)) this.setExport(key,
    typeof fs[key] === "function" ? (...args) => observe ? observe(key, args) : fs[key](...args) : fs[key]);
});
const cryptoModule = new SyntheticModule(Object.keys(crypto), function () {
  for (const key of Object.keys(crypto)) this.setExport(key, crypto[key]);
});
const archive = new SourceTextModule(source('tools/g7-archive.mjs'));
const durable = new SourceTextModule(source('tools/g7-durable.mjs'));
const modules = new Map([['node:fs', fsModule], ['node:crypto', cryptoModule],
  ['@alica/acap-contracts', contracts], ['./g7-archive.mjs', archive]]);
await durable.link((name) => {
  assert.ok(modules.has(name), 'unaudited import: ' + name);
  return modules.get(name);
});
await durable.evaluate();

const {openPrivateRoot, durableWrite, readPrivate, listPrivate, listPrivateBounded} = durable.namespace;
assert.ok(!process.argv.includes('--before'), 'historical before-mode is retained in DEV evidence only');
const beforeMode=false;
const scratch=fs.mkdtempSync(new URL('../../close-',import.meta.url).pathname);
fs.mkdirSync(scratch+'/child',{mode:0o700});
fs.writeFileSync(scratch+'/selected','prior',{mode:0o600,flag:'wx'});
fs.writeFileSync(scratch+'/sentinel','keep',{mode:0o600,flag:'wx'});
const root=openPrivateRoot(scratch);
const initial=fs.readdirSync('/proc/self/fd').length;
let passed=0, defects=0;
const cases=[
 ['write-primary-temp','write','fsyncSync:temp',['temp','parent']],
 ['write-temp-only','write',null,['temp']],
 ['write-parent-only','write',null,['parent']],
 ['write-postpublish','write','fsyncSync:parent',['parent']],
 ['write-old-primary','replace','fstatSync:old',['old','parent']],
 ['write-old-only','replace',null,['old']],
 ['write-undefined','write','undefined',['temp','parent']],
 ['read-primary','read','readSync:file',['file','parent']],
 ['read-file-only','read',null,['file','parent']],
 ['read-parent-only','read',null,['parent']],
 ['read-open','read','openSync:file',['parent']],
 ['read-owned','read','fstatSync:file',['file','parent']],
 ['list-primary','list','readdirSync',['parent']],
 ['list-only','list',null,['parent']],
 ['bounded-primary','bounded','dir-read',['directory','parent']],
 ['bounded-directory-only','bounded',null,['directory','parent']],
 ['bounded-parent-only','bounded',null,['parent']],
 ['bounded-root-primary','bounded-root','dir-read',['directory']],
 ['parent-reuse','traverse',null,['parent']],
 ['root-reuse','root',null,['ancestor']],
 ['parent-next-owned','traverse','fstatSync:next',['next','parent']],
 ['parent-initial-owned','read','fstatSync:parent',['parent']],
 ['root-owned','root-owned','fstatSync:final',['final']],
];
for(const [name,kind,primaryAt,closeFaults] of cases){
 const baseline=fs.readdirSync('/proc/self/fd').length;
 const primary=primaryAt==='undefined'?undefined:Object.assign(new Error(name+' primary'),{code:'EIO'});
 const closeErrors=new Map(closeFaults.map(x=>[x,Object.assign(new Error(name+' close '+x),{code:'EIO'})]));
 const tracked=new Map(), reused=[], events=[];
 let primaryFired=false, closeFired=[], output, thrown, caught=false, directoryClosed=false, directoryOpened=false;
 const target=kind==='replace'?'selected':'new-'+name;
 function fail(at){if(!primaryFired && at===primaryAt){primaryFired=true;throw primary;}}
 function released(fd,label){
   fs.closeSync(fd); tracked.delete(fd); events.push('closed:'+label);
   if(closeErrors.has(label)&&!closeFired.includes(label)){
     // Traversal can leave a lower free slot; retain bounded fillers until exact reuse.
     let sentinel;
     for(let i=0;i<64;i++){
       sentinel=fs.openSync(scratch+'/sentinel','r'); reused.push(sentinel);
       if(sentinel===fd)break;
     }
     assert.equal(sentinel,fd,'exact released Linux descriptor reused');
     closeFired.push(label); throw closeErrors.get(label);
   }
 }
 observe=(key,args)=>{
   if(key==='openSync'){
     const path=String(args[0]);
     let label=path.includes('/next-')?'temp':path.endsWith('/selected')?(kind==='replace'?'old':'file'):path.endsWith('/child')?'next':'parent';
     if(kind==='list'||kind==='bounded') label=path.endsWith('/child')?'parent':'walk';
     if(kind==='root'||kind==='root-owned') label=path.endsWith('/'+scratch.split('/').at(-1))?'final':'ancestor';
     fail('openSync:'+label);
     const fd=fs.openSync(...args); tracked.set(fd,label);events.push('open:'+label);return fd;
   }
   if(key==='closeSync') return released(args[0],tracked.get(args[0])||'RETRY-RELEASED');
   if(key==='opendirSync'){
     const d=fs.opendirSync(...args); directoryOpened=true;
     return {readSync(){fail('dir-read');return d.readSync();},closeSync(){
       d.closeSync(); directoryClosed=true;events.push('closed:directory');
       if(closeErrors.has('directory')){closeFired.push('directory');throw closeErrors.get('directory');}
     }};
   }
   fail(key+':'+tracked.get(args[0])); fail(key);
   return fs[key](...args);
 };
 try{
   if(kind==='write'||kind==='replace') output=durableWrite(root,target,Buffer.from('target'),{replace:kind==='replace',boundary(b){if(b==='open')fail('undefined');}});
   else if(kind==='read')output=readPrivate(root,'selected');
   else if(kind==='list')output=listPrivate(root,'child');
   else if(kind==='bounded')output=listPrivateBounded(root,'child',10);
   else if(kind==='bounded-root')output=listPrivateBounded(root,undefined,256);
   else if(kind==='traverse')output=listPrivate(root,'child');
   else output=openPrivateRoot(scratch);
 }catch(e){caught=true;thrown=e;}finally{observe=null;}
 const survivors=reused.filter(fd=>{try{fs.fstatSync(fd);return true;}catch(e){assert.equal(e.code,'EBADF');return false;}});
 const leaks=[...tracked.keys()].filter(fd=>{try{fs.fstatSync(fd);return true;}catch{return false;}});
 const expected=primaryFired?primary:closeErrors.get(closeFired[0]);
 const good=caught&&thrown===expected&&output===undefined&&survivors.length===reused.length&&leaks.length===0&&(!directoryOpened||directoryClosed);
 const result={name,good,primaryFired,primaryPreserved:!primaryFired||thrown===primary,closeFired,reused:reused.length,survived:survivors.length,leaks:leaks.length,events};
 console.log(JSON.stringify(result));
 // Test-owned cleanup only: close known live test descriptors, never retry destroyed sentinel.
 for(const fd of new Set([...survivors,...leaks]))fs.closeSync(fd);
 assert.equal(fs.readdirSync('/proc/self/fd').length,baseline,'test-owned cleanup bounded');
 if(beforeMode){
   if(['write-primary-temp','read-primary','parent-reuse','root-reuse'].includes(name)){
     assert.equal(good,false,'original defect must reproduce');defects++;
     if(name.endsWith('reuse')){assert.equal(survivors.length,0);assert.equal(leaks.length,1);}
     else {assert.equal(result.primaryPreserved,false);assert.equal(leaks.length,1);}
   }
 }else{
   assert.equal(good,true,name);
   assert.ok(closeFired.length>0,'fault reached');
   if(primaryAt!==null)assert.equal(primaryFired,true);
   assert.deepEqual(closeFired,closeFaults,'remaining cleanup executes');
   if(name==='write-parent-only'||name==='write-postpublish')assert.equal(fs.readFileSync(scratch+'/'+target,'utf8'),'target','published; error is not rollback');
   if(name==='write-old-primary'||name==='write-old-only')assert.equal(fs.readFileSync(scratch+'/selected','utf8'),'prior');
 }
 console.log('PASS '+name);passed++;
}
assert.equal(fs.readdirSync('/proc/self/fd').length,initial);
fs.closeSync(root);
if(beforeMode)assert.equal(defects,4);
console.log(JSON.stringify({passed,defects,beforeMode,scratch,qualification:'Linux released-FD EIO model; no hardware/cross-platform/crash qualification'}));
