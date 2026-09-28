// Reuses original external SDK workflow: packed public artifacts, isolated
// consumer with no Kernel installed, separate operator. Default is offline.
// --live is the one original authorized attempt, never an automatic retry.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,rmSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const live=process.argv.includes('--live'),qualify=process.argv.includes('--qualify');
let temp;
try{
 assert.ok(process.argv.slice(2).every(x=>['--live','--qualify'].includes(x)));
 assert.ok(!(live&&qualify),'qualification cannot dispatch the original live attempt');
 const repo=process.cwd();
 temp=mkdtempSync(join(tmpdir(),'alica-phase3-external-'));
 const run=(cmd,args,cwd)=>execFileSync(cmd,args,{cwd,encoding:'utf8',timeout:180000,env:{...process.env,NODE_PATH:'',NODE_OPTIONS:''},stdio:['ignore','pipe','pipe']});
 const artifacts=join(temp,'artifacts'),consumer=join(temp,'consumer'),operator=join(temp,'operator');
 for(const p of [artifacts,consumer,operator])mkdirSync(p);
 const packs={};
 for(const name of ['acap-types','acap-contracts','plugin-sdk','catalog','kernel']){
  const [pack]=JSON.parse(run('npm',['pack',join(repo,'packages',name),'--pack-destination',artifacts,'--json','--ignore-scripts'],repo));
  assert.ok(pack.files.every(f=>!/(?:^|\/)(?:src|keys|node_modules)(?:\/|$)|\.(?:pem|key|env)$/.test(f.path)));
  packs[name]=join(artifacts,pack.filename);
 }
 for(const p of [consumer,operator])writeFileSync(join(p,'package.json'),JSON.stringify({name:'phase3-external-'+(p===consumer?'consumer':'operator'),version:'1.0.0',private:true,type:'module'}));
 const install=(p,names)=>run('npm',['install','--no-save','--ignore-scripts','--no-audit','--no-fund',...names.map(n=>packs[n])],p);
 install(consumer,['acap-types','acap-contracts','plugin-sdk']);
 cpSync(join(repo,'examples/hermes-consumer/consumer.mjs'),join(consumer,'consumer.mjs'));
 cpSync(join(repo,'catalog/proposals/agent-execution/snapshot.json'),join(consumer,'snapshot.json'));
 run(process.execPath,['--input-type=module','-e',"import {createRequire} from 'node:module';import assert from 'node:assert/strict';const r=createRequire(import.meta.url);assert.throws(()=>r.resolve('@alica/kernel'),e=>e.code==='MODULE_NOT_FOUND');"],consumer);
 install(operator,['acap-types','acap-contracts','plugin-sdk','catalog','kernel']);
 for(const name of ['external-operator.mjs','bridge.mjs','process-runner.mjs'])cpSync(join(repo,'integrations/hermes/adapter',name),join(operator,name));
 const snapshot=JSON.parse(readFileSync(join(consumer,'snapshot.json'),'utf8'));
 const config={consumerURL:pathToFileURL(join(consumer,'consumer.mjs')).href,snapshot,
  python:process.env.PHASE3_PYTHON||'/home/alica-dev/phase3-hermes-test-env/bin/python',
  upstream:process.env.HERMES_PHASE3_SOURCE||'/home/alica-dev/hermes-phase3-upstream',
  entrypoint:resolve(repo,'integrations/hermes/adapter/'+(live?'live_entry.py':'offline_entry.py'))};
 if(live){
  assert.equal(repo,'/home/alica-dev/AlicaV2-phase3');
  assert.equal(config.python,'/home/alica-dev/phase3-hermes-test-env/bin/python');
  assert.equal(config.upstream,'/home/alica-dev/hermes-phase3-upstream');
 }
 writeFileSync(join(operator,'run.mjs'),`import {runExternal} from './external-operator.mjs';const config=${JSON.stringify(config)};console.log(JSON.stringify(await runExternal({...config,mode:process.argv[2]})));`);
 const bytes=readFileSync(join(consumer,'consumer.mjs'));
 const reports=[];
 for(const mode of (live?['hermes-live']:['neutral','hermes-offline'])){
  try{reports.push(JSON.parse(run(process.execPath,['--experimental-vm-modules','run.mjs',mode],operator).trim()))}
  catch(e){console.error(e.stdout?.toString(),e.stderr?.toString());throw new Error('External workflow failed: '+mode)}
  assert.deepEqual(readFileSync(join(consumer,'consumer.mjs')),bytes);
 }
  let qualification;
 if(qualify){
  cpSync(join(repo,'tools/test-external-operator.mjs'),join(operator,'qualify.mjs'));
  writeFileSync(join(operator,'qualification-config.json'),JSON.stringify(config));
  qualification=JSON.parse(run(process.execPath,['--experimental-vm-modules','--experimental-test-module-mocks','qualify.mjs'],operator).trim());
  assert.deepEqual(readFileSync(join(consumer,'consumer.mjs')),bytes);
 }
 const report={schemaVersion:'alica.phase3-external/v1',consumerDigest:'sha256:'+createHash('sha256').update(bytes).digest('hex'),consumerUnchanged:true,consumerHasNoKernel:true,publicPackedArtifacts:true,reports,qualification,liveH12:live};
 if(process.env.PHASE3_EXTERNAL_REPORT)writeFileSync(process.env.PHASE3_EXTERNAL_REPORT,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{
 try{if(temp!==undefined)rmSync(temp,{recursive:true,force:true})}
 finally{if(live){
  const auth='/home/alica-dev/phase3-live-grant/temporary-codex-auth.json';
  rmSync(auth,{force:true});
  assert.throws(()=>lstatSync(auth),e=>e.code==='ENOENT');
 }}
}
