// Default is offline PUBLIC HOST qualification. --live is a distinct explicit
// operator action, uses the one already-initialized approved ledger, never retries.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const repo=process.cwd(),temp=mkdtempSync(join(tmpdir(),'alica-phase4-external-'));
function run(command,args,cwd){
  try{return execFileSync(command,args,{cwd,encoding:'utf8',timeout:240000,
    env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_PATH:'',NODE_OPTIONS:''},stdio:['ignore','pipe','pipe']});}
  catch(e){throw new Error('EXTERNAL_STEP_FAILED '+command+' exit='+e.status);}
}
try{
  assert(process.argv.length===2 || (process.argv.length===3&&['--live','--continue-live','--continuation-fixture'].includes(process.argv[2])));
  const mode=process.argv[2]?.slice(2)??'fixture',live=mode==='live',continuation=['continue-live','continuation-fixture'].includes(mode);
  const artifacts=join(temp,'artifacts'),author=join(temp,'consumer'),operator=join(temp,'operator');
  for(const p of [artifacts,author,operator])mkdirSync(p);
  const packs={};
  for(const name of ['acap-types','acap-contracts','plugin-sdk','catalog','kernel','decision-phase4']){
    const source=name==='decision-phase4'?join(repo,'services/decision'):join(repo,'packages',name);
    const [pack]=JSON.parse(run('npm',['pack',source,'--pack-destination',artifacts,'--json','--ignore-scripts'],repo));
    assert(pack.files.every(f=>!/(?:^|\/)(?:keys|node_modules|tests)(?:\/|$)|\.(?:key|pem|env)$/.test(f.path)));
    packs[name]=join(artifacts,pack.filename);
  }
  for(const [p,n] of [[author,'consumer'],[operator,'operator']])writeFileSync(join(p,'package.json'),JSON.stringify({name:'phase4-external-'+n,version:'1.0.0',private:true,type:'module'}));
  const install=(p,names)=>run('npm',['install','--no-save','--ignore-scripts','--no-audit','--no-fund',...names.map(n=>packs[n])],p);
  install(author,['acap-types','acap-contracts','plugin-sdk','catalog']);
  install(operator,['acap-types','acap-contracts','plugin-sdk','catalog','kernel','decision-phase4']);
  const source=readFileSync(join(repo,'examples/decision-consumer/consumer.mjs'),'utf8');
  for(const m of source.matchAll(/from\s+['"]([^'"]+)['"]/g))assert(['@alica/plugin-sdk','@alica/catalog/release'].includes(m[1]));
  cpSync(join(repo,'examples/decision-consumer/consumer.mjs'),join(author,'consumer.mjs'));
  cpSync(join(repo,'catalog/proposals/decision-evaluate/snapshot.json'),join(author,'snapshot.json'));
  run(process.execPath,['--input-type=module','-e',"import{createRequire}from'node:module';import assert from'node:assert/strict';const r=createRequire(import.meta.url);for(const name of ['@alica/kernel','@alica/decision-phase4','@alica/testkit'])assert.throws(()=>r.resolve(name),e=>e.code==='MODULE_NOT_FOUND');"],author);
  for(const name of ['operator.mjs','continuation-operator.mjs','matrix.mjs','fixture-http.mjs'])cpSync(join(repo,'examples/decision-consumer',name),join(operator,name));
  const config={consumerURL:pathToFileURL(join(author,'consumer.mjs')).href,snapshot:JSON.parse(readFileSync(join(author,'snapshot.json'),'utf8')),mode,...(live?{reportFile:join(repo,'docs/phase4/LIVE.json')}:{})};
  const entry=continuation?"import{runContinuation as runExternal}from'./continuation-operator.mjs';":"import{runExternal}from'./operator.mjs';";
  writeFileSync(join(operator,'run.mjs'),entry+"try{console.log(JSON.stringify(await runExternal("+JSON.stringify(config)+")));}catch(e){console.error(JSON.stringify({code:e.code??'UNAVAILABLE'}));process.exitCode=1;}\n");
  const report=JSON.parse(run(process.execPath,['--experimental-vm-modules','run.mjs'],operator));
  assert.equal(report.consumerUnchanged,true);assert.equal(report.authenticatedLiveRequests,mode==='continue-live'?6:live?5:0);
  const result={...report,publicPackedArtifacts:true,separateConsumerAndOperatorInstalls:true};
  if(!['live','continue-live'].includes(mode)&&process.env.PHASE4_EXTERNAL_REPORT)writeFileSync(resolve(process.env.PHASE4_EXTERNAL_REPORT),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{rmSync(temp,{recursive:true,force:true});}
