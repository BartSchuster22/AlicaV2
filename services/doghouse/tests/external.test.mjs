import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {consumeSnapshot} from '@alica/catalog/release';
import {publicFixture} from './public-fixture.mjs';
test('D18 separate offline-installed public consumer cannot resolve implementation or Kernel',async t=>{
 const root=mkdtempSync(join(tmpdir(),'phase52-author-')),author=join(root,'author'),packs=join(root,'packs');mkdirSync(author);mkdirSync(packs);t.after(()=>rmSync(root,{recursive:true,force:true}));
 const run=(command,args,cwd)=>execFileSync(command,args,{cwd,encoding:'utf8',timeout:60000,env:{PATH:process.env.PATH,HOME:root,npm_config_cache:resolve('.tools/npm-cache'),npm_config_offline:'true',npm_config_registry:'https://registry.npmjs.org'}});
 const tar=[];for(const p of ['packages/acap-types','packages/acap-contracts','packages/plugin-sdk','node_modules/ajv','node_modules/fast-uri','node_modules/fast-deep-equal','node_modules/json-schema-traverse','node_modules/require-from-string']){const [pack]=JSON.parse(run('npm',['pack',resolve(p),'--pack-destination',packs,'--ignore-scripts','--json'],process.cwd()));tar.push(join(packs,pack.filename));}
 writeFileSync(join(author,'package.json'),JSON.stringify({private:true,type:'module'}));
 run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund',...tar],author);
 const source=readFileSync('examples/phase52-consumer/consumer.mjs','utf8');assert.deepEqual([...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m=>m[1]),['@alica/plugin-sdk']);
 cpSync('examples/phase52-consumer/consumer.mjs',join(author,'consumer.mjs'));
 const snapshot=JSON.parse(readFileSync('catalog/proposals/assurance-incidents/snapshot.json'));cpSync('catalog/proposals/assurance-incidents/snapshot.json',join(author,'snapshot.json'));
 run(process.execPath,['--input-type=module','-e',`import {createRequire} from 'node:module';import assert from 'node:assert/strict';const r=createRequire(import.meta.url);for(const p of ['@alica/kernel','@alica/testkit','@alica/doghouse'])assert.throws(()=>r.resolve(p),e=>e.code==='MODULE_NOT_FOUND');`],author);
 const {incidentConsumer}=await import(pathToFileURL(join(author,'consumer.mjs'))),f=await publicFixture(t,join(root,'state')),binding=await f.consumer();
 const client=incidentConsumer(consumeSnapshot(snapshot).entries[0].descriptor);await client.plugin.activate(f.host.context(binding.id));
 await f.emit(f.signal('external'));await f.settled();const page=await client.call('list',{scope:f.scope,offset:0,limit:1});assert.equal(page.incidents.length,1);
 assert.equal((await client.call('get',{scope:f.scope,id:page.incidents[0].id})).status,'OPEN');assert.equal((await client.call('acknowledge',{scope:f.scope,id:page.incidents[0].id,requestId:'external-ack'})).status,'ACKNOWLEDGED');
 await f.service.stop();await f.host.shutdown();
});
