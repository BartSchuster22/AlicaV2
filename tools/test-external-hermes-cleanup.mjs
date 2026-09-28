// Focused B1 regression: evaluate the actual, unmodified workflow source with
// disposable-only filesystem bindings. No production auth/grant or subprocess.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import * as crypto from 'node:crypto';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
const source=fs.readFileSync(new URL('./test-external-hermes.mjs',import.meta.url),'utf8');
const fixedAuth='/home/alica-dev/phase3-live-grant/temporary-codex-auth.json';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'alica-b1-disposable-'));
try{
 const auth=path.join(root,'auth.json');
 const durable=['original-approved3total.sqlite','original-attempt.sentinel'].map(name=>path.join(root,name));
 for(const file of durable)fs.writeFileSync(file,'DISPOSABLE UNCHANGED '+path.basename(file),{mode:0o600});
 const snapshot=()=>durable.map(file=>{const s=fs.lstatSync(file);return {bytes:fs.readFileSync(file).toString('hex'),mode:s.mode,ino:s.ino,size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs}});
 const before=snapshot(),reports=[];
 for(const scenario of ['first-allocation-failure','invalid-live-invocation']){
  fs.writeFileSync(auth,'SYNTHETIC AUTH ONLY',{mode:0o600});
  let allocations=0,dispatches=0,deletions=0,absenceChecks=0,unexpectedFs=0;
  const injected=new Error('B1_FIRST_ALLOCATION_FAILURE');
  const rejectFs=()=>{unexpectedFs++;throw new Error('Unexpected workflow filesystem operation')};
  const bindings={
   'node:assert/strict':{default:assert},
   'node:fs':{
    mkdtempSync(prefix){allocations++;assert.equal(prefix,path.join(os.tmpdir(),'alica-phase3-external-'));throw injected},
    mkdirSync:rejectFs,cpSync:rejectFs,readFileSync:rejectFs,writeFileSync:rejectFs,
    rmSync(file,options){assert.equal(file,fixedAuth);assert.deepEqual({...options},{force:true});deletions++;fs.rmSync(auth,options)},
    lstatSync(file){assert.equal(file,fixedAuth);absenceChecks++;return fs.lstatSync(auth)}
   },
   'node:os':{tmpdir:os.tmpdir},'node:path':{join:path.join,resolve:path.resolve},
   'node:url':{pathToFileURL:url.pathToFileURL},
   'node:child_process':{execFileSync(){dispatches++;throw new Error('Dispatch forbidden')}},
   'node:crypto':{createHash:crypto.createHash}
  };
  const context=createContext({assert,console,process:{argv:['node','workflow','--live',...(scenario==='invalid-live-invocation'?['--qualify']:[])],cwd:()=>'/home/alica-dev/AlicaV2-phase3',env:{},execPath:process.execPath}});
  const workflow=new SourceTextModule(source,{context,identifier:'actual-test-external-hermes.mjs'});
  await workflow.link(specifier=>{
   assert.ok(Object.hasOwn(bindings,specifier),'Unexpected import: '+specifier);
   const values=bindings[specifier];
   return new SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value)},{context});
  });
  await assert.rejects(workflow.evaluate(),e=>scenario==='first-allocation-failure'?e===injected:e.code==='ERR_ASSERTION'&&e.message==='qualification cannot dispatch the original live attempt');
  assert.equal(allocations,scenario==='first-allocation-failure'?1:0);
  assert.equal(dispatches,0);assert.equal(unexpectedFs,0);
  assert.equal(deletions,1);assert.equal(absenceChecks,1);
  assert.throws(()=>fs.lstatSync(auth),e=>e.code==='ENOENT');
  assert.deepEqual(snapshot(),before);
  reports.push({scenario,allocations,authRemoved:true,absenceChecks,dispatches,durableSentinelsUnchanged:true});
 }
 console.log(JSON.stringify({mockOnly:true,originalGrantTouched:false,liveH12:false,reports}));
}finally{fs.rmSync(root,{recursive:true,force:true})}
