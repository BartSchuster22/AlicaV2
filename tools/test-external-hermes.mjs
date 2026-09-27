// Reuses original external SDK workflow: packed public artifacts, isolated
// consumer with no Kernel installed, separate operator. Offline, NOT H12.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const repo=process.cwd(),temp=mkdtempSync(join(tmpdir(),'alica-phase3-external-'));
const run=(cmd,args,cwd)=>execFileSync(cmd,args,{cwd,encoding:'utf8',timeout:180000,env:{...process.env,NODE_PATH:'',NODE_OPTIONS:''},stdio:['ignore','pipe','pipe']});
try{
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
  entrypoint:resolve(repo,'integrations/hermes/adapter/offline_entry.py')};
 writeFileSync(join(operator,'run.mjs'),`import {runExternal} from './external-operator.mjs';const config=${JSON.stringify(config)};console.log(JSON.stringify(await runExternal({...config,mode:process.argv[2]})));`);
 const bytes=readFileSync(join(consumer,'consumer.mjs'));
 const reports=[];
 for(const mode of ['neutral','hermes-offline']){
  try{reports.push(JSON.parse(run(process.execPath,['--experimental-vm-modules','run.mjs',mode],operator).trim()))}
  catch(e){console.error(e.stdout?.toString(),e.stderr?.toString());throw new Error('External workflow failed: '+mode)}
  assert.deepEqual(readFileSync(join(consumer,'consumer.mjs')),bytes);
 }
 const report={schemaVersion:'alica.phase3-external/v1',consumerDigest:'sha256:'+createHash('sha256').update(bytes).digest('hex'),consumerUnchanged:true,consumerHasNoKernel:true,publicPackedArtifacts:true,reports,liveH12:false};
 if(process.env.PHASE3_EXTERNAL_REPORT)writeFileSync(process.env.PHASE3_EXTERNAL_REPORT,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{rmSync(temp,{recursive:true,force:true})}
