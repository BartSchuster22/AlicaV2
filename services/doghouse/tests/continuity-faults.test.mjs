import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {rmdirSync,cpSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Assurance} from '../core.mjs';
import {FileStore} from '../store.mjs';
import {fixture,error,target} from './fixture.mjs';
for(const point of ['beforeRename','afterRename'])test('D17 isolated child self-exit '+point+' preserves coherent generation',async t=>{
 const f=fixture(t);await f.domain.ingest(f.signal('old'),'observer');await f.domain.close();
 const code=`import {Assurance} from ${JSON.stringify(new URL('../core.mjs',import.meta.url).href)};import {FileStore} from ${JSON.stringify(new URL('../store.mjs',import.meta.url).href)};const s=new FileStore(${JSON.stringify(f.dir)},{checkpoint:p=>{if(p===${JSON.stringify(point)})process.exit(71);}});const d=new Assurance(s,{targets:[${JSON.stringify(target)}],now:()=>${f.clock.wall}});d.open();await d.ingest(${JSON.stringify(f.signal('new','FAIL',1))},'observer');process.exit(99);`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:10000});assert.equal(child.status,71,child.stderr);
 assert.throws(()=>new FileStore(f.dir).open(),error('UNAVAILABLE'));
 // Exact child exited above. Explicit OFFLINE fixture ownership clearance, not
 // automatic stale-owner guessing and never an operational recovery action.
 rmdirSync(join(f.dir,'.writer'));
 const d=new Assurance(new FileStore(f.dir));d.open();assert.equal(d.data.incidents[0].occurrenceCount,point==='beforeRename'?1:2);assert.equal(d.data.observations.length,d.data.incidents[0].occurrenceCount);await d.close();
});
test('D13 required stopped backup restores independently; exchange is not backup',async t=>{
 const f=fixture(t);await f.domain.ingest(f.signal(),'observer');const expected=f.domain.export();await f.domain.close();
 const fresh=mkdtempSync(join(tmpdir(),'phase52-backup-'));t.after(()=>rmSync(fresh,{recursive:true,force:true}));cpSync(join(f.dir,'assurance.json'),join(fresh,'assurance.json'));
 const restored=new Assurance(new FileStore(fresh));restored.open();assert.equal(restored.export(),expected);assert.equal(restored.targets.length,0);assert.equal(restored.actors.length,0);await restored.close();
});
test('F1 responsive shutdown drains and refuses new admission; bounded incomplete cleanup retains ownership',async t=>{
 let unblock;const block=new Promise(r=>unblock=r),f=fixture(t,{beforeWork:()=>block});
 const work=f.domain.ingest(f.signal(),'observer').catch(e=>e);await new Promise(r=>setImmediate(r));
 const start=performance.now(),stop=f.domain.close();assert.equal(f.domain.close(),stop);assert.equal(f.domain.state,'STOPPING');await assert.rejects(f.domain.ingest(f.signal('new'),'observer'),error('UNAVAILABLE'));
 await assert.rejects(stop,error('DEADLINE_EXCEEDED'));const elapsed=performance.now()-start;assert(elapsed>=1900&&elapsed<5000,'responsive timeout measured '+elapsed);
 assert.equal(f.store.opened,true);assert.throws(()=>new FileStore(f.dir).open(),error('UNAVAILABLE'));
 f.clock.mono=2001;unblock();assert.equal((await work).code,'DEADLINE_EXCEEDED');assert.equal(f.domain.data.observations.length,0);f.store.close();
});
test('F1 cancellation before commit and during native commit does not fake rollback',async t=>{
 const f=fixture(t),r=await f.domain.ingest(f.signal(),'observer');const abort=new AbortController();
 f.store.checkpoint=p=>{if(p==='afterRename')abort.abort();};
 await assert.rejects(f.domain.operation('acknowledge',{scope:'scopeA',id:r.incidentId,requestId:'cancelled-result'},{...f.context(),signal:abort.signal}),error('CANCELLED'));
 f.store.checkpoint=()=>{};const retry=await f.domain.operation('acknowledge',{scope:'scopeA',id:r.incidentId,requestId:'cancelled-result'},f.context());assert.equal(retry.status,'ACKNOWLEDGED');assert.equal(f.domain.data.ackRequests.length,1);
});
