// Review application and synthetic manifest preflight, never admission or conformance.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {reviewProposal} from '@alica/catalog/governance';
import {validateDefinition,localReader} from '@alica/catalog';
import {createSnapshot} from '@alica/catalog/release';
import {validate} from '../../service-foundation/tooling/validate.mjs';
const root=new URL('../../',import.meta.url),dir=new URL('catalog/proposals/memory-candidates/',root);
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=u=>JSON.parse(readFileSync(u));
const expected={'definition.json':'de5b27492636e172c347e9a5a40831dab8383f0b9d1378e50a907015a563e91c','descriptor.json':'1962770c9bd93091ab644933c91167c43499c6d88e74815ba92daec0b67aaa84','namespace-policy.json':'c6fbaf3ecb04d90a36df795a30673e7ed1a587c72286b0a9bfc54b4d1a161f8b','prepare.mjs':'1140e5efcd8c67ce2e2d5de2c8c4e7235c7b747f4b291aaccf06477d62111e23','proposal.json':'167881a341f9333c228439ac2dc7d507181bed2ea2807beeba4049fc5628ca2b','SEMANTICS.md':'c1683b7dcfceef96aefe4c0fadb00debe6924efa54e59c65a1e468dcafc97fb0'};
for(const [p,h] of Object.entries(expected))assert.equal(sha(readFileSync(new URL(p,dir))),h);
const reviewBytes=readFileSync(new URL('parent.review.json',dir));
assert.equal(sha(reviewBytes),'42b3b03fdaab1ef81e3153d801b0c51fee276dea0e2c0dfc9a68fa74844e3256');
const result=reviewProposal(json(new URL('proposal.json',dir)),JSON.parse(reviewBytes));
assert.equal(result.state,'proposed');
writeFileSync(new URL('review-receipt.json',dir),JSON.stringify({result,reviewSha256:sha(reviewBytes),packetSha256:expected,admitted:false,ownerAcceptance:false},null,2)+'\n');
// Synthetic selected context explicitly distinguished from admitted Catalog state.
// Public snapshot tooling takes validated entries, not transition evidence. NO transition is called.
const definition=structuredClone(json(new URL('definition.json',dir)));
definition.metadata.maturity='experimental';
const policy=structuredClone(json(new URL('namespace-policy.json',dir)));policy.release=[definition.metadata.id];
const read=localReader(dir.pathname),entry=validateDefinition(definition,read,policy);
const snapshot=createSnapshot({release:{version:'0.5.1'},policy,entries:[entry],read});
const manifest={apiVersion:'alica.io/service/v1',kind:'Service',metadata:{id:'org.alica.memoryv4',version:'1.0.0'},binding:'public-host-inproc-v1',catalog:{version:'0.5.1',digest:snapshot.digest},capabilities:{provides:[{uri:definition.metadata.id,identity:entry.descriptor.id,version:'1.0.0'}],requires:[]},scopes:['application','session'],permissions:[...definition.permissions],configuration:{schema:'config.schema.json',version:'1.0.0',reload:'restart'},secrets:[],health:{ownedBy:'service',states:['READY','DEGRADED','UNAVAILABLE']},data:{authoritative:['memory.entities','memory.records','memory.relations','memory.artifacts','memory.findings','memory.audit','memory.retrieval','memory.idempotency'],derived:['memory.fts'],external:['memory.artifact-bytes','memory.operator-authority'],rebuildable:['memory.fts']},persistence:{class:'STATEFUL',survivesNormalRestart:true,schema:'store.schema.json',version:'5.0.0'},events:{emits:[],consumes:[]},diagnostics:'sdk-safe-log-v1',backup:{required:true,consistency:'stopped'},migration:{required:true,compatibility:'same-schema-only'},ui:[]};
const files={'config.schema.json':{type:'object',properties:{directory:{type:'string',minLength:1},python:{type:'string',minLength:1}},required:['directory','python'],additionalProperties:false},'store.schema.json':{type:'object',description:'Logical SQLite provider schema metadata declaration, not canonical exchange or SQLite pages. Schema0001 through0005; actual state/integrity validated by the Store migrations.',properties:{schemaVersion:{type:'integer',const:5}},required:['schemaVersion'],additionalProperties:false}};
const configuration={directory:'/tmp/phase51-isolated-fixture',python:'/usr/bin/python3'};
const validation=validate(manifest,{snapshot,pin:snapshot.digest,configuration,readJSON:p=>files[p]});
assert.equal(validation.structural.status,'PASS');assert.equal(validation.semantic.status,'PASS');assert.equal(validation.executed.status,'NOT_TESTED');
const out=new URL('phase51/preimplementation-fixture/',root);mkdirSync(out,{recursive:true});
const artifactFiles={...files,'config.json':configuration,'service.json':manifest,'fixture-snapshot.json':snapshot};
const hashes={};for(const [name,value] of Object.entries(artifactFiles)){const b=JSON.stringify(value,null,2)+'\n';writeFileSync(new URL(name,out),b);hashes[name]=sha(b);}
const evidence={status:'PREIMPLEMENTATION_FIXTURE_VALIDATION',validation,hashes,fixture:true,admittedContext:false,transitionInvoked:false,implementationEvidence:null,finalM7:'PENDING_REAL_ADMITTED_SNAPSHOT',reviewSha256:sha(reviewBytes),catalogReceipt:'catalog/proposals/memory-candidates/review-receipt.json'};
writeFileSync(new URL('docs/phase5.1/evidence/m7-preflight.json',root),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
