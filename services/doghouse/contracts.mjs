// Approved public/canonical contracts; no operational Doghouse imports.
import {Ajv2020} from 'ajv/dist/2020.js';
import {createHash} from 'node:crypto';
import {canonical,AcapError} from '@alica/acap-contracts';
import descriptor from '../../docs/phase5.2/design/descriptor.json' with {type:'json'};
import event from '../../docs/phase5.2/design/signal.json' with {type:'json'};
import exchange from '../../docs/phase5.2/design/canonical-exchange.schema.json' with {type:'json'};
import storage from '../../docs/phase5.2/design/store.schema.json' with {type:'json'};
export {descriptor,event};
export const fail=(code)=>{throw new AcapError(code);};
export const requireThat=(condition,code='INVALID_ARGUMENT')=>{if(!condition)fail(code);};
export const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
export const RULE=Object.freeze({id:'availability-v1',version:'1.0.0'});
export const compatible=r=>r.id===RULE.id&&r.version===RULE.version;
export const empty=()=>({observations:[],incidents:[],dedupe:[],ackRequests:[]});
const ajv=new Ajv2020({strict:true,allErrors:false});
const shape=ajv.compile(exchange),storeShape=ajv.compile(storage);
export const signalShape=ajv.compile(event.payload);
export const inputs=Object.fromEntries(descriptor.operations.map(o=>[o.name,ajv.compile(o.input)]));
export const observationKey=o=>canonical([o.producer,o.scope,o.target,o.sourceObservationId]);
export const contentHash=o=>hash({observationId:o.sourceObservationId,target:o.target,occurredAtMs:o.occurredAtMs,observedAtMs:o.observedAtMs,signal:o.signal,evidence:o.evidence});
export const correlation=o=>canonical([o.scope,o.target,o.rule.id,o.rule.version]);
export function validateRecords(data,{store=false}={}){
 requireThat((store?storeShape:shape)(data),'FAILED_PRECONDITION');
 requireThat(Buffer.byteLength(canonical(data))<=1048576,'RESOURCE_EXHAUSTED');
 const obs=new Map(),incs=new Map(),keys=new Map();
 for(const o of data.observations){
  requireThat(!obs.has(o.id)&&o.id===hash([o.producer,o.scope,o.target,o.sourceObservationId]),'FAILED_PRECONDITION');
  requireThat(o.producer===o.provenance.sourceProvider&&o.scope===o.provenance.sourceScope,'FAILED_PRECONDITION');
  requireThat(o.observedAtMs<=o.occurredAtMs&&o.occurredAtMs<=o.receivedAtMs+5000,'FAILED_PRECONDITION');
  requireThat(/^[a-f0-9]{64}$/.test(o.evidence.sha256),'FAILED_PRECONDITION');
  requireThat(!compatible(o.rule)||(o.evidence.code===(o.signal==='FAIL'?'CHECK_FAILED':'CHECK_RECOVERED')),'FAILED_PRECONDITION');
  obs.set(o.id,o);
 }
 for(const d of data.dedupe){const o=obs.get(d.observationId);requireThat(o&&!keys.has(d.key)&&d.key===observationKey(o)&&d.contentHash===contentHash(o),'FAILED_PRECONDITION');keys.set(d.key,d);}
 requireThat(keys.size===obs.size,'FAILED_PRECONDITION');
 const referenced=new Set(),active=new Set();let acknowledgements=0;
 for(const i of data.incidents){
  requireThat(!incs.has(i.id)&&i.occurrenceCount===i.occurrences.length&&i.occurrences.length>0,'FAILED_PRECONDITION');incs.set(i.id,i);
  requireThat(i.correlationKey===correlation(i)&&new Set(i.occurrences).size===i.occurrences.length,'FAILED_PRECONDITION');
  requireThat(i.compatibility===(compatible(i.rule)?'COMPATIBLE':'HISTORICAL_ONLY'),'FAILED_PRECONDITION');
  requireThat(!compatible(i.rule)||i.classification==='unavailable','FAILED_PRECONDITION');
  let previous=-1;
  const checkObservation=(id,signal)=>{const o=obs.get(id);requireThat(o&&!referenced.has(id)&&o.signal===signal&&correlation(o)===i.correlationKey&&o.occurredAtMs>previous,'FAILED_PRECONDITION');previous=o.occurredAtMs;referenced.add(id);return o;};
  for(const id of i.occurrences)checkObservation(id,'FAIL');
  const first=obs.get(i.occurrences[0]),last=obs.get(i.occurrences.at(-1));
  requireThat(i.firstObservedAtMs===first.occurredAtMs&&i.windowStartMs===first.occurredAtMs&&i.lastObservedAtMs===last.occurredAtMs,'FAILED_PRECONDITION');
  requireThat(last.occurredAtMs-i.windowStartMs<=86400000,'FAILED_PRECONDITION');
  let lastId=last.id;
  if(i.status==='RESOLVED'){
   requireThat(i.resolutions.length===1,'FAILED_PRECONDITION');const r=i.resolutions[0],o=checkObservation(r.observationId,'RECOVER');lastId=o.id;
   requireThat(r.atMs===o.occurredAtMs&&canonical(r.rule)===canonical(i.rule)&&o.occurredAtMs-i.windowStartMs<=86400000,'FAILED_PRECONDITION');
  }else{requireThat(i.resolutions.length===0&&!active.has(i.correlationKey),'FAILED_PRECONDITION');active.add(i.correlationKey);}
  requireThat(i.lastDistinctObservationId===lastId,'FAILED_PRECONDITION');
  const expected=[...i.occurrences,...i.resolutions.map(r=>r.observationId)].map(id=>observationKey(obs.get(id))).sort();
  requireThat(canonical([...i.dedupeKeys].sort())===canonical(expected),'FAILED_PRECONDITION');
  requireThat(i.status!=='ACKNOWLEDGED'||i.acknowledgements.length===1,'FAILED_PRECONDITION');
  requireThat(i.status!=='OPEN'||i.acknowledgements.length===0,'FAILED_PRECONDITION');
  acknowledgements+=i.acknowledgements.length;
 }
 requireThat(referenced.size===obs.size&&acknowledgements<=16,'FAILED_PRECONDITION');
 const requests=new Set();for(const a of data.ackRequests){const i=incs.get(a.incidentId),k=canonical([a.actor,a.scope,a.requestId]);requireThat(i&&i.scope===a.scope&&!requests.has(k)&&i.acknowledgements.length===1,'FAILED_PRECONDITION');requests.add(k);}
 for(const i of data.incidents)for(const a of i.acknowledgements)requireThat(data.ackRequests.some(r=>r.actor===a.actor&&r.scope===i.scope&&r.requestId===a.requestId&&r.incidentId===i.id),'FAILED_PRECONDITION');
 return data;
}
export function asExchange(records){const result={schema:'assurance.exchange/v1',...structuredClone(records)};delete result.generation;return validateRecords(result);}
export const projection=i=>Object.fromEntries(Object.keys(descriptor.operations[0].output.properties).map(k=>[k,structuredClone(i[k])]));
