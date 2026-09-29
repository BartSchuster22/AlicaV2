import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {canonical,AcapError,validateEventEnvelope} from '@alica/acap-contracts';
import {RULE,compatible,empty,hash,requireThat,fail,event,signalShape,inputs,observationKey,contentHash,correlation,validateRecords,asExchange,projection} from './contracts.mjs';
const records=s=>({observations:s.observations,incidents:s.incidents,dedupe:s.dedupe,ackRequests:s.ackRequests});
export class Assurance{
 constructor(store,{targets=[],actors=[],now=Date.now,mono=()=>performance.now(),beforeWork=async()=>{}}={}){
  requireThat(targets.length<=16,'RESOURCE_EXHAUSTED');this.store=store;this.targets=structuredClone(targets);this.actors=structuredClone(actors);this.now=now;this.mono=mono;this.beforeWork=beforeWork;
  this.state='STOPPED';this.queue=Promise.resolve();this.pending=0;this.signalPending=0;this.stopAt=Infinity;this.stopPromise=null;this.fresh=new Map();this.subscription=false;this.stats={accepted:0,rejected:0,dropped:0,duplicates:0};this.storeHealthy=true;
 }
 open(){requireThat(this.state==='STOPPED','FAILED_PRECONDITION');this.data=records(this.store.open());this.state='READY';}
 check(ticket){
  if(this.mono()>=ticket.end||this.mono()>=this.stopAt)fail('DEADLINE_EXCEEDED');
  if(ticket.signal?.aborted)fail('CANCELLED');
  requireThat(this.storeHealthy&&!this.store.failed,'UNAVAILABLE');
 }
 run(action,options={},ingestion=false){
  if(this.state!=='READY')return Promise.reject(new AcapError('UNAVAILABLE'));
  if(this.pending>=16||(ingestion&&this.signalPending>=8))return Promise.reject(new AcapError('RESOURCE_EXHAUSTED'));
  const start=this.mono(),remaining=options.deadlineMs===undefined?1000:Math.min(1000,options.deadlineMs-this.now());
  const ticket={start,end:start+remaining,signal:options.signal};
  try{this.check(ticket);}catch(e){return Promise.reject(e);}
  this.pending++;if(ingestion)this.signalPending++;
  const work=this.queue.then(async()=>{
   this.check(ticket);if(ingestion&&this.mono()-start>=250)fail('DEADLINE_EXCEEDED');
   await this.beforeWork();this.check(ticket);
   const result=action(ticket);this.check(ticket);return result;
  }).finally(()=>{this.pending--;if(ingestion)this.signalPending--;});
  this.queue=work.catch(()=>{});return work;
 }
 save(next,ticket){this.check(ticket);validateRecords(asExchange(next));try{this.store.commit(next);}catch(e){if(this.store.failed)this.storeHealthy=false;throw e;}this.data=next;}
 authorize(caller,scope,permission){
  requireThat(caller&&typeof scope==='string','PERMISSION_DENIED');
  const actor=this.actors.find(a=>a.principal===caller.principal&&a.instanceId===caller.instanceId&&a.hostScope===caller.scope&&a.scope===scope&&a.permissions.includes(permission));
  requireThat(actor,'PERMISSION_DENIED');return actor.actor;
 }
 operation(name,input,context){
  requireThat(inputs[name]?.(input),'INVALID_ARGUMENT');
  const actor=this.authorize(context?.caller,input.scope,name==='acknowledge'?'acknowledge':'read');
  return this.run(ticket=>{
   // Local bindings may have been revoked while waiting.
   this.authorize(context.caller,input.scope,name==='acknowledge'?'acknowledge':'read');
   if(name==='list'){
    const all=this.data.incidents.filter(i=>i.scope===input.scope).sort((a,b)=>a.id.localeCompare(b.id)),page=all.slice(input.offset,input.offset+input.limit),nextOffset=Math.min(all.length,input.offset+page.length);
    return {incidents:page.map(projection),nextOffset,done:nextOffset===all.length};
   }
   const current=this.data.incidents.find(i=>i.id===input.id&&i.scope===input.scope);requireThat(current,'NOT_FOUND');
   if(name==='get')return projection(current);
   requireThat(current.compatibility==='COMPATIBLE','FAILED_PRECONDITION');
   const retry=this.data.ackRequests.find(a=>a.actor===actor&&a.scope===input.scope&&a.requestId===input.requestId);
   if(retry){requireThat(retry.incidentId===input.id,'CONFLICT');return projection(current);}
   requireThat(current.status!=='RESOLVED','FAILED_PRECONDITION');
   requireThat(this.data.ackRequests.length<16,'RESOURCE_EXHAUSTED');
   const next=structuredClone(this.data),inc=next.incidents.find(i=>i.id===input.id);
   if(inc.status==='OPEN'){inc.status='ACKNOWLEDGED';inc.acknowledgements.push({actor,requestId:input.requestId,atMs:this.now()});}
   next.ackRequests.push({actor,scope:input.scope,requestId:input.requestId,incidentId:input.id});this.save(next,ticket);return projection(inc);
  },context);
 }
 ingest(envelope,observer){
  const receivedAtMs=this.now();
  const attempt=async()=>{
   requireThat(Buffer.byteLength(canonical(envelope))<=4096,'RESOURCE_EXHAUSTED');
   validateEventEnvelope(canonical(envelope),event);requireThat(signalShape(envelope.data));
   const authorize=()=>requireThat(this.targets.some(t=>t.principal===envelope.sourceProvider&&t.instanceId===envelope.sourceInstanceId&&t.generation===envelope.scopeGeneration&&t.scope===envelope.sourceScope&&t.target===envelope.data.target),'PERMISSION_DENIED');
   authorize();requireThat(typeof observer==='string'&&observer.length>0&&observer.length<=128,'INVALID_ARGUMENT');
   const d=envelope.data;
   requireThat(/^[a-f0-9]{64}$/.test(d.evidence.sha256)&&d.evidence.code===(d.signal==='FAIL'?'CHECK_FAILED':'CHECK_RECOVERED'),'INVALID_ARGUMENT');
   const o={id:hash([envelope.sourceProvider,envelope.sourceScope,d.target,d.observationId]),sourceObservationId:d.observationId,producer:envelope.sourceProvider,observer,target:d.target,scope:envelope.sourceScope,occurredAtMs:d.occurredAtMs,observedAtMs:d.observedAtMs,receivedAtMs,provenance:Object.fromEntries(['sourceProvider','sourceInstanceId','sourceScope','scopeGeneration','eventId','sequence','timeMs'].map(k=>[k,envelope[k]])),signal:d.signal,rule:{...RULE},evidence:structuredClone(d.evidence)};
   return this.run(ticket=>{
    authorize();const key=observationKey(o),digest=contentHash(o),seen=this.data.dedupe.find(x=>x.key===key);
    if(seen){requireThat(seen.contentHash===digest,'CONFLICT');this.stats.duplicates++;return {duplicate:true};}
    requireThat(o.observedAtMs<=o.occurredAtMs&&o.occurredAtMs<=receivedAtMs+5000&&o.observedAtMs>=receivedAtMs-300000&&o.occurredAtMs>=receivedAtMs-300000,'INVALID_ARGUMENT');
    const same=this.data.incidents.filter(i=>i.correlationKey===correlation(o));
    const latest=same.flatMap(i=>[...i.occurrences,...i.resolutions.map(r=>r.observationId)]).map(id=>this.data.observations.find(x=>x.id===id)?.occurredAtMs??-1);
    requireThat(latest.every(t=>o.occurredAtMs>t),'FAILED_PRECONDITION');
    let current=same.find(i=>i.status!=='RESOLVED');
    if(current)requireThat(current.compatibility==='COMPATIBLE'&&o.occurredAtMs-current.windowStartMs<=86400000,'FAILED_PRECONDITION');
    if(!current&&o.signal==='RECOVER')return {ignored:true};
    requireThat(this.data.observations.length<256,'RESOURCE_EXHAUSTED');
    const next=structuredClone(this.data);current=current?next.incidents.find(i=>i.id===current.id):undefined;
    if(!current){requireThat(next.incidents.length<64,'RESOURCE_EXHAUSTED');current={id:randomUUID(),scope:o.scope,target:o.target,classification:'unavailable',status:'OPEN',occurrenceCount:0,firstObservedAtMs:o.occurredAtMs,lastObservedAtMs:o.occurredAtMs,rule:{...RULE},compatibility:'COMPATIBLE',acknowledgements:[],type:'availability',occurrences:[],resolutions:[],correlationKey:correlation(o),windowStartMs:o.occurredAtMs,lastDistinctObservationId:o.id,dedupeKeys:[]};next.incidents.push(current);}
    if(o.signal==='FAIL'){requireThat(current.occurrences.length<32,'RESOURCE_EXHAUSTED');current.occurrences.push(o.id);current.occurrenceCount++;current.lastObservedAtMs=o.occurredAtMs;}
    else{current.status='RESOLVED';current.resolutions.push({observationId:o.id,atMs:o.occurredAtMs,rule:{...RULE}});}
    current.lastDistinctObservationId=o.id;current.dedupeKeys.push(key);next.observations.push(o);next.dedupe.push({key,contentHash:digest,observationId:o.id});
    this.save(next,ticket);this.stats.accepted++;this.fresh.set(canonical([o.scope,o.target]),receivedAtMs);return {incidentId:current.id,duplicate:false};
   },{},true);
  };
  return attempt().catch(e=>{this.stats.rejected++;if(['RESOURCE_EXHAUSTED','DEADLINE_EXCEEDED','UNAVAILABLE'].includes(e.code))this.stats.dropped++;throw e;});
 }
 selfHealth(){const coverage=this.targets.map(t=>({scope:t.scope,target:t.target,lastReceiptMs:this.fresh.get(canonical([t.scope,t.target]))??null}));const fresh=coverage.every(t=>t.lastReceiptMs!==null&&this.now()-t.lastReceiptMs<=300000);return {state:this.state!=='READY'||!this.storeHealthy||this.store.failed?'UNAVAILABLE':this.subscription&&fresh&&!this.stats.dropped?'READY':'DEGRADED',store:this.storeHealthy&&!this.store.failed,eventConsumption:this.subscription,coverage,stats:{...this.stats},pending:this.pending};}
 export(){requireThat(this.state==='READY'&&this.pending===0&&this.storeHealthy&&!this.store.failed,'FAILED_PRECONDITION');return canonical(asExchange(this.data));}
 import(text){requireThat(this.state==='READY'&&this.pending===0&&Object.values(this.data).every(a=>a.length===0),'FAILED_PRECONDITION');requireThat(typeof text==='string'&&Buffer.byteLength(text)<=1048576,'RESOURCE_EXHAUSTED');let data;try{data=JSON.parse(text);}catch{fail('INVALID_ARGUMENT');}validateRecords(data);const next=records(data);this.store.commit(next);this.data=structuredClone(next);}
 close(){
  if(this.stopPromise)return this.stopPromise;
  this.state='STOPPING';this.subscription=false;this.stopAt=this.mono()+2000;
  this.stopPromise=(async()=>{let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new AcapError('DEADLINE_EXCEEDED')),2000);});
   try{await Promise.race([this.queue,timeout]);requireThat(this.mono()<this.stopAt,'DEADLINE_EXCEEDED');this.store.close();this.state='STOPPED';return {cleanup:'complete'};}finally{clearTimeout(timer);}
  })();return this.stopPromise;
 }
}
