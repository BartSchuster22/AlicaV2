// Focused test-only RLIMIT_FSIZE qualification; no fs monkeypatch or Cell import.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openPrivateRoot,durableWrite} from '../../tools/g7-durable.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const self=fileURLToPath(import.meta.url), base=process.env.TMPDIR;
const limits=()=>fs.readFileSync('/proc/self/limits','utf8');
const status=()=>fs.readFileSync('/proc/self/status','utf8').split('\n').filter(x=>/^(Uid|Gid|CapEff|CapBnd|NoNewPrivs|Seccomp):/.test(x));
const assertLimits=(s,cap)=>{
 assert.match(s,new RegExp('Max file size\\s+'+cap+'\\s+'+cap+'\\s+bytes'));
 assert.match(s,/Max open files\s+64\s+64/);assert.match(s,/Max core file size\s+0\s+0/);
};
if(process.argv[2]==='child') {
 const root=process.argv[3], replace=process.argv[4]==='replace';
 // Python explicitly inherits SIG_IGN, then this bounded test-only handler is
 // installed before real writes. It does not alter fs or production guards.
 let signalCallbacks=0;process.on('SIGXFSZ',()=>{signalCallbacks++;});
 const lim=limits();assertLimits(lim,8192);
 const payload=Buffer.alloc(65536,65), space=fs.statfsSync(root);
 assert(space.bavail*space.bsize>=536870912+payload.length);
 const old=replace?hash(fs.readFileSync(root+'/target.bin')):null;
 const fd=openPrivateRoot(root), events=[];let error;
 try {
  // Positive control inside the same capped child and root, same production API.
  durableWrite(fd,'positive.bin',Buffer.from('positive-control'),{maximum:65536});
  assert.equal(fs.readFileSync(root+'/positive.bin','utf8'),'positive-control');
  try {durableWrite(fd,'target.bin',payload,{replace,maximum:65536,boundary:n=>events.push(n)});}
  catch(e){error={code:e.code,syscall:e.syscall,errno:e.errno,message:e.message};}
 } finally {fs.closeSync(fd);}
 await new Promise(r=>setTimeout(r,300));
 const residue=fs.readdirSync(root).filter(n=>n.startsWith('next-')).map(name=>{
  const b=fs.readFileSync(root+'/'+name),s=fs.lstatSync(root+'/'+name);
  return {name,bytes:s.size,uid:s.uid,gid:s.gid,mode:s.mode&0o7777,nlink:s.nlink,sha256:hash(b),payloadPrefix:b.equals(payload.subarray(0,b.length))};
 });
 const after=fs.existsSync(root+'/target.bin')?hash(fs.readFileSync(root+'/target.bin')):null;
 const observation={case:replace?'replace':'create',pid:process.pid,ppid:process.ppid,limits:lim,status:status(),freeBefore:space.bavail*space.bsize,payloadBytes:payload.length,cap:8192,positive:true,error,events,signalPolicy:'Python SIG_IGN inherited; bounded Node test-only SIGXFSZ handler',signalCallbacks,old,after,residue};
 console.log(JSON.stringify(observation));
 assert.equal(error?.code,'EFBIG');assert.equal(error.syscall,'write');
 assert.deepEqual(events,['open','write']);
 assert.equal(residue.length,1);assert.equal(residue[0].bytes,8192);
 assert.equal(residue[0].uid,process.getuid());assert.equal(residue[0].mode,0o600);assert.equal(residue[0].nlink,1);assert(residue[0].payloadPrefix);
 assert.equal(after,old);if(!replace)assert(!fs.existsSync(root+'/target.bin'));
} else {
 test('real RLIMIT_FSIZE create and independently seeded replace preserve targets',async t=>{
  const parentLimits=limits();assertLimits(parentLimits,65536);
  console.log('PARENT '+JSON.stringify({pid:process.pid,limits:parentLimits,status:status()}));
  for(const kind of ['create','replace']) await t.test(kind,async()=>{
   const root=base+'/'+kind;fs.mkdirSync(root,{mode:0o700});
   const seed=Buffer.from('independent-before-child-cap replacement seed\n');
   if(kind==='replace')fs.writeFileSync(root+'/target.bin',seed,{flag:'wx',mode:0o600});
   const seeded=kind==='replace'?hash(fs.readFileSync(root+'/target.bin')):null;
   console.log('SEED '+JSON.stringify({kind,path:root+'/target.bin',bytes:kind==='replace'?seed.length:0,sha256:seeded,independentBeforeChild:true}));
   const py='import os,resource,signal,sys; signal.signal(signal.SIGXFSZ,signal.SIG_IGN); resource.setrlimit(resource.RLIMIT_FSIZE,(8192,8192)); os.execv(sys.argv[1],sys.argv[1:])';
   const child=spawn('/usr/bin/python3',['-I','-B','-c',py,process.execPath,self,'child',root,kind],{stdio:['ignore','pipe','pipe']});
   let out='',err='';child.stdout.on('data',b=>{out+=b;assert(out.length<16384);});child.stderr.on('data',b=>{err+=b;assert(err.length<8192);});
   const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
   const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);
   console.log('CHILD '+JSON.stringify({kind,...result,stdout:out,stderr:err}));
   assert.equal(result.signal,null,'signal-only termination is not an EFBIG exception');assert.equal(result.code,0,err);
   const o=JSON.parse(out);assert.equal(o.error.code,'EFBIG');assert.equal(o.old,seeded);assert.equal(o.after,seeded);
   if(kind==='replace')assert(fs.readFileSync(root+'/target.bin').equals(seed));else assert(!fs.existsSync(root+'/target.bin'));
   const evidence={...o,exit:result,independentSeedSha256:seeded,target:root+'/target.bin'};
   fs.writeFileSync(base+'/'+kind+'-observation.json',JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});
  });
 });
}
