import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,rmSync} from 'node:fs';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {setup,descriptor,requirement,plain} from './fixture.mjs';import {boardView,eventView,kanbanAdapter} from '../index.mjs';
const input=(key=randomUUID())=>({board:'public',title:'nonlaunching proof',body:'No execution authority',requestKey:key});
const create=async s=>{const i=input(),r=await s.client.call('create',i);assert.equal(r.outcome,'APPLIED');return r.task[0];};
const run=(name,fn)=>test(name,{timeout:30000},async()=>{const s=await setup();try{await fn(s);}finally{await s.close();}});
run('K14 actual supported backend board/get/list/create/update/comment; defaults and sanitized task',async s=>{
 const t=await create(s);assert.equal(t.state,'TRIAGE');assert.equal(t.assigned,false);assert.deepEqual(Object.keys(t).sort(),['assigned','board','body','id','state','title']);
 const u=await s.client.call('update',{board:'public',id:t.id,title:'documentary edit',body:'No launch'});assert.equal(u.requestKey,'');assert.equal(u.task[0].title,'documentary edit');
 const c=await s.client.call('comment',{board:'public',id:t.id,body:'Informational handoff'});assert.deepEqual(c,{outcome:'APPLIED',task:[],requestKey:''});
 assert.equal((await s.client.call('get',{board:'public',id:t.id})).id,t.id);assert.ok((await s.client.call('list',{board:'public'})).tasks.some(x=>x.id===t.id));assert.ok((await s.client.call('board',{board:'public'})).taskCount>=1);
 writeFileSync('/state/restart-proof.json',JSON.stringify({id:t.id,title:'documentary edit'}));
});
run('K15 current mapping, cross-board, forged payload, missing ID and current revocation',async s=>{
 const t=await create(s),call=s.client.call;await assert.rejects(call('get',{board:'other',id:t.id}),{code:'PERMISSION_DENIED'});await assert.rejects(call('get',{board:'other',id:'missing'}),{code:'PERMISSION_DENIED'});
 await assert.rejects(call('get',{board:'public',id:t.id,actor:'admin'}),{code:'INVALID_ARGUMENT'});await assert.rejects(call('get',{board:'public',id:'t_missing'}),{code:'NOT_FOUND'});
 const unmapped=await s.caller({mapped:false});await assert.rejects(unmapped.call('board',{board:'public'}),{code:'PERMISSION_DENIED'});await assert.rejects(s.caller({granted:false}));
 const readOnly=await s.caller({permissions:['kanban.read']});await assert.rejects(readOnly.call('create',input()),{code:'PERMISSION_DENIED'});s.identities.delete(s.client.key);await assert.rejects(call('get',{board:'public',id:t.id}),{code:'PERMISSION_DENIED'});
});
run('K16 best-effort sequential replay, content collision, current authority before replay, no native idempotency promise',async s=>{
 const i=input(),a=await s.client.call('create',i),b=await s.client.call('create',i);assert.equal(a.task[0].id,b.task[0].id);await assert.rejects(s.client.call('create',{...i,title:'collision'}),{code:'CONFLICT'});
 await assert.rejects(s.client.call('create',input(),{idempotencyKey:'not-supported'}),{code:'INVALID_ARGUMENT'});s.identities.delete(s.client.key);await assert.rejects(s.client.call('create',i),{code:'PERMISSION_DENIED'});
});
run('K16 concurrent key calls report actual outcomes, not exactly-once assertion; stale writes last-writer-wins',async s=>{
 const i=input(),results=await Promise.all([s.client.call('create',i),s.client.call('create',i)]);assert.ok(results.every(r=>['APPLIED','UNKNOWN'].includes(r.outcome)));console.log('OBSERVED_CONCURRENT_CREATE_IDS',results.flatMap(r=>r.task.map(t=>t.id)));
 const t=await create(s),base={board:'public',id:t.id,body:'stale update allowed'};await s.client.call('update',{...base,title:'new'});await s.client.call('update',{...base,title:'stale overwrite'});assert.equal((await s.client.call('get',{board:'public',id:t.id})).title,'stale overwrite');await assert.rejects(s.client.call('update',{...base,title:'CAS forbidden',expectedVersion:'1'}),{code:'INVALID_ARGUMENT'});
});
run('K17 real WS event prefix replay, limit1/32, future cursor uncertainty, reconcile and explicit no-control',async s=>{
 const t=await create(s);await s.client.call('comment',{board:'public',id:t.id,body:'event proof'});
 const a=await s.client.call('events',{board:'public',cursor:'0',limit:1}),b=await s.client.call('events',{board:'public',cursor:'0',limit:1});assert.equal(a.events.length,1);assert.deepEqual(a,b);assert.equal(a.cursor,a.events[0].id);assert.equal(a.continuity,'UNKNOWN');
 const next=await s.client.call('events',{board:'public',cursor:a.cursor,limit:32});assert.ok(next.events.every(e=>Number(e.id)>Number(a.cursor)));
 const future=await s.client.call('events',{board:'public',cursor:'9007199254740000',limit:1});assert.equal(future.continuity,'UNKNOWN');assert.deepEqual(future.events,[]);assert.equal((await s.client.call('get',{board:'public',id:t.id})).state,'TRIAGE');
 await assert.rejects(s.client.call('events',{board:'public',cursor:'garbage',limit:1}),{code:'INVALID_ARGUMENT'});await assert.rejects(s.client.call('dispatch',{board:'public'}),{code:'NOT_FOUND'});
});
test('K12 explicit synthetic unit fixtures:257 task rejection and33-event prefix, unselected prefix/malformed/out-of-order',()=>{
 const t={id:'t',title:'test',body:'',status:'triage',assignee:null};assert.throws(()=>boardView({columns:[{tasks:Array.from({length:257},(_,n)=>({...t,id:'t'+n}))}]},'public'),{code:'RESOURCE_EXHAUSTED'});assert.throws(()=>boardView({columns:[{}]},'public'),{code:'UNAVAILABLE'});
 const events=Array.from({length:33},(_,n)=>({id:n+1,task_id:'t',kind:'created',created_at:1})),r=eventView({events,cursor:33},'public','0',32);assert.equal(r.events.length,32);assert.equal(r.cursor,'32');assert.equal(eventView({events:events.slice(32)},'public',r.cursor,1).cursor,'33');
 const prefix=eventView({events:[{...events[0],kind:'diagnostic'},events[1],events[2]]},'public','0',1);assert.equal(prefix.events[0].id,'2');assert.equal(prefix.cursor,'2');assert.throws(()=>eventView({events:[events[1],events[0]]},'public','0',1),{code:'UNAVAILABLE'});
});
run('K19 adapter disposal leaves real backend task; independent adapter restart reconciles',async s=>{
 const t=await create(s);await s.f.host.dispose(s.id);await assert.rejects(s.client.call('get',{board:'public',id:t.id}));const other=await setup();try{assert.equal((await other.client.call('get',{board:'public',id:t.id})).id,t.id);}finally{await other.close();}
});
run('K22 deadline and cancellation stop waiting; safe shape rejects execution knobs',async s=>{
 const ac=new AbortController();ac.abort();await assert.rejects(s.client.call('create',input(),{signal:ac.signal}),{code:'CANCELLED'});await assert.rejects(s.client.call('create',input(),{deadlineMs:Date.now()-1}),{code:'DEADLINE_EXCEEDED'});
 for(const field of ['assignee','status','workspace_path','parents','model_override','provider_override'])await assert.rejects(s.client.call('create',{...input(),[field]:'forbidden'}),{code:'INVALID_ARGUMENT'});
});
test('K13/K15 synthetic-secret binding is real current public Host reference/grant, not injected bypass',async()=>{
 await assert.rejects(setup({secretGrant:false}),{code:'PERMISSION_DENIED'});await assert.rejects(setup({token:null}),{code:'NOT_FOUND'}).catch(e=>{throw e;});
});
test('K6 configuration refuses absent attestation or nonloopback endpoint before transport',()=>{
 assert.throws(()=>kanbanAdapter(descriptor,()=>null,{baseURL:'http://127.0.0.1:19119',isolatedNonlaunching:false}),{code:'FAILED_PRECONDITION'});assert.throws(()=>kanbanAdapter(descriptor,()=>null,{baseURL:'http://example.com:80',isolatedNonlaunching:true}),{code:'FAILED_PRECONDITION'});
});
async function proxy(mode,fn){
 const server=createServer(async(req,res)=>{res.setHeader('Connection','close');try{const chunks=[];for await(const c of req)chunks.push(c);if(mode==='delay'){await new Promise(r=>setTimeout(r,450));res.writeHead(503);res.end();return;}if(mode==='malformed'){res.writeHead(200);res.end('{');return;}if(mode==='oversize'){res.writeHead(200);res.end('x'.repeat(262145));return;}
 const r=await fetch('http://127.0.0.1:19119'+req.url,{method:req.method,headers:{Authorization:req.headers.authorization,'Content-Type':'application/json'},...(chunks.length?{body:Buffer.concat(chunks)}:{})});await r.arrayBuffer();req.socket.destroy();}catch{req.socket.destroy();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn('http://127.0.0.1:'+server.address().port);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test('K16/K22 actual committed mutation then lost response yields UNKNOWN; reconcile through sole authority',async()=>proxy('loss',async baseURL=>{
 const s=await setup({baseURL}),i={...input(),title:'ambiguous-'+randomUUID()};try{assert.deepEqual(await s.client.call('create',i),{outcome:'UNKNOWN',task:[],requestKey:i.requestKey});}finally{await s.close();}const real=await setup();try{const tasks=(await real.client.call('list',{board:'public'})).tasks;assert.ok(tasks.some(t=>t.title===i.title&&t.body.includes(i.body)));}finally{await real.close();}
}));
test('K22 bounded four-call overload, in-flight mapping revocation and disposal',async()=>proxy('delay',async baseURL=>{
 const s=await setup({baseURL});try{const calls=Array.from({length:4},()=>s.client.call('board',{board:'public'}).catch(e=>e.code));await new Promise(r=>setTimeout(r,30));await assert.rejects(s.client.call('board',{board:'public'}),{code:'RESOURCE_EXHAUSTED'});s.identities.delete(s.client.key);await s.f.host.dispose(s.id);await Promise.all(calls);assert.equal(s.service.active(),0);}finally{await s.close();}
}));
for(const mode of ['malformed','oversize'])test('K22 '+mode+' backend response fails explicitly, never empty board',async()=>proxy(mode,async baseURL=>{const s=await setup({baseURL});try{await assert.rejects(s.client.call('board',{board:'public'}),{code:mode==='oversize'?'RESOURCE_EXHAUSTED':'UNAVAILABLE'});}finally{await s.close();}}));
test('K21 separately offline-installed SDK-only consumer without adapter/Kernel/testkit resolution',async()=>{
 const root=mkdtempSync(join(tmpdir(),'phase5k-author-')),author=join(root,'author'),packs=join(root,'packs');mkdirSync(author);mkdirSync(packs);
 const run=(cmd,args,cwd)=>execFileSync(cmd,args,{cwd,encoding:'utf8',timeout:60000,env:{PATH:process.env.PATH,HOME:root,npm_config_cache:'/state/npm-cache',npm_config_offline:'true'}});
 let s;try{const tar=[];for(const p of ['packages/acap-types','packages/acap-contracts','packages/plugin-sdk','node_modules/ajv','node_modules/fast-uri','node_modules/fast-deep-equal','node_modules/json-schema-traverse','node_modules/require-from-string']){const[pack]=JSON.parse(run('npm',['pack',resolve(p),'--pack-destination',packs,'--ignore-scripts','--json'],process.cwd()));tar.push(join(packs,pack.filename));}
 writeFileSync(join(author,'package.json'),JSON.stringify({private:true,type:'module'}));run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund',...tar],author);cpSync('examples/phase5k-consumer/consumer.mjs',join(author,'consumer.mjs'));
 assert.deepEqual([...readFileSync(join(author,'consumer.mjs'),'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m=>m[1]),['@alica/plugin-sdk']);
 run(process.execPath,['--input-type=module','-e',`import{createRequire}from'node:module';import assert from'node:assert/strict';const r=createRequire(import.meta.url);for(const p of ['@alica/kernel','@alica/testkit','@alica/hermes-kanban'])assert.throws(()=>r.resolve(p),e=>e.code==='MODULE_NOT_FOUND');`],author);
 const {kanbanConsumer}=await import(pathToFileURL(join(author,'consumer.mjs')));s=await setup();const external=kanbanConsumer(descriptor);await external.plugin.activate(s.client.context);assert.equal((await external.call('board',{board:'public'})).continuity,'UNKNOWN');
 }finally{if(s)await s.close();rmSync(root,{recursive:true,force:true});}
});

run('K22 active real event poll rechecks revocation before empty observation delivery',async s=>{
 const pending=s.client.call('events',{board:'public',cursor:'9007199254740000',limit:1});await new Promise(r=>setTimeout(r,100));s.identities.delete(s.client.key);await assert.rejects(pending,{code:'PERMISSION_DENIED'});
});
run('K22 repeated comments are not idempotent; separate real event IDs preserve duplicates',async s=>{
 const t=await create(s),before=await s.client.call('events',{board:'public',cursor:'0',limit:32});await s.client.call('comment',{board:'public',id:t.id,body:'repeat'});await s.client.call('comment',{board:'public',id:t.id,body:'repeat'});const after=await s.client.call('events',{board:'public',cursor:before.cursor,limit:32});assert.equal(after.events.filter(e=>e.taskId===t.id&&e.kind==='COMMENTED').length,2);
});
test('K12 stale/expired history cannot be certified: explicit synthetic retained-tail fixture reports UNKNOWN',()=>{const r=eventView({events:[{id:101,task_id:'t',kind:'created',created_at:1}],cursor:101},'public','1',1);assert.equal(r.continuity,'UNKNOWN');assert.equal(r.cursor,'101');});
test('K22 actual commit then delayed response crosses internal timeout: UNKNOWN with exact task reconciliation',async()=>{
 const server=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);try{const r=await fetch('http://127.0.0.1:19119'+req.url,{method:req.method,headers:{Connection:'close',Authorization:req.headers.authorization,'Content-Type':'application/json'},body:Buffer.concat(chunks)});const text=await r.text();await new Promise(r=>setTimeout(r,900));res.writeHead(r.status,{Connection:'close'});res.end(text);}catch{req.socket.destroy();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const s=await setup({baseURL:'http://127.0.0.1:'+server.address().port}),i={...input(),title:'timeout-'+randomUUID()};
 try{assert.equal((await s.client.call('create',i)).outcome,'UNKNOWN');const real=await setup();try{assert.ok((await real.client.call('list',{board:'public'})).tasks.some(t=>t.title===i.title));}finally{await real.close();}}finally{await s.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
