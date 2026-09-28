import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonical} from '@alica/acap-contracts';
import {validateDefinition,localReader} from '@alica/catalog';
import {loadCatalog,createSnapshot,consumeSnapshot} from '@alica/catalog/release';
import {validate,semantic,localJSON} from '../tooling/validate.mjs';
import {fileRecords} from '../reference/file-records.mjs';
import {Ajv2020} from 'ajv/dist/2020.js';
const json=url=>JSON.parse(readFileSync(url,'utf8'));
function example(name){const root=new URL('../examples/'+name+'/',import.meta.url);const manifest=json(new URL('service.json',root)),snapshot=json(new URL('snapshot.json',root));return {manifest,options:{snapshot,pin:snapshot.digest,configuration:json(new URL('config.json',root)),readJSON:name=>localJSON(root.pathname,name)}};}
for(const name of ['stateless','stateful'])test('delivered '+name+' manifest has separate semantic/declared/not-executed results',()=>{const {manifest,options}=example(name),result=validate(manifest,options);assert.equal(result.structural.status,'PASS');assert.equal(result.semantic.status,'PASS');assert.equal(result.executed.status,'NOT_TESTED');assert.equal(result.semantic.backup.execution,'NOT_TESTED');assert.equal(result.semantic.migration.execution,'NOT_TESTED');});
test('stateful example schema validates actual persisted reference bytes',async()=>{const dir=mkdtempSync(join(tmpdir(),'phase50-schema-')),r=fileRecords(dir);try{await r.open();await r.put('key','');await r.close();const {manifest,options}=example('stateful'),check=new Ajv2020({strict:true}).compile(options.readJSON(manifest.persistence.schema));assert.equal(check(json(join(dir,'records.json'))),true);}finally{rmSync(dir,{recursive:true,force:true});}});
test('required/optional dependency consistency checked against substantive Catalog fixture context',()=>{
 // In-memory fault fixture only. Never persisted/released as a changed contract.
 const baseline=loadCatalog(new URL('../../catalog',import.meta.url).pathname),root=new URL('../../catalog/proposals/service-records/',import.meta.url),definition=json(new URL('experimental-definition.json',root));
 const echo=baseline.entries[0],read=path=>path==='descriptor.json'?readFileSync(new URL(path,root)):baseline.read(path);
 const policy={...baseline.policy,release:[echo.definition.metadata.id,definition.metadata.id]};
 for(const required of [true,false]){
  const d=structuredClone(definition);d.dependencies=[{capability:echo.definition.metadata.id,version:'^1.0.0',required}];
  const entry=validateDefinition(d,read,policy),snapshot=createSnapshot({release:{version:'0.5.0'},policy,entries:[echo,entry],read});consumeSnapshot(snapshot);
  const {manifest,options}=example('stateful');manifest.catalog={version:'0.5.0',digest:snapshot.digest};options.snapshot=snapshot;options.pin=snapshot.digest;
  assert.throws(()=>semantic(manifest,options),{code:'DEPENDENCY_DECLARATION_MISSING'});
  manifest.capabilities.requires=[{uri:echo.definition.metadata.id,identity:echo.descriptor.id,version:echo.definition.metadata.version,optional:required}];
  assert.throws(()=>semantic(manifest,options),{code:'DEPENDENCY_OPTIONALITY_MISMATCH'});
  manifest.capabilities.requires[0].optional=!required;assert.equal(semantic(manifest,options).status,'PASS');
 }
});
test('supplied existing plugin declaration identity/capability/secret comparison is substantive',()=>{const {manifest,options}=example('stateful'),e=consumeSnapshot(options.snapshot).entries[0];options.plugin={id:manifest.metadata.id,version:manifest.metadata.version,execution:'inproc',secretReferences:[],provides:[{capabilityId:e.descriptor.id,version:e.descriptor.version,descriptorDigest:e.definition.contract.digest}],requires:[],optionalRequires:[]};assert.equal(semantic(manifest,options).status,'PASS');options.plugin.provides[0].descriptorDigest='sha256:'+'0'.repeat(64);assert.throws(()=>semantic(manifest,options),{code:'PLUGIN_PROVIDES_MISMATCH'});});
test('local config references cannot escape by symlink; missing local reference fails',()=>{const root=mkdtempSync(join(tmpdir(),'phase50-reference-'));try{const inside=join(root,'inside');mkdirSync(inside);writeFileSync(join(root,'outside.json'),'{}');symlinkSync(join(root,'outside.json'),join(inside,'escape.json'));assert.throws(()=>localJSON(inside,'missing.json'));assert.throws(()=>localJSON(inside,'escape.json'),{code:'NONLOCAL_REFERENCE'});}finally{rmSync(root,{recursive:true,force:true});}});
