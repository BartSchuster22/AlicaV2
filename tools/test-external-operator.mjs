// Executed only inside the isolated packed operator by --qualify.
// MOCK child, no inference: qualify the unchanged consumer and real operator
// success/failure cleanup. Real live_entry.main is separately tested in Python.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as kernel from '@alica/kernel';
import {mock} from 'node:test';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const config=JSON.parse(fs.readFileSync('qualification-config.json','utf8'));
const root=fs.mkdtempSync(join(tmpdir(),'phase3-operator-qualification-'));
const fixedAuth='/home/alica-dev/phase3-live-grant/temporary-codex-auth.json';
const fixedEntry='/home/alica-dev/AlicaV2-phase3/integrations/hermes/adapter/live_entry.py';
const disposableAuth=join(root,'synthetic-auth.json'),canary='SYNTHETIC_OPERATOR_NOT_AUTH';
const ownedRoots=[];let removes=0;
const map=p=>p===fixedAuth?disposableAuth:p;
// Do not reuse the real CJS default export: Node's mock loader defines named
// exports on it, and fs.constants is non-configurable on the real object.
const {default:realDefault,...namedFs}=fs;
const mappedFs={...namedFs,
 mkdtempSync:(...args)=>{const p=fs.mkdtempSync(...args);ownedRoots.push(p);return p},
 rmSync:(p,...args)=>{if(p===fixedAuth)removes++;return fs.rmSync(map(p),...args)},
 lstatSync:(p,...args)=>fs.lstatSync(map(p),...args)
};
mock.module('node:fs',{defaultExport:{...mappedFs},namedExports:mappedFs});
let activeScenario,injected;
const fail=stage=>{injected=stage;throw new Error('QUALIFICATION_'+stage)};
const {default:cryptoDefault,...namedCrypto}=crypto;
const mappedCrypto={...namedCrypto,generateKeyPairSync:(...args)=>{
 if(activeScenario==='key-generation-failure')fail(activeScenario);
 return crypto.generateKeyPairSync(...args);
}};
mock.module('node:crypto',{defaultExport:{...mappedCrypto},namedExports:mappedCrypto});
mock.module('@alica/kernel',{namedExports:{...kernel,bootstrap:(...args)=>{
 if(activeScenario==='bootstrap-failure')fail(activeScenario);
 return kernel.bootstrap(...args);
}}});
try{
 const {runExternal}=await import('./external-operator.mjs');
 const reports=[];
 for(const scenario of ['success','child-failure','pre-child-failure','key-generation-failure','bootstrap-failure']){
  activeScenario=scenario;injected=undefined;
  const rootCount=ownedRoots.length;
  const executable=join(root,'mock-child-'+scenario);
  fs.writeFileSync(executable,`#!/usr/bin/python3\nimport json,sys\nassert sys.argv[1] == ${JSON.stringify(fixedEntry)}\nassert json.load(sys.stdin) == {'task':'Read the approved fixture and return its text exactly.'}\n${scenario==='success'?"print(json.dumps({'text':'ALICA request-scoped fixture'}))":"sys.stderr.write('SYNTHETIC_OPERATOR_NOT_AUTH');sys.exit(1)"}\n`,{mode:0o700});
  fs.writeFileSync(disposableAuth,canary,{mode:0o600});
  const before=removes;
  const options={...config,mode:'hermes-live',entrypoint:fixedEntry,python:executable};
  if(scenario==='pre-child-failure')options.snapshot={};
  if(scenario==='success'){
   const result=await runExternal(options);
   assert.equal(result.result.text,'ALICA request-scoped fixture');
   assert.equal(result.runner.closed,true);
   assert.equal(result.runner.poisoned,false);
   assert.equal(result.runner.pending,0);
  }else{
   await assert.rejects(runExternal(options),e=>!String(e).includes(canary)
    && (!['key-generation-failure','bootstrap-failure'].includes(scenario) || e.message==='QUALIFICATION_'+scenario));
  }
  if(['key-generation-failure','bootstrap-failure'].includes(scenario)){
   assert.equal(injected,scenario);assert.ok(ownedRoots.length>rootCount);
  }
  assert.equal(removes,before+1);
  assert.equal(fs.existsSync(disposableAuth),false);
  for(const path of ownedRoots)assert.equal(fs.existsSync(path),false);
  reports.push({scenario,authRemoved:true,requestRootsRemoved:true});
 }
 console.log(JSON.stringify({mockOnly:true,liveH12:false,originalGrantTouched:false,reports}));
}finally{mock.restoreAll();fs.rmSync(root,{recursive:true,force:true})}
