// Produces the small closed manifest schema; no runtime or resolver.
import {writeFileSync} from 'node:fs';
const str={type:'string',minLength:1,maxLength:256};
const ver={type:'string',pattern:'^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$'};
const id={type:'string',pattern:'^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$',maxLength:128};
const path={type:'string',pattern:'^[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*(?:\\.[A-Za-z0-9_-]+)*\\.json$',maxLength:256};
const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const arr=(items,maxItems=32)=>({type:'array',items,maxItems,uniqueItems:true});
const en=(...values)=>({type:'string',enum:values});
const ref=obj({uri:str,identity:id,version:ver});
const domain=arr(id);
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://alica.io/service/manifest-v1',...obj({
 apiVersion:{const:'alica.io/service/v1'},kind:{const:'Service'},
 metadata:obj({id,version:ver}),binding:{const:'public-host-inproc-v1'},
 catalog:obj({version:ver,digest:{type:'string',pattern:'^sha256:[a-f0-9]{64}$'}}),
 capabilities:obj({provides:arr(ref),requires:arr(obj({...ref.properties,optional:{type:'boolean'}}))}),
 scopes:arr(en('application','session'),2),permissions:arr(str),
 configuration:obj({schema:path,version:ver,reload:{const:'restart'}}),
 secrets:arr({type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'}),
 health:obj({ownedBy:{const:'service'},states:{const:['READY','DEGRADED','UNAVAILABLE']}}),
 data:obj({authoritative:domain,derived:domain,external:domain,rebuildable:domain}),
 persistence:obj({class:en('STATELESS','STATEFUL','DERIVED_STATE_ONLY','EXTERNAL_STATE_AUTHORITY'),survivesNormalRestart:{type:'boolean'},schema:path,version:ver},['class','survivesNormalRestart']),
 events:obj({emits:arr(obj({identity:id,version:ver})),consumes:arr(obj({identity:id,version:ver}))}),
 diagnostics:{const:'sdk-safe-log-v1'},
 backup:obj({required:{type:'boolean'},consistency:en('none','stopped')}),
 migration:obj({required:{type:'boolean'},compatibility:en('no-data','same-schema-only')}),
 ui:arr(obj({id,title:str,capability:id,permission:str}),8)
},['apiVersion','kind','metadata','binding','catalog','capabilities','scopes','permissions','configuration','secrets','health','data','persistence','events','diagnostics','backup','migration'])};
writeFileSync(new URL('../schemas/service-manifest-v1.schema.json',import.meta.url),JSON.stringify(schema,null,2)+'\n');
