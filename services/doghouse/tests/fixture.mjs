import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {digest} from '@alica/acap-contracts';
import {Assurance} from '../core.mjs';
import {FileStore} from '../store.mjs';
import {event} from '../contracts.mjs';
export const caller={principal:'org.fixture.reader',instanceId:'reader',scope:'scopeA'};
export const target={principal:'org.fixture.source',instanceId:'source',generation:1,scope:'scopeA',target:'targetA'};
export function fixture(t,options={}){
 const dir=mkdtempSync(join(tmpdir(),'phase52-')),clock={wall:1800000000000,mono:0};
 const store=new FileStore(dir,options.storeOptions),domain=new Assurance(store,{targets:[target],actors:[{...caller,hostScope:caller.scope,scope:'scopeA',actor:'fixture-actor',permissions:['read','acknowledge']}],now:()=>clock.wall,mono:()=>clock.mono,...options});domain.open();
 t.after(async()=>{try{await domain.close();}catch{}rmSync(dir,{recursive:true,force:true});});
 const signal=(id='obs1',kind='FAIL',delta=0)=>({eventId:'ev-'+id,type:event.id,contractDigest:digest(event),sourceProvider:target.principal,sourceScope:target.scope,sourceInstanceId:target.instanceId,scopeGeneration:1,sequence:1,timeMs:clock.wall,data:{observationId:id,target:'targetA',occurredAtMs:clock.wall+delta,observedAtMs:clock.wall+delta,signal:kind,evidence:{code:kind==='FAIL'?'CHECK_FAILED':'CHECK_RECOVERED',sha256:'a'.repeat(64)}}});
 return {dir,clock,store,domain,signal,context:()=>({caller,deadlineMs:clock.wall+1000}),async get(id){return domain.operation('get',{scope:'scopeA',id},this.context());}};
}
export const error=code=>e=>e.code===code;
