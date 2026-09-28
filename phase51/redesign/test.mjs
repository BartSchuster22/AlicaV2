// Additive design diagnostic, not Catalog admission or full M11/M12 qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,writeFileSync,chmodSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {hostFixture} from '../../service-foundation/conformance/host-fixture.mjs';
import {memoryProvider} from './provider.mjs';
const d=JSON.parse(readFileSync(new URL('../../catalog/proposals/memory-candidates-v2/descriptor.json',import.meta.url)));
const req={capabilityId:d.id,major:2,minMinor:0,operations:['create','get','search'],features:[]};
const python=resolve('.tools/memory-python/bin/python');
const input={requestKey:'durable-request-001',scope:'tenant:offline/project:a',title:'fixture',content:'lexical durable candidate',sourceRefs:['urn:offline:source'],provenance:{source:'offline fixture'}};
const plain=v=>JSON.parse(JSON.stringify(v));
function inspect(db,age=false){return JSON.parse(execFileSync(python,['-I','-c',`import sqlite3,json,sys\nc=sqlite3.connect(sys.argv[1])\nif sys.argv[2]=='age':\n c.execute("UPDATE idempotency_requests SET created_at=strftime('%Y-%m-%dT%H:%M:%SZ','now','-25 hours')")\n c.commit()\nprint(json.dumps({'records':c.execute('SELECT COUNT(*) FROM records').fetchone()[0],'replays':c.execute('SELECT COUNT(*) FROM idempotency_requests').fetchone()[0],'ids':[r[0] for r in c.execute('SELECT id FROM records ORDER BY id')],'creates':c.execute("SELECT COUNT(*) FROM audit_events WHERE action='record.create'").fetchone()[0],'oldRows':c.execute("SELECT COUNT(*) FROM idempotency_requests WHERE julianday('now')-julianday(created_at)>=25.0/24.0").fetchone()[0]}))`,db,age?'age':'inspect'],{env:{PATH:'/usr/bin:/bin'},encoding:'utf8'}));}
async function setup(db,{runtime=python,shift=false}={}){
 const f=hostFixture({cleanupMs:1500,activationMs:1500}),identities=new Map();let resolutions=0;
 if(shift)f.discover();
 const service=memoryProvider(d,c=>{resolutions++;return identities.get(JSON.stringify([c.principal,c.instanceId,c.scope]));},{python:runtime,databasePath:db});
 const source="import {AcapError} from '@alica/acap-contracts';let release;export function activate(c){release=c.provide("+JSON.stringify(d)+",{get:async()=>{await release();throw new AcapError('UNAVAILABLE');},create:async()=>{},search:async()=>{}});}";
 const id=f.discover({descriptor:d,source});await f.host.activate(id);
 const grants=[],grantExpires=Date.now()+60000;
 async function caller(scope){const cid=f.discover({requires:[req],scope});for(const override of scope==='root'?[{}]:[{scope:'root',scopeGeneration:1},{}]){const grantId=randomUUID();f.host.issueGrant({schemaVersion:'acap.grant/v1',grantId,...f.host.identity(cid),...override,capabilityId:d.id,operations:req.operations,issuedAtMs:Date.now()-1,expiresAtMs:grantExpires,revision:0});grants.push(grantId);}await f.host.activate(cid);return {id:cid,handle:await f.host.context(cid).require(req)};}
 const probe=await caller('root');await assert.rejects(probe.handle.call('get',{scope:input.scope,id:'bootstrap'},{deadlineMs:Date.now()+2000}),{code:'UNAVAILABLE'});await f.host.dispose(probe.id);
 const context=f.host.context(id).createScope();await service.plugin.activate(context);
 const c=await caller(context.scope),principal=f.host.context(c.id).principal;
 const identity=JSON.stringify([principal,c.id,context.scope]);
 const trusted={actor:'worker:fixture',scope_path:'tenant:offline',permissions:['memory.create-working','memory.read','memory.search']};identities.set(identity,trusted);
 return {f,c,service,identities,identity,trusted,grants,resolutions:()=>resolutions,
 call:(op,data,opts={})=>c.handle.call(op,data,{deadlineMs:Date.now()+5000,...opts}),
 async close(){const report=await f.close();assert.equal(report.resources.pendingCalls,0);assert.equal(report.resources.registrations,0);assert.equal(service.active(),0);for(const i of report.instances){assert.equal(i.cleanup.timedOutResources,0);assert.deepEqual([...i.cleanup.failedDisposers],[]);}}};
}
test('v2 public Host create/get/search; durable actor/request replay across complete Host restart',{timeout:30000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'memory51-redesign-')),db=join(dir,'memory.sqlite3');let s=await setup(db),first,caller=s.c.id;
 try{first=await s.call('create',input);assert.equal(first.author,'worker:fixture');assert.equal(first.role,'active');assert.equal(first.lifecycle,'working');assert.deepEqual(plain(await s.call('create',input)),plain(first));assert.equal((await s.call('get',{scope:input.scope,id:first.id})).id,first.id);assert.equal((await s.call('search',{scope:input.scope,query:'lexical',limit:25,cursor:''})).candidates[0].id,first.id);assert.equal(inspect(db).creates,1);}finally{await s.close();}
 s=await setup(db,{shift:true});try{assert.notEqual(s.c.id,caller);assert.deepEqual(plain(await s.call('create',input)),plain(first));assert.equal((await s.call('get',{scope:input.scope,id:first.id})).id,first.id);assert.equal(inspect(db).records,1);}finally{await s.close();rmSync(dir,{recursive:true});}
});
test('every replay reauthorizes domain mapping, permissions, scope and frozen Host grants',{timeout:30000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'memory51-redesign-')),db=join(dir,'memory.sqlite3'),s=await setup(db);
 try{const first=await s.call('create',input);s.identities.delete(s.identity);await assert.rejects(s.call('create',input),{code:'PERMISSION_DENIED'});
 s.identities.set(s.identity,{...s.trusted,permissions:['memory.read','memory.search']});await assert.rejects(s.call('create',input),{code:'PERMISSION_DENIED'});
 s.identities.set(s.identity,{...s.trusted,scope_path:'tenant:other'});await assert.rejects(s.call('create',input),{code:'PERMISSION_DENIED'});
 s.identities.set(s.identity,s.trusted);assert.deepEqual(plain(await s.call('create',input)),plain(first)); // prior errors NOT cached
 const calls=s.resolutions();s.f.host.revokeGrant(s.grants.at(-1));await assert.rejects(s.call('create',input),{code:'PERMISSION_DENIED'});assert.equal(s.resolutions(),calls);assert.equal(inspect(db).creates,1);
 }finally{await s.close();rmSync(dir,{recursive:true});}
});
test('request conflicts, actor isolation, malformed/forged authority, old wire rejected',{timeout:30000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'memory51-redesign-')),db=join(dir,'memory.sqlite3'),s=await setup(db);
 try{const first=await s.call('create',input);for(const change of [{content:'changed'},{scope:'tenant:offline/project:b'},{provenance:{source:'changed'}}])await assert.rejects(s.call('create',{...input,...change}),{code:'CONFLICT'});
 for(const forged of [{actor:'admin'},{permissions:['memory.admin']},{role:'canonical'},{caller:{principal:'admin'}}])await assert.rejects(s.call('create',{...input,...forged}),{code:'INVALID_ARGUMENT'});
 const {requestKey,...old}=input;await assert.rejects(s.call('create',old),{code:'INVALID_ARGUMENT'});await assert.rejects(s.call('create',input,{idempotencyKey:requestKey}),{code:'INVALID_ARGUMENT'});
 for(const key of ['', '       x', 'x'.repeat(129)])await assert.rejects(s.call('create',{...input,requestKey:key}),{code:'INVALID_ARGUMENT'});
 s.identities.set(s.identity,{...s.trusted,actor:'worker:other'});const other=await s.call('create',input);assert.notEqual(other.id,first.id);assert.equal(other.author,'worker:other');assert.equal(inspect(db).records,2);
 }finally{await s.close();rmSync(dir,{recursive:true});}
});
test('ambiguous committed child loss; explicit retry succeeds in SAME Host without cached transport error',{timeout:30000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'memory51-redesign-')),db=join(dir,'memory.sqlite3'),wrapper=join(dir,'lose-once'),flag=join(dir,'lost');
 writeFileSync(wrapper,`#!/usr/bin/python3\nimport subprocess,sys,os\np=subprocess.run([${JSON.stringify(python)},*sys.argv[1:]],input=sys.stdin.buffer.read(),stdout=subprocess.PIPE)\nif not os.path.exists(${JSON.stringify(flag)}):\n open(${JSON.stringify(flag)},'w').write('response withheld')\n os._exit(17)\nsys.stdout.buffer.write(p.stdout)\nsys.exit(p.returncode)\n`);chmodSync(wrapper,0o700);
 const s=await setup(db,{runtime:wrapper});try{await assert.rejects(s.call('create',input),{code:'UNAVAILABLE'});const before=inspect(db);assert.equal(before.records,1);assert.equal(before.replays,1);const result=await s.call('create',input);assert.equal(result.id,before.ids[0]);assert.equal(inspect(db).creates,1);}finally{await s.close();rmSync(dir,{recursive:true});}
});
test('at least24h retention: explicit25h-aged ledger fixture replays after full restart (not wall-clock soak)',{timeout:30000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'memory51-redesign-')),db=join(dir,'memory.sqlite3');let s=await setup(db),first;
 try{first=await s.call('create',input);}finally{await s.close();}
 assert.equal(inspect(db,true).oldRows,1);
 s=await setup(db,{shift:true});try{assert.deepEqual(plain(await s.call('create',input)),plain(first));assert.equal(inspect(db).creates,1);}finally{await s.close();rmSync(dir,{recursive:true});}
});
