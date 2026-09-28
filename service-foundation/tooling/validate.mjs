import {readFileSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {Ajv2020} from 'ajv/dist/2020.js';
import {consumeSnapshot} from '@alica/catalog/release';
import {identity} from '@alica/catalog';
import {version,canonical} from '@alica/acap-contracts';
const schema=JSON.parse(readFileSync(new URL('../schemas/service-manifest-v1.schema.json',import.meta.url)));
const ajv=new Ajv2020({strict:true,allErrors:true});
const shape=ajv.compile(schema);
export class ServiceValidationError extends Error {constructor(code){super(code);this.code=code;}}
const requireTruth=(condition,code)=>{if(!condition)throw new ServiceValidationError(code);};
export function structural(value){return shape(value)?{level:'STRUCTURAL',status:'PASS'}:{level:'STRUCTURAL',status:'FAIL',errors:structuredClone(shape.errors)};}
export function localJSON(root,name){
 requireTruth(typeof name==='string'&&/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*(?:\.[A-Za-z0-9_-]+)*\.json$/.test(name),'NONLOCAL_REFERENCE');
 const base=realpathSync(root),file=realpathSync(resolve(base,name)),rel=relative(base,file);
 requireTruth(rel&&!rel.startsWith('..')&&!isAbsolute(rel),'NONLOCAL_REFERENCE');
 return JSON.parse(readFileSync(file,'utf8'));
}
function checkSchema(s){
 // The bounded JSON-Schema subset is self-contained: never fetch/resolve remote refs.
 const visit=x=>{if(x&&typeof x==='object'){for(const [k,v] of Object.entries(x)){requireTruth(!['$ref','$dynamicRef','$recursiveRef'].includes(k),'SCHEMA_REFERENCE_UNSUPPORTED');visit(v);}}};
 visit(s);return new Ajv2020({strict:true,allErrors:true}).compile(s);
}
export function semantic(value,{snapshot,pin,readJSON,configuration,plugin}){
 requireTruth(structural(value).status==='PASS','STRUCTURAL_INVALID');
 const context=consumeSnapshot(snapshot);
 requireTruth(typeof pin==='string'&&pin===context.digest&&value.catalog.digest===pin,'SNAPSHOT_PIN_MISMATCH');
 requireTruth(value.catalog.version===context.version,'CATALOG_VERSION_MISMATCH');
 const select=b=>{
  const parsed=identity(b.uri),v=version(b.version);
  requireTruth(parsed.major===v[0],'MAJOR_MISMATCH');
  const e=context.entries.find(e=>e.definition.metadata.id===b.uri&&e.definition.metadata.version===b.version);
  requireTruth(e,'CATALOG_NOT_FOUND');requireTruth(e.descriptor.id===b.identity,'IDENTITY_MISMATCH');return e;
 };
 const provided=value.capabilities.provides.map(select),required=value.capabilities.requires.map(select);
 for(const list of [value.capabilities.provides,value.capabilities.requires]) requireTruth(new Set(list.map(x=>x.uri)).size===list.length,'DUPLICATE_CAPABILITY');
 requireTruth(provided.length>0,'MISSING_PROVIDER');
 for(const e of provided){
  requireTruth(value.scopes.length>0&&value.scopes.every(s=>e.definition.scopes.includes(s)),'SCOPE_MISMATCH');
  requireTruth(e.definition.permissions.every(p=>value.permissions.includes(p)),'PERMISSION_DECLARATION_MISSING');
  for(const dep of e.definition.dependencies){
   const declared=value.capabilities.requires.find(r=>r.uri===dep.capability);
   requireTruth(declared,'DEPENDENCY_DECLARATION_MISSING');
   requireTruth(declared.optional===!dep.required,'DEPENDENCY_OPTIONALITY_MISMATCH');
   const minimum=version(dep.version.slice(1)),actual=version(declared.version);
   requireTruth(actual[0]===minimum[0]&&(actual[1]>minimum[1]||(actual[1]===minimum[1]&&actual[2]>=minimum[2])),'DEPENDENCY_VERSION_MISMATCH');
  }
 }
 const domains=[...value.data.authoritative,...value.data.derived,...value.data.external];
 requireTruth(new Set(domains).size===domains.length,'DATA_AUTHORITY_OVERLAP');
 requireTruth(value.data.rebuildable.every(d=>value.data.derived.includes(d)),'REBUILDABLE_NOT_DERIVED');
 const p=value.persistence;
 if(p.class==='STATELESS')requireTruth(domains.length===0&&!p.survivesNormalRestart&&!p.schema&&!p.version&&!value.backup.required&&value.backup.consistency==='none'&&!value.migration.required&&value.migration.compatibility==='no-data','STATELESS_CONTRADICTION');
 if(p.class==='STATEFUL')requireTruth(value.data.authoritative.length>0&&p.survivesNormalRestart&&p.schema&&p.version&&value.backup.required&&value.backup.consistency==='stopped'&&value.migration.compatibility==='same-schema-only','STATEFUL_CONTRADICTION');
 if(p.class==='DERIVED_STATE_ONLY')requireTruth(value.data.derived.length>0&&!value.data.authoritative.length&&!value.data.external.length&&value.data.rebuildable.length===value.data.derived.length&&!value.backup.required,'DERIVED_CONTRADICTION');
 if(p.class==='EXTERNAL_STATE_AUTHORITY')requireTruth(value.data.external.length>0&&!value.data.authoritative.length&&!value.backup.required,'EXTERNAL_CONTRADICTION');
 requireTruth(Boolean(p.schema)===Boolean(p.version),'DATA_SCHEMA_VERSION_MISSING');
 if(p.schema)checkSchema(readJSON(p.schema));
 const validateConfig=checkSchema(readJSON(value.configuration.schema));
 requireTruth(validateConfig(configuration),'CONFIG_INVALID');
 // This existing Host profile supports only its documented synthetic test ref.
 // This is an explicit binding restriction, not a new resolver or production secret store.
 requireTruth(value.secrets.every(ref=>ref==='synthetic-test'),'SECRET_BINDING_UNSUPPORTED');
 for(const direction of ['emits','consumes'])for(const event of value.events[direction]){
  requireTruth([...provided,...required].some(e=>e.events.some(d=>d.id===event.identity&&d.version===event.version)),'EVENT_NOT_IN_CONTEXT');
 }
 for(const ui of value.ui??[])requireTruth(value.capabilities.provides.some(p=>p.identity===ui.capability)&&value.permissions.includes(ui.permission),'UI_AUTHORITY_MISMATCH');
 if(plugin){
  requireTruth(plugin.id===value.metadata.id&&plugin.version===value.metadata.version&&plugin.execution==='inproc','PLUGIN_IDENTITY_MISMATCH');
  requireTruth(canonical([...plugin.secretReferences].sort())===canonical([...value.secrets].sort()),'SECRET_DECLARATION_MISMATCH');
  requireTruth(plugin.provides.length===provided.length,'PLUGIN_PROVIDES_MISMATCH');
  for(const e of provided)requireTruth(plugin.provides.some(p=>p.capabilityId===e.descriptor.id&&p.version===e.descriptor.version&&p.descriptorDigest===e.definition.contract.digest),'PLUGIN_PROVIDES_MISMATCH');
  for(const [key,optional] of [['requires',false],['optionalRequires',true]]){
   const declared=value.capabilities.requires.filter(r=>r.optional===optional);
   requireTruth(plugin[key].length===declared.length,'PLUGIN_REQUIRES_MISMATCH');
   for(const r of declared){const e=select(r),v=version(r.version),q=plugin[key].find(x=>x.capabilityId===r.identity);
    requireTruth(q&&q.major===v[0]&&q.minMinor<=v[1]&&(q.maxMinor===undefined||q.maxMinor>=v[1])&&q.operations.every(op=>e.descriptor.operations.some(d=>d.name===op))&&q.features.every(f=>e.descriptor.features.includes(f)),'PLUGIN_REQUIRES_MISMATCH');
   }
  }
 }
 return {level:'SEMANTIC',status:'PASS',context:context.digest,trustVerified:context.trustVerified,backup:{declaration:'VALID',execution:'NOT_TESTED'},migration:{declaration:'VALID',execution:'NOT_TESTED'},authority:'DECLARATION_CONSISTENCY_ONLY'};
}
export function validate(value,options){const first=structural(value);if(first.status!=='PASS')return {structural:first,semantic:{level:'SEMANTIC',status:'NOT_TESTED'},executed:{level:'EXECUTED',status:'NOT_TESTED'}};
 try{return {structural:first,semantic:semantic(value,options),executed:{level:'EXECUTED',status:'NOT_TESTED'}};}catch(error){return {structural:first,semantic:{level:'SEMANTIC',status:'FAIL',code:error.code??'INVALID_REFERENCE_OR_SCHEMA'},executed:{level:'EXECUTED',status:'NOT_TESTED'}};}}
