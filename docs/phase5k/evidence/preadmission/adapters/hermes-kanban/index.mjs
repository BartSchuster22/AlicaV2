// Native trusted operator adapter. Public SDK only; no backend internals or state store.
import {definePlugin} from '@alica/plugin-sdk';
import {AcapError} from '@alica/acap-contracts';
import {createHash} from 'node:crypto';
const MAX=262144, states=new Set(['triage','todo','scheduled','ready','running','blocked','review','done','archived']);
const fail=c=>{throw new AcapError(c);};
const text=(s,n,empty=false)=>typeof s==='string'&&s.length<=(n)&& (empty||s.length>0);
export function taskView(t,board){
 if(!t||!text(t.id,128)||!text(t.title,256)||!text(t.body??'',8192,true)||!states.has(t.status)||!(t.assignee===null||text(t.assignee,128)))fail('UNAVAILABLE');
 return {id:t.id,board,title:t.title,body:t.body??'',state:t.status.toUpperCase(),assigned:t.assignee!==null};
}
export function boardView(data,board){
 if(!data||!Array.isArray(data.columns)||data.columns.length>32)fail('UNAVAILABLE');
 const tasks=[];for(const column of data.columns){if(!Array.isArray(column.tasks))fail('UNAVAILABLE');for(const t of column.tasks){if(tasks.length===256)fail('RESOURCE_EXHAUSTED');tasks.push(taskView(t,board));}}
 if(new Set(tasks.map(t=>t.id)).size!==tasks.length)fail('UNAVAILABLE');return tasks;
}
export function eventView(frame,board,cursor,limit){
 if(!frame||!Array.isArray(frame.events)||frame.events.length>200)fail('UNAVAILABLE');
 const start=cursor===''?0:Number(cursor);let previous=start;
 for(const e of frame.events){if(!e||!Number.isSafeInteger(e.id)||e.id<=previous||!text(e.task_id,128)||!text(e.kind,128)||!Number.isSafeInteger(e.created_at)||e.created_at<0||!Number.isSafeInteger(e.created_at*1000))fail('UNAVAILABLE');previous=e.id;}
 const kinds={created:'CREATED',edited:'UPDATED',commented:'COMMENTED'},events=[];let end=cursor;
 for(const e of frame.events){const kind=Object.hasOwn(kinds,e.kind)?kinds[e.kind]:null;if(kind&&events.length===limit)break;if(kind)events.push({id:String(e.id),taskId:e.task_id,board,kind,atMs:e.created_at*1000});end=String(e.id);}
 return {events,cursor:end,continuity:'UNKNOWN'};
}
export function kanbanAdapter(descriptor,resolveCaller,configuration){
 if(!configuration||Object.keys(configuration).sort().join(',')!=='baseURL,isolatedNonlaunching'||configuration.isolatedNonlaunching!==true||typeof resolveCaller!=='function')fail('FAILED_PRECONDITION');
 let url;try{url=new URL(configuration.baseURL);}catch{fail('FAILED_PRECONDITION');}
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash)fail('FAILED_PRECONDITION');
 const base=url.origin+'/api/plugins/kanban',inflight=new Set();let health='UNAVAILABLE',closed=false,context;
 const auth=(ctx,input,operation)=>{
  const a=resolveCaller(ctx.caller),permission=['create','update','comment'].includes(operation)?'kanban.mutate':'kanban.read';
  if(!a||!text(a.actor,128)||a.publicBoard!==input.board||!text(a.backendBoard,64)||!/^[a-zA-Z0-9_-]+$/.test(a.backendBoard)||!Array.isArray(a.permissions)||!a.permissions.includes(permission))fail('PERMISSION_DENIED');
  return {actor:a.actor,publicBoard:a.publicBoard,backendBoard:a.backendBoard,permission};
 };
 const same=(a,b)=>a.actor===b.actor&&a.publicBoard===b.publicBoard&&a.backendBoard===b.backendBoard&&a.permission===b.permission;
 async function http(path,board,token,signal,method='GET',body){
  const u=new URL(base+path);u.searchParams.set('board',board);
  const response=await fetch(u,{method,headers:{Connection:'close',Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal,redirect:'error'});
  if(!response.ok){await response.body?.cancel();if(response.status>=500)throw Error('UNCERTAIN');fail(({401:'UNAUTHENTICATED',403:'PERMISSION_DENIED',404:'NOT_FOUND',409:'CONFLICT',400:'INVALID_ARGUMENT',422:'INVALID_ARGUMENT',429:'RESOURCE_EXHAUSTED'})[response.status]??'UNAVAILABLE');}
  let bytes=0;const chunks=[],reader=response.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX)fail('RESOURCE_EXHAUSTED');chunks.push(value);}}finally{try{await reader.cancel();}catch{}reader.releaseLock();}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{fail('UNAVAILABLE');}
 }
 async function events(input,a,token,signal,budget){
  if(input.cursor!==''&&!/^(0|[1-9][0-9]*)$/.test(input.cursor)||!Number.isSafeInteger(Number(input.cursor)))fail('INVALID_ARGUMENT');
  const u=new URL(base.replace('http:','ws:')+'/events');u.searchParams.set('board',a.backendBoard);u.searchParams.set('since',input.cursor||'0');u.searchParams.set('token',token);
  return await new Promise((resolve,reject)=>{
   let opened=false,settled=false;const ws=new WebSocket(u),finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);try{ws.close();}catch{};error?reject(error):resolve(value);};
   const abort=()=>finish(new AcapError('CANCELLED'));
   const timer=setTimeout(()=>finish(opened?null:new AcapError('UNAVAILABLE'),{events:[],cursor:input.cursor,continuity:'UNKNOWN'}),Math.min(400,budget));
   ws.addEventListener('open',()=>{opened=true;});ws.addEventListener('error',()=>finish(new AcapError('UNAVAILABLE')));ws.addEventListener('close',()=>{if(!settled)finish(new AcapError('UNAVAILABLE'));});
   ws.addEventListener('message',event=>{try{if(typeof event.data!=='string')fail('UNAVAILABLE');if(Buffer.byteLength(event.data)>MAX)fail('RESOURCE_EXHAUSTED');finish(null,eventView(JSON.parse(event.data),input.board,input.cursor,input.limit));}catch(e){finish(e instanceof AcapError?e:new AcapError('UNAVAILABLE'));}});
   signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  });
 }
 async function invoke(operation,input,ctx){
  if(closed)fail('UNAVAILABLE');const a=auth(ctx,input,operation);
  if(ctx.idempotencyKey!==undefined)fail('INVALID_ARGUMENT');if(ctx.signal.aborted)fail('CANCELLED');
  const budget=Math.min(600,ctx.deadlineMs-Date.now()-50);if(budget<=0)fail('DEADLINE_EXCEEDED');
  if(inflight.size>=4)fail('RESOURCE_EXHAUSTED');
  const owner=new AbortController(),signal=AbortSignal.any([owner.signal,ctx.signal]),timer=setTimeout(()=>owner.abort(),budget);let done;
  const completed=new Promise(r=>{done=r;});const owned={owner,completed};inflight.add(owned);
  const mutation=['create','update','comment'].includes(operation),requestKey=operation==='create'?input.requestKey:'';let sent=false,result;
  try{
   const token=await context.secret('synthetic-test');if(typeof token!=='string'||!token)fail('UNAUTHENTICATED');
   const get=async id=>(await http('/tasks/'+encodeURIComponent(id),a.backendBoard,token,signal)).task;
   if(operation==='board'||operation==='list'){
    const tasks=boardView(await http('/board',a.backendBoard,token,signal),input.board);result=operation==='board'?{board:input.board,taskCount:tasks.length,continuity:'UNKNOWN'}:{tasks,continuity:'UNKNOWN'};
   }else if(operation==='get')result=taskView(await get(input.id),input.board);
   else if(operation==='events')result=await events(input,a,token,signal,budget);
   else if(operation==='create'){
    const body='[origin '+a.actor+']\n'+input.body,key=createHash('sha256').update(JSON.stringify([a.backendBoard,a.actor,input.requestKey])).digest('hex');
    sent=true;const data=await http('/tasks',a.backendBoard,token,signal,'POST',{title:input.title,body,triage:true,assignee:null,parents:[],idempotency_key:key});
    const task=taskView(data.task,input.board);if(task.title!==input.title||task.body!==body||task.state!=='TRIAGE'||task.assigned)fail('CONFLICT');
    result={outcome:'APPLIED',task:[task],requestKey};
   }else if(operation==='update'){
    const task=taskView(await get(input.id),input.board);if(task.state!=='TRIAGE'||task.assigned)fail('FAILED_PRECONDITION');
    sent=true;const data=await http('/tasks/'+encodeURIComponent(input.id),a.backendBoard,token,signal,'PATCH',{title:input.title,body:'[origin '+a.actor+']\n'+input.body});
    result={outcome:'APPLIED',task:[taskView(data.task,input.board)],requestKey};
   }else if(operation==='comment'){
    // Existence read is authorized first, but this does not create a transaction.
    taskView(await get(input.id),input.board);sent=true;const data=await http('/tasks/'+encodeURIComponent(input.id)+'/comments',a.backendBoard,token,signal,'POST',{author:a.actor,body:input.body});if(data.ok!==true)fail('UNAVAILABLE');result={outcome:'APPLIED',task:[],requestKey};
   }else fail('INVALID_ARGUMENT');
   health='READY';
  }catch(e){
   health='DEGRADED';if(mutation&&sent&&!(e instanceof AcapError&&['CONFLICT','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','INVALID_ARGUMENT'].includes(e.code)))result={outcome:'UNKNOWN',task:[],requestKey};
   else throw e instanceof AcapError?e:new AcapError(signal.aborted?'CANCELLED':'UNAVAILABLE');
  }finally{clearTimeout(timer);inflight.delete(owned);done();}
  if(closed)fail('UNAVAILABLE');if(!same(a,auth(ctx,input,operation)))fail('PERMISSION_DENIED');await context.secret('synthetic-test');return result;
 }
 return {health:()=>health,active:()=>inflight.size,plugin:definePlugin({async activate(c){context=c;await c.secret('synthetic-test');await c.effect(async own=>{own(async()=>{closed=true;health='UNAVAILABLE';const active=[...inflight];for(const x of active)x.owner.abort();await Promise.allSettled(active.map(x=>x.completed));});});c.provide(descriptor,Object.fromEntries(descriptor.operations.map(o=>[o.name,(input,ctx)=>invoke(o.name,input,ctx)])));}})};
}
