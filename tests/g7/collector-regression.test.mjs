// Synthetic collector regression; external admission required. No driver import or subprocess.
import A from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
const sha=b=>createHash('sha256').update(b).digest('hex');
const driver=readFileSync(new URL('./operational-preactivation.mjs',import.meta.url));
A.equal(sha(driver),'ebe2935deaec15d42fa3766f9e1026f0ad0c1d452a76d38a51fcd1cfc8377a8f');
const added=driver.toString();
const a=added.indexOf('  function capture('),z=added.indexOf('  async function run(',a);
A(a>=0&&z>a);
const source=added.slice(a,z);
const factory=new Function('spawn','setTimeout','clearTimeout','Buffer',source+'\nreturn capture;');
const drain=()=>new Promise(r=>setImmediate(r));
function harness({late=false,kill=true,spawnError=false}={}) {
  let now=0,id=0,copies=0,settled=0,result,problem,kills=0;
  const timers=new Map(),scheduled=[],escaped=[],unguarded=[];
  const child=new EventEmitter();child.exitCode=null;child.signalCode=null;
  child.kill=s=>{A.equal(s,'SIGKILL');kills++;if(kill instanceof Error)throw kill;return kill;};
  function pipe() {
    const p=new Readable({read(){},destroy(e,cb){process.nextTick(cb,late?new Error('late destroy'):e);}});
    const emit=p.emit;
    p.emit=function(event,...args){
      if(event==='error'&&!this.listenerCount('error'))unguarded.push(args[0]);
      try{return emit.call(this,event,...args);}catch(e){escaped.push(e);return false;}
    };
    return p;
  }
  child.stdout=pipe();child.stderr=pipe();
  const capture=factory(()=>{if(spawnError)throw new Error('spawn');return child;},
    (f,ms)=>{const k=++id;timers.set(k,{at:now+ms,f});scheduled.push(ms);return k;},
    k=>timers.delete(k),{from(b){copies++;return Buffer.from(b);},concat:Buffer.concat});
  return {child,timers,scheduled,escaped,unguarded,
    start(b=''){capture('synthetic',[],100,b).then(r=>{settled++;result=r;},e=>{settled++;problem=e;});},
    send(w,b){child[w].emit('data',Buffer.isBuffer(b)?b:Buffer.from(b));},
    error(w,e){(w==='child'?child:child[w]).emit('error',e);},
    close(c=0,s=null){child.exitCode=c;child.signalCode=s;child.emit('close',c,s);},
    tick(ms){const end=now+ms;for(;;){const n=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!n||n[1].at>end)break;now=n[1].at;timers.delete(n[0]);n[1].f();}now=end;},
    get state(){return {copies,settled,result,problem,kills};}
  };
}
async function done(h,pattern){
  await drain();
  if(pattern)A.match(h.state.problem?.message||'',pattern);else A.equal(h.state.problem,undefined);
  A.equal(h.timers.size,0);A.equal(h.state.settled,1);
  for(const e of ['error','close'])A.equal(h.child.listenerCount(e),0);
  for(const p of [h.child.stdout,h.child.stderr]){
    A(p.destroyed);for(const e of ['data','error','close'])A.equal(p.listenerCount(e),0);
  }
}
const cases=[];const test=(n,f)=>cases.push([n,f]);
// Red-first: real stream nextTick errors; emit wrapper records unhandled throws.
test('cleanup expiry late stream error',async()=>{
  const h=harness({late:true});h.start();h.tick(100);h.tick(5000);
  await done(h,/cleanup timeout/);
  A.equal(h.unguarded.length,0,'error listener removed before stream close');
  A.equal(h.escaped.length,0,'late error escapes after rejection');
});
test('combined exact cap both orders and nonzero status',async()=>{
  for(const rev of [false,true]){
    const h=harness();h.start();
    for(const n of rev?['stderr','stdout']:['stdout','stderr'])h.send(n,Buffer.alloc(32768,n==='stdout'?97:98));
    h.close(rev?7:0);await done(h);A.equal(h.state.result.status,rev?7:0);
    A.equal(h.state.result.stdout,'a'.repeat(32768));A.equal(h.state.result.stderr,'b'.repeat(32768));
    A.equal(h.state.copies,2);A.equal(h.state.kills,0);
  }
});
test('overflow before copy both orders and oversized marker',async()=>{
  for(const rev of [false,true]){
    const h=harness();h.start();h.send(rev?'stderr':'stdout',Buffer.alloc(65536));
    h.send(rev?'stdout':'stderr','x');h.send('stdout','ignored');A.equal(h.state.copies,1);
    h.close();await done(h,/combined 65536/);A.equal(h.state.kills,1);
  }
  const h=harness();h.start('point');const b=Buffer.alloc(65537);b.write('BOUNDARY');
  h.send('stdout',b);A.equal(h.state.copies,0);h.close(null,'SIGKILL');await done(h,/combined 65536/);A.equal(h.state.kills,1);
});
test('UTF8 marker splits and stderr-only marker',async()=>{
  const u=harness();u.start();for(const b of Buffer.from('A€😀Z'))u.send('stdout',Buffer.from([b]));
  u.close();await done(u);A.equal(u.state.result.stdout,'A€😀Z');
  for(let i=1;i<8;i++){
    const h=harness();h.start('point');h.send('stdout','BOUNDARY'.slice(0,i));A.equal(h.state.kills,0);
    h.send('stdout','BOUNDARY'.slice(i));A.equal(h.state.kills,1);
    h.child.emit('exit',null,'SIGKILL');await Promise.resolve();A.equal(h.state.settled,0);
    h.close(null,'SIGKILL');await done(h);A.equal(h.state.result.signal,'SIGKILL');
  }
  const h=harness();h.start('point');h.send('stderr','BOUNDARY');A.equal(h.state.kills,0);
  h.close(null,'SIGKILL');await done(h,/premature/);
});
test('premature wrong death and overflow after marker',async()=>{
  for(const [m,c,s] of [[false,0,null],[true,0,null],[true,null,'SIGTERM']]){
    const h=harness();h.start('point');if(m)h.send('stdout','BOUNDARY');h.close(c,s);await done(h,/premature|SIGKILL/);
  }
  const h=harness();h.start('point');h.send('stdout','BOUNDARY');h.send('stderr',Buffer.alloc(65536));
  h.close(null,'SIGKILL');await done(h,/combined/);A.equal(h.state.copies,1);
});
test('spawn child pipe errors and first cause',async()=>{
  const s=harness({spawnError:true});s.start();await Promise.resolve();A.match(s.state.problem.message,/spawn/);A.equal(s.timers.size,0);
  s.child.stdout.destroy();s.child.stderr.destroy();await drain();
  for(const who of ['child','stdout','stderr'])for(const m of [false,true]){
    const h=harness();h.start(m?'point':'');if(m)h.send('stdout','BOUNDARY');
    const first=new Error('first');h.error(who,first);h.error('child',new Error('second'));
    A.equal(h.state.kills,1);h.close(null,'SIGKILL');await done(h,/first/);A.equal(h.state.problem,first);
  }
});
test('absolute cleanup exit versus close failed kill and late events',async()=>{
  for(const m of [false,true])for(const closes of [false,true]){
    const h=harness();h.start(m?'point':'');if(m)h.send('stdout','BOUNDARY');else h.tick(100);
    h.tick(4999);h.send('stderr','late');h.error('child',new Error('later'));
    h.child.emit('exit',null,'SIGKILL');await Promise.resolve();A.equal(h.state.settled,0);
    A.deepEqual(h.scheduled,[100,5000]);A.equal(h.state.kills,1);
    if(closes)h.close(null,'SIGKILL');else h.tick(1);
    await done(h,closes?(m?/later/:/child timeout/):/cleanup timeout/);
    if(!closes)A.match(h.state.problem.cause.message,m?/later/:/child timeout/);
    const before=h.state;h.send('stdout','late');h.close();h.tick(9999);await drain();A.deepEqual(h.state,before);
  }
  for(const kill of [false,new Error('kill throw')]){
    const h=harness({kill});h.start('point');h.send('stdout','BOUNDARY');h.close(null,'SIGKILL');await done(h,/SIGKILL request failed|kill throw/);
  }
});
test('awaited call sites static only',()=>{
  A(!added.includes('spawnSync'));A(added.includes('killIsNotCleanReap:true'));A(added.includes("point==='journal-link'?1:0"));
  A.equal((added.match(/await capture\(/g)||[]).length,3);A.equal((added.match(/await run\(/g)||[]).length,4);
});
let failed=0;
for(const [n,f] of cases){try{await f();console.log('PASS '+n);}catch(e){failed++;console.log('FAIL '+n+': '+String(e.stack));}}
console.log('capture-source-sha256 '+sha(source));
console.log('summary '+cases.length+' groups; '+failed+' failed; synthetic only');
process.exitCode=failed?1:0;
