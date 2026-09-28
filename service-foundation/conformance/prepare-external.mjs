// Packs public artifacts and installs distinct author/operator projects offline.
// Preparation only. The root isolation launcher consumes and deletes this root.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,writeFileSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const root=mkdtempSync('/home/alica-dev/phase50-external-');
const run=(cmd,args,cwd)=>execFileSync(cmd,args,{cwd,encoding:'utf8',timeout:60000,env:{...process.env,NODE_PATH:'',NODE_OPTIONS:'',npm_config_offline:'true'},stdio:['ignore','pipe','pipe']});
try{
 const artifacts=join(root,'artifacts'),author=join(root,'author'),operator=join(root,'operator');for(const d of [artifacts,author,operator])mkdirSync(d);
 const packs=[];
 for(const name of ['acap-types','acap-contracts','plugin-sdk','catalog','kernel','service-foundation']){
  const source=name==='service-foundation'?join(repo,name):join(repo,'packages',name);
  const [p]=JSON.parse(run('npm',['pack',source,'--offline','--ignore-scripts','--json','--pack-destination',artifacts],repo));
  assert(p.files.every(f=>!f.path.startsWith('node_modules/')&&!f.path.startsWith('keys/')));
  packs.push({name,path:join(artifacts,p.filename)});
 }
 writeFileSync(join(author,'package.json'),JSON.stringify({name:'@phase50/external-author',version:'1.0.0',private:true,type:'module',exports:'./provider.mjs',files:['provider.mjs'],dependencies:{'@alica/plugin-sdk':'0.1.0'}}));
 cpSync(join(repo,'service-foundation/examples/external/provider.mjs'),join(author,'provider.mjs'));
 run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--no-save',...packs.filter(p=>p.name!=='kernel').map(p=>p.path)],author);
 run(process.execPath,['--input-type=module','-e',"import {createRequire} from 'node:module';import assert from 'node:assert/strict';const r=createRequire(import.meta.url);assert.throws(()=>r.resolve('@alica/kernel'),{code:'MODULE_NOT_FOUND'});await import('@alica/plugin-sdk');"],author);
 const [p]=JSON.parse(run('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',artifacts],author));
 writeFileSync(join(operator,'package.json'),JSON.stringify({name:'phase50-external-operator',version:'1.0.0',private:true,type:'module'}));
 run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--no-save',...packs.map(p=>p.path),join(artifacts,p.filename)],operator);
 for(const name of ['@alica/kernel','@alica/service-foundation','@phase50/external-author'])assert(realpathSync(join(operator,'node_modules',name)).startsWith(operator+'/'));
 cpSync(join(repo,'service-foundation/examples/external/operator.mjs'),join(operator,'operator.mjs'));
 cpSync(join(repo,'service-foundation/conformance/host-fixture.mjs'),join(operator,'host-fixture.mjs'));
 cpSync(join(repo,'catalog/capabilities/core/echo/descriptor.json'),join(operator,'echo.json'));
 cpSync(join(repo,'catalog/proposals/service-records/snapshot.json'),join(operator,'record-snapshot.json'));
 cpSync(join(repo,'service-foundation/examples/stateless'),join(operator,'stateless'),{recursive:true});
 cpSync(join(repo,'service-foundation/examples/stateful'),join(operator,'stateful'),{recursive:true});
 const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
 const consumer='service-foundation/reference/services.mjs';assert.equal(digest(join(repo,consumer)),digest(join(operator,'node_modules/@alica/service-foundation/reference/services.mjs')));
 writeFileSync(join(root,'preparation.json'),JSON.stringify({publicPackages:true,separateAuthorOperator:true,authorHasNoKernel:true,consumerModuleSHA256:digest(join(repo,consumer)),registryPublishing:false,network:'npm-offline; runtime tested separately',source:'working-tree candidate'},null,2)+'\n');
 console.log(JSON.stringify({root}));
}catch(e){rmSync(root,{recursive:true,force:true});throw e;}
