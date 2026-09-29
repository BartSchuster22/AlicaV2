// Design validation only: not service conformance or admission.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Ajv2020} from 'ajv/dist/2020.js';
import {validateDefinition,localReader} from '@alica/catalog';
import {validate,localJSON} from '../../../service-foundation/tooling/validate.mjs';
const root=new URL('../design/',import.meta.url).pathname;
const get=n=>JSON.parse(readFileSync(root+n));
const service=get('service.json'),snapshot=get('development-only-snapshot.json');
const options={snapshot,pin:snapshot.digest,readJSON:n=>localJSON(root,n),configuration:get('config.json')};
test('D8 development-only structural/semantic valid; execution explicitly NOT_TESTED',()=>{
 const r=validate(service,options);assert.equal(r.structural.status,'PASS');assert.equal(r.semantic.status,'PASS');assert.equal(r.semantic.trustVerified,false);assert.equal(r.executed.status,'NOT_TESTED');assert.equal(r.semantic.backup.execution,'NOT_TESTED');assert.equal(r.semantic.migration.execution,'NOT_TESTED');
});
test('D8 wrong pin, missing scope permission and event fail closed',()=>{
 assert.equal(validate(service,{...options,pin:'sha256:'+'0'.repeat(64)}).semantic.code,'SNAPSHOT_PIN_MISMATCH');
 const bad=structuredClone(service);bad.permissions=[];assert.equal(validate(bad,options).semantic.code,'PERMISSION_DECLARATION_MISSING');
 const event=structuredClone(service);event.events.consumes[0].identity='io.alica.missing';assert.equal(validate(event,options).semantic.code,'EVENT_NOT_IN_CONTEXT');
});
test('D7 proposed draft cannot masquerade as actual Catalog release',()=>{
 const d=get('definition.json'),p=get('namespace-policy.json');p.release=[d.metadata.id];
 assert.throws(()=>validateDefinition(d,localReader(root),p),x=>x.code==='UNRELEASED_PROPOSAL');
});
test('D5 schema compiles; credentials and grants are not canonical fields',()=>{
 const shape=new Ajv2020({strict:true}).compile(get('canonical-exchange.schema.json'));
 const empty={schema:'assurance.exchange/v1',observations:[],incidents:[],dedupe:[],ackRequests:[]};
 assert.equal(shape(empty),true);
 assert.equal(shape({...empty,credentials:{token:'not-a-real-secret'}}),false);
 assert.equal(shape({...empty,grants:[]}),false);
});
