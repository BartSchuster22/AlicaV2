// D5-D8 DESIGN ARTIFACT GENERATOR ONLY. No runtime, review or admission.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {canonical,digest,descriptor as checkDescriptor,validateEventDescriptor} from '@alica/acap-contracts';
import {validateDefinition,localReader} from '@alica/catalog';
import {validateProposal} from '@alica/catalog/governance';
import {createSnapshot,consumeSnapshot} from '@alica/catalog/release';
import {validate,localJSON} from '../../service-foundation/tooling/validate.mjs';
const dir=new URL('./design/',import.meta.url);mkdirSync(dir,{recursive:true});
const write=(name,value)=>writeFileSync(new URL(name,dir),JSON.stringify(value,null,2)+'\n');
const object=p=>({type:'object',properties:p,required:Object.keys(p),additionalProperties:false});
const str=(max=64,min=1)=>({type:'string',minLength:min,maxLength:max});
const integer=(max=Number.MAX_SAFE_INTEGER,min=0)=>({type:'integer',minimum:min,maximum:max});
const enumeration=values=>({type:'string',enum:values});
const array=(items,maxItems)=>({type:'array',maxItems,items});
const literal=value=>({type:typeof value,const:value});
const status=enumeration(['OPEN','ACKNOWLEDGED','RESOLVED']);
const compatibility=enumeration(['COMPATIBLE','HISTORICAL_ONLY']);
const rule=object({id:str(),version:str(32)});
const ack=object({actor:str(128),requestId:str(),atMs:integer()});
const evidence=object({code:enumeration(['CHECK_FAILED','CHECK_RECOVERED','HISTORICAL_CLASSIFICATION']),sha256:str(64,64)});
const incident=object({id:str(),scope:str(128),target:str(),classification:str(),status,occurrenceCount:integer(32,1),firstObservedAtMs:integer(),lastObservedAtMs:integer(),rule,compatibility,acknowledgements:array(ack,1)});
const descriptor={schemaVersion:'acap.capability/v1',id:'io.alica.assurance.incidents',version:'1.0.0',features:[],operations:[
 {name:'get',kind:'unary',idempotency:'none',input:object({scope:str(128),id:str()}),output:incident},
 {name:'list',kind:'unary',idempotency:'none',input:object({scope:str(128),offset:integer(64),limit:integer(16,1)}),output:object({incidents:array(incident,16),nextOffset:integer(64),done:{type:'boolean'}})},
 {name:'acknowledge',kind:'unary',idempotency:'none',input:object({scope:str(128),id:str(),requestId:str()}),output:incident}
]};
const event={schemaVersion:'acap.event-descriptor/v1',id:'io.alica.assurance.signal',version:'1.0.0',payload:object({observationId:str(),target:str(),occurredAtMs:integer(),observedAtMs:integer(),signal:enumeration(['FAIL','RECOVER']),evidence})};
checkDescriptor(canonical(descriptor));validateEventDescriptor(canonical(event));
const uri='acap://alica.io/assurance/incidents@1';
const policy={apiVersion:'catalog.alica.io/namespace-v1',version:'1.0.0',namespaces:[{authority:'alica.io',domain:'assurance',kind:'first-party',owner:'ALICA maintainers'}],release:[]};
const definition={apiVersion:'catalog.alica.io/v1',kind:'CapabilityDefinition',metadata:{id:uri,version:'1.0.0',maturity:'proposed',owner:'ALICA maintainers',summary:'Scoped assurance incident queries and attributable acknowledgement; no remediation authority.'},contract:{descriptor:'descriptor.json',identity:descriptor.id,version:descriptor.version,digest:digest(descriptor)},semantics:{description:'get/list/acknowledge only same-scope incidents under Host grants plus independently mapped local identity. Explicit acknowledge requestId retries are durable actor+scope bound; collisions conflict. Evidence-backed resolution only; no manual resolve or annotations. Signals are best-effort public typed events, broker provenance plus local target authorization required. Historical provenance confers no current authority. See ../DESIGN.md. Draft metadata is not review approval.',cancellation:'supported',errors:['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','CONFLICT','FAILED_PRECONDITION','UNAVAILABLE','RESOURCE_EXHAUSTED','CANCELLED','DEADLINE_EXCEEDED']},scopes:['application','session'],permissions:['assurance.read','assurance.acknowledge'],dependencies:[],events:[{descriptor:'signal.json',identity:event.id,version:event.version,digest:digest(event)}]};
const proposal={apiVersion:'catalog.alica.io/proposal-v1',id:'phase52-assurance-incidents-v1',problem:'An isolated reference source must report a failure through accepted public events; an independent consumer must query and acknowledge its same-scope incident without knowing Doghouse internals.',existingInsufficient:'Echo, neutral records, decision and memory-candidates do not express assurance lifecycle or provenance; frozen contracts cannot be silently repurposed.',abstraction:'One minimal provider-neutral incident get/list/acknowledge capability with one typed signal event. No control, generic health transport, probes, import/export or administrative mutations.',providers:['Native isolated Doghouse assurance domain planned after design freeze','Independent assurance implementation satisfying the same bounded public semantics (candidate, not implemented)'],consumers:['Public SDK isolated incident reader/acknowledger, no Doghouse or store imports'],draft:uri,alternatives:'No broad doghouse family, no arbitrary HTTP probe and no private Kernel shortcut. Canonical exchange is restricted operator workflow, not this capability.',security:'Host supplies current caller and event provenance. Local current mappings separately restrict exact data scope and producer/target; imported provenance never becomes local authority. No executor, credentials or probes. Inproc binding is not hostile-code isolation.',scopes:'Existing application/session labels. Exact local data scope; no cross-scope correlation or implicit ancestry. Permissions are declarations, grants and current local mappings separately enforced.',compatibility:'Additive proposal only; original Catalog and Foundation unchanged. Distinct real review before PROPOSED, actual conformance before EXPERIMENTAL admission. Development fixture experimental metadata is not admission.',genericRationale:'Incidents, observations and acknowledgement are reusable assurance concepts; no Doghouse filesystem or deployment fields enter capability.',proposer:'Hermes Phase5.2 implementation worker'};
validateProposal(proposal);
for(const[n,v]of Object.entries({'descriptor.json':descriptor,'signal.json':event,'definition.json':definition,'namespace-policy.json':policy,'proposal.json':proposal}))write(n,v);
const read=localReader(dir.pathname);validateDefinition(definition,read,policy,{release:false});
// Frozen validator only accepts released maturity in snapshots. THIS IS A FIXTURE,
// not reviewProposal/transition/admission. Never reuse this as D13b evidence.
const dev=structuredClone(definition);dev.metadata.maturity='experimental';
const devPolicy={...policy,release:[uri]};
const entry=validateDefinition(dev,read,devPolicy);
const snapshot=createSnapshot({release:{version:'0.5.2'},policy:devPolicy,entries:[entry],read});
consumeSnapshot(snapshot);write('development-only-snapshot.json',snapshot);
const manifest=JSON.parse(readFileSync(new URL('../../service-foundation/examples/stateful/service.json',import.meta.url)));
manifest.metadata={id:'org.alica.doghouse',version:'1.0.0'};
manifest.catalog={version:'0.5.2',digest:snapshot.digest};
manifest.capabilities={provides:[{uri,identity:descriptor.id,version:'1.0.0'}],requires:[]};
manifest.permissions=definition.permissions;
manifest.data={authoritative:['assurance.records'],derived:[],external:[],rebuildable:[]};
manifest.persistence.schema='store.schema.json';
manifest.events={emits:[],consumes:[{identity:event.id,version:event.version}]};
const configSchema=object({directory:str(1024)});const config={directory:'/tmp/phase52-operator-selected-isolated-store'};
const provenance=object({sourceProvider:str(128),sourceInstanceId:str(128),sourceScope:str(128),scopeGeneration:integer(),eventId:str(128),sequence:integer(),timeMs:integer()});
const observation=object({id:str(),sourceObservationId:str(),producer:str(128),observer:str(128),target:str(),scope:str(128),occurredAtMs:integer(),observedAtMs:integer(),receivedAtMs:integer(),provenance,signal:enumeration(['FAIL','RECOVER']),rule,evidence});
const resolution=object({observationId:str(),atMs:integer(),rule});
const canonicalIncident=object({...incident.properties,type:literal('availability'),occurrences:array(str(),32),resolutions:array(resolution,1),correlationKey:str(512),windowStartMs:integer(),lastDistinctObservationId:str(),dedupeKeys:array(str(512),256)});
const dedupe=object({key:str(512),contentHash:str(64,64),observationId:str()});
const ackRequest=object({actor:str(128),scope:str(128),requestId:str(),incidentId:str()});
const records={observations:array(observation,256),incidents:array(canonicalIncident,64),dedupe:array(dedupe,256),ackRequests:array(ackRequest,16)};
write('canonical-exchange.schema.json',object({schema:literal('assurance.exchange/v1'),...records}));
write('store.schema.json',object({schema:literal('doghouse.store/v1'),generation:integer(),...records}));
write('config.schema.json',configSchema);write('config.json',config);write('service.json',manifest);
const result=validate(manifest,{snapshot,pin:snapshot.digest,readJSON:name=>localJSON(dir.pathname,name),configuration:config});
write('validation.json',{status:'DEVELOPMENT_ONLY_NOT_REVIEWED_NOT_ADMITTED',descriptorDigest:digest(descriptor),eventDigest:digest(event),...result});
console.log(JSON.stringify({status:'DEVELOPMENT_ONLY_NOT_REVIEWED_NOT_ADMITTED',descriptorDigest:digest(descriptor),eventDigest:digest(event),...result}));
if(result.structural.status!=='PASS'||result.semantic.status!=='PASS')process.exitCode=1;
