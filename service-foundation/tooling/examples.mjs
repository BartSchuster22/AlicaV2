// Deterministic reference documents; no activation, grant, provider or schema resolver.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {loadCatalog,createSnapshot,consumeSnapshot} from '@alica/catalog/release';
const base=new URL('../examples/',import.meta.url);
const frozen=createSnapshot(loadCatalog(new URL('../../catalog',import.meta.url).pathname));
const records=JSON.parse(readFileSync(new URL('../../catalog/proposals/service-records/snapshot.json',import.meta.url)));
for(const [name,snapshot,uri] of [['stateless',frozen,'acap://alica.io/example/echo@1'],['stateful',records,'acap://alica.io/example/records@1']]){
 const context=consumeSnapshot(snapshot),entry=context.entries.find(e=>e.definition.metadata.id===uri),stateful=name==='stateful';
 if(!entry)throw Error('Reference missing from selected context');
 const out=new URL(name+'/',base);mkdirSync(out,{recursive:true});
 const manifest={apiVersion:'alica.io/service/v1',kind:'Service',metadata:{id:'org.phase50.'+name,version:'1.0.0'},binding:'public-host-inproc-v1',catalog:{version:context.version,digest:context.digest},capabilities:{provides:[{uri,identity:entry.descriptor.id,version:entry.definition.metadata.version}],requires:[]},scopes:['application'],permissions:[...entry.definition.permissions],configuration:{schema:'config.schema.json',version:'1.0.0',reload:'restart'},secrets:[],health:{ownedBy:'service',states:['READY','DEGRADED','UNAVAILABLE']},data:{authoritative:stateful?['example.records']:[],derived:[],external:[],rebuildable:[]},persistence:stateful?{class:'STATEFUL',survivesNormalRestart:true,schema:'records.schema.json',version:'1.0.0'}:{class:'STATELESS',survivesNormalRestart:false},events:{emits:[],consumes:[]},diagnostics:'sdk-safe-log-v1',backup:{required:stateful,consistency:stateful?'stopped':'none'},migration:{required:false,compatibility:stateful?'same-schema-only':'no-data'},ui:[]};
 const schema={type:'object',properties:stateful?{directory:{type:'string',minLength:1}}:{},required:stateful?['directory']:[],additionalProperties:false};
 const files={'service.json':manifest,'snapshot.json':snapshot,'config.schema.json':schema,'config.json':stateful?{directory:'/tmp/operator-chosen-records'}:{}};
 if(stateful)files['records.schema.json']={type:'object',properties:{schema:{const:1},records:{type:'array',maxItems:32,items:{type:'object',properties:{key:{type:'string',minLength:1,maxLength:64},value:{type:'string',maxLength:4096}},required:['key','value']}}},required:['schema','records']};
 for(const [file,value] of Object.entries(files))writeFileSync(new URL(file,out),JSON.stringify(value,null,2)+'\n');
 console.log(JSON.stringify({reference:name,catalog:context.digest,trustVerified:context.trustVerified,generated:true,executed:'NOT_TESTED'}));
}
