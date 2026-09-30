// Framework-neutral trusted binding. No kernel, provider, database or fixture imports.
import https from 'node:https';
import {randomBytes,createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const deny=(code,status=403)=>Object.assign(new Error(code),{code,status});
export function createSessionVerifier({clock=Date.now}={}) {
 const sessions=new Map();
 return Object.freeze({
  // Issuer is operator/test setup only; no HTTP issuance endpoint.
  issue(subject,{ttlMs=60000}={}) {const token=randomBytes(32).toString('base64url');sessions.set(hash(token),{subject,expires:clock()+ttlMs,epoch:0,revoked:false});return token;},
  verify(token){if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw deny('UNAUTHENTICATED',401);const s=sessions.get(hash(token));if(!s||s.revoked||s.expires<=clock())throw deny('UNAUTHENTICATED',401);return Object.freeze({subject:s.subject,epoch:s.epoch,key:hash(token)});},
  current(ticket){const s=sessions.get(ticket.key);return !!s&&!s.revoked&&s.expires>clock()&&s.epoch===ticket.epoch&&s.subject===ticket.subject;},
  revoke(token){const s=sessions.get(hash(token));if(s){s.revoked=true;s.epoch++;}},
  clear(){sessions.clear();}
 });
}
export function createReadBinding({tls,verifier,resolvePolicy,beforeDelivery=async()=>{}}) {
 const active=new Map();let calls=0;const sockets=new Set();
 const server=https.createServer(tls,async(req,res)=>{
  const headers={'content-type':'application/json','cache-control':'private, no-store','pragma':'no-cache','content-security-policy':"default-src 'none'; frame-ancestors 'none'",'x-content-type-options':'nosniff'};
  let ticket,slot=false,controller;const send=(status,data)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,headers);res.end(JSON.stringify(data));}};
  try{
   // No cookies, browser origins, CORS, upload, mutation, generic proxy or issuance endpoint.
   if(req.headers.origin!==undefined||req.headers.cookie!==undefined)throw deny('ORIGIN_OR_COOKIE_NOT_SUPPORTED');
   if(req.method!=='POST'||req.url!=='/v1/memory/read')throw deny('UNSUPPORTED',404);
   if(req.headers['content-type']!=='application/json')throw deny('INVALID_ARGUMENT',400);
   const auth=req.headers.authorization;if(typeof auth!=='string'||!auth.startsWith('Bearer '))throw deny('UNAUTHENTICATED',401);
   ticket=verifier.verify(auth.slice(7));
   const policy=resolvePolicy(ticket.subject);if(!policy)throw deny('PERMISSION_DENIED');
   if((active.get(ticket.key)||0)>=4)throw deny('RESOURCE_EXHAUSTED',429);
   active.set(ticket.key,(active.get(ticket.key)||0)+1);slot=true;
   let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>65536)throw deny('RESOURCE_EXHAUSTED',413);chunks.push(chunk);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw deny('INVALID_ARGUMENT',400);}
   if(!body||Array.isArray(body)||Object.keys(body).sort().join(',')!=='input,operation')throw deny('INVALID_ARGUMENT',400);
   if(!['get','search'].includes(body.operation))throw deny('UNSUPPORTED',403);
   const input=body.input;if(!input||Array.isArray(input)||typeof input!=='object')throw deny('INVALID_ARGUMENT',400);
   const expected=body.operation==='get'?['id']:['cursor','limit','query'];
   if(Object.keys(input).sort().join(',')!==expected.sort().join(','))throw deny('INVALID_ARGUMENT',400);
   if(body.operation==='get'&&(typeof input.id!=='string'||input.id.length<1||input.id.length>200))throw deny('INVALID_ARGUMENT',400);
   if(body.operation==='search'&&(typeof input.query!=='string'||input.query.length<1||input.query.length>500||!Number.isInteger(input.limit)||input.limit<1||input.limit>25||typeof input.cursor!=='string'||input.cursor.length>4096))throw deny('INVALID_ARGUMENT',400);
   const policyVersion=policy.version;
   const same=()=>{const p=resolvePolicy(ticket.subject);return verifier.current(ticket)&&p===policy&&p.version===policyVersion;};
   if(!same())throw deny('PERMISSION_DENIED');
   controller=new AbortController();res.on('close',()=>{if(!res.writableFinished)controller.abort();});
   const deadlineMs=Date.now()+3000;
   calls++;
   // `read` is injected from an already-authorized public capability handle.
   const result=await policy.read(body.operation,{...input,scope:policy.dataScope},{deadlineMs,signal:controller.signal});
   await beforeDelivery({subject:ticket.subject,operation:body.operation});
   if(!same())throw deny('PERMISSION_DENIED');
   await policy.reauthorize();
   if(!same())throw deny('PERMISSION_DENIED');
   // Source response remains schema-owned; bounded serialization, no caching or HTML.
   const value={source:{capability:policy.capability,version:policy.capabilityVersion,instance:policy.instance},freshness:{observedAtMs:Date.now(),claim:'query-observation'},continuity:'unknown',result};
   if(Buffer.byteLength(JSON.stringify(value))>2097152)throw deny('RESOURCE_EXHAUSTED',413);
   send(200,value);
  }catch(e){const known=new Set(['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','CONFLICT','FAILED_PRECONDITION','UNAVAILABLE','RESOURCE_EXHAUSTED','CANCELLED','DEADLINE_EXCEEDED','UNSUPPORTED','ORIGIN_OR_COOKIE_NOT_SUPPORTED']);const code=known.has(e?.code)?e.code:'UNAVAILABLE';send(e.status||({INVALID_ARGUMENT:400,UNAUTHENTICATED:401,PERMISSION_DENIED:403,NOT_FOUND:404,DEADLINE_EXCEEDED:504}[code]||503),{error:{code}});
  }finally{if(slot){const n=(active.get(ticket.key)||1)-1;if(n)active.set(ticket.key,n);else active.delete(ticket.key);}}
 });
 server.headersTimeout=5000;server.requestTimeout=5000;
 server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
 return {server,stats:()=>({calls,active:[...active.values()].reduce((a,b)=>a+b,0)}),async close(){for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}};
}
