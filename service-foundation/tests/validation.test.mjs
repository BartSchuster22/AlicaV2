import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCatalog,createSnapshot} from '@alica/catalog/release';
import {structural,validate,semantic} from '../tooling/validate.mjs';
const snapshot=createSnapshot(loadCatalog(new URL('../../catalog',import.meta.url).pathname));
const d=snapshot.content.definitions.find(d=>d.metadata.id==='acap://alica.io/example/echo@1');
const base={apiVersion:'alica.io/service/v1',kind:'Service',metadata:{id:'org.phase50.echo',version:'1.0.0'},binding:'public-host-inproc-v1',catalog:{version:snapshot.content.version,digest:snapshot.digest},capabilities:{provides:[{uri:d.metadata.id,identity:d.contract.identity,version:d.metadata.version}],requires:[]},scopes:['application'],permissions:['example.echo'],configuration:{schema:'config.schema.json',version:'1.0.0',reload:'restart'},secrets:[],health:{ownedBy:'service',states:['READY','DEGRADED','UNAVAILABLE']},data:{authoritative:[],derived:[],external:[],rebuildable:[]},persistence:{class:'STATELESS',survivesNormalRestart:false},events:{emits:[],consumes:[]},diagnostics:'sdk-safe-log-v1',backup:{required:false,consistency:'none'},migration:{required:false,compatibility:'no-data'},ui:[]};
const configSchema={type:'object',properties:{label:{type:'string',minLength:1}},required:['label'],additionalProperties:false};
const options=()=>({snapshot,pin:snapshot.digest,readJSON:name=>{assert.equal(name,'config.schema.json');return configSchema;},configuration:{label:'reference'}});
test('three levels are independent; backup/migration execution not tested',()=>{const result=validate(base,options());assert.equal(result.structural.status,'PASS');assert.equal(result.semantic.status,'PASS');assert.equal(result.executed.status,'NOT_TESTED');assert.deepEqual(result.semantic.backup,{declaration:'VALID',execution:'NOT_TESTED'});assert.equal(result.semantic.trustVerified,false);});
for(const [name,mutate] of [
 ['malformed',m=>delete m.metadata],['unsupported binding',m=>m.binding='docker'],['unknown field',m=>m.runtimeEngine={}],['executable UI',m=>m.ui=[{id:'org.ui.test',title:'Test',capability:d.contract.identity,permission:'example.echo',script:'run()'}]],['inline secret',m=>m.secrets=[{ref:'test',value:'not-a-secret-fixture'}]],['path traversal',m=>m.configuration.schema='../config.json']
])test('structural rejects '+name,()=>{const m=structuredClone(base);mutate(m);assert.equal(structural(m).status,'FAIL');assert.equal(validate(m,options()).executed.status,'NOT_TESTED');});
for(const [name,code,mutate] of [
 ['unknown capability','CATALOG_NOT_FOUND',m=>m.capabilities.provides[0].uri='acap://alica.io/example/unknown@1'],
 ['unavailable version','CATALOG_NOT_FOUND',m=>m.capabilities.provides[0].version='1.1.0'],
 ['URI major mismatch','MAJOR_MISMATCH',m=>m.capabilities.provides[0].version='2.0.0'],
 ['wrong identity','IDENTITY_MISMATCH',m=>m.capabilities.provides[0].identity='org.other.echo'],
 ['wrong Catalog context','CATALOG_VERSION_MISMATCH',m=>m.catalog.version='99.0.0'],
 ['missing permission declaration','PERMISSION_DECLARATION_MISSING',m=>m.permissions=[]],
 ['state hidden by stateless','STATELESS_CONTRADICTION',m=>m.data.authoritative=['example.records']],
 ['undeclared UI permission','UI_AUTHORITY_MISMATCH',m=>m.ui=[{id:'org.ui.test',title:'Test',capability:d.contract.identity,permission:'arbitrary.write'}]],
 ['unsupported secret binding','SECRET_BINDING_UNSUPPORTED',m=>m.secrets=['production-key']],
 ['unowned rebuildable data','REBUILDABLE_NOT_DERIVED',m=>m.data.rebuildable=['example.index']]
])test('semantic rejects '+name,()=>{const m=structuredClone(base);mutate(m);assert.equal(structural(m).status,'PASS');assert.throws(()=>semantic(m,options()),{code});});
test('configuration required field actually validated',()=>{const o=options();o.configuration={};assert.throws(()=>semantic(base,o),{code:'CONFIG_INVALID'});});
test('snapshot pin enforced independently from self-reported digest',()=>{const o=options();o.pin='sha256:'+'0'.repeat(64);assert.throws(()=>semantic(base,o),{code:'SNAPSHOT_PIN_MISMATCH'});});
test('remote schema references never fetched',()=>{const o=options();o.readJSON=()=>({$ref:'https://invalid.example/schema'});assert.throws(()=>semantic(base,o),{code:'SCHEMA_REFERENCE_UNSUPPORTED'});});
