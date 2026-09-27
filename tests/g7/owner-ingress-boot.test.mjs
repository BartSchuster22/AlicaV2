// Acceptance: published repair/ACCEPTANCE.md:34-38, G7-09/13 WP3.
// Full unedited production modules, one URL-keyed graph per isolated VM.
// Only config and node transport/clock boundaries are synthetic. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { bootOwnerCheckpointIngress as realBoot } from '../../tools/g7-owner-ingress-boot.mjs';
import { inspectCheckpointOrigin as realOrigin } from '../../tools/g7-cell-rotation.mjs';
const root = new URL('../../tools/', import.meta.url);
const digest = 'sha256:' + 'a'.repeat(64), cert = Buffer.from('SYNTHETIC CERTIFICATE NOT TLS MATERIAL');
const pin = createHash('sha256').update(cert).digest('hex');
const config = { gatewayCertificateSHA256: pin, receiverUID: process.getuid(),
  gatewayUID: process.getuid()+1, candidateUID: process.getuid()+2,
  tlsCredentials: {key:'SYNTHETIC',cert:'SYNTHETIC',ca:'SYNTHETIC'} };
const pack = cell => {
  const body = Buffer.from('explicit owner confirmation\nCellID='+cell+'\nSHA256='+digest+
    '\npurpose=historical rotation pins only\ngenesis/latest/expected independently established');
  const prefix = Buffer.alloc(4); prefix.writeUInt32BE(body.length); return Buffer.concat([prefix, body]);
};
class Socket extends EventEmitter {
  encrypted=true; authorized=true; destroyed=false;
  isSessionReused() { return false; }
  getPeerCertificate() { return {raw:cert}; }
  setTimeout() {}
  destroy() { this.destroyed=true; this.emit('close'); }
}
async function graph({cfg=config, mode='normal', closeMode='normal'}={}) {
  let createCount=0, listenCount=0, server, time=0, serial=0;
  const timers=new Map();
  const setTimeout=(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:time+ms});return id;};
  const clearTimeout=id=>timers.delete(id);
  const advance=ms=>{time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}};
  class Server extends EventEmitter {
    listening=false; closeCalls=0; closeEvents=0; duplicateErrors=0;
    listen(options) {
      listenCount++; this.options=options;
      assert.equal(options.path,'/SYNTHETIC-NOT-LISTENED');
      // Node v24.21 net.js:2130,2814: synchronous abort close clears the
      // handle; close event/callback is asynchronous, even with no handle.
      const aborted=()=>{
        // Fault injection: cancellation fails to initiate transport closure.
        // This exercises the production explicit-close fallback/throw path.
        if(closeMode!=='throw' && closeMode!=='error') this.close();
      };
      options.signal.addEventListener('abort',aborted,{once:true});
      this.once('close',()=>options.signal.removeEventListener('abort',aborted));
      if(mode==='throw') throw Error('BIND_THROW');
      if(mode==='error') { this.emit('error',Error('BIND_ERROR')); return; }
      this.listening=mode==='normal';
      if(mode==='normal') this.emit('listening');
    }
    close(callback) {
      this.closeCalls++;
      if(closeMode==='throw') throw Error('CLOSE_THROW');
      if(closeMode==='hang') return;
      if(closeMode==='error') { queueMicrotask(()=>callback?.(Error('CLOSE_ERROR'))); return; }
      const running=this.listening;
      if(callback) this.once('close',()=>{
        if(!running) this.duplicateErrors++;
        callback(running ? undefined : Object.assign(Error('ERR_SERVER_NOT_RUNNING'),{code:'ERR_SERVER_NOT_RUNNING'}));
      });
      this.listening=false;
      queueMicrotask(()=>{ this.closeEvents++; this.emit('close'); });
    }
    unsolicitedClose() { this.listening=false; this.closeEvents++; this.emit('close'); }
  }
  const tls={TLSSocket:Socket, createServer(options,handler) {
    createCount++; assert.equal(options.requestCert,true);assert.equal(options.rejectUnauthorized,true);
    assert.equal(options.minVersion,'TLSv1.2');assert.equal(options.handshakeTimeout,2000);
    server=new Server();server.handler=handler;return server;
  }};
  const context=vm.createContext({Buffer,process:{getuid:()=>process.getuid()},AbortController},
    {codeGeneration:{strings:false,wasm:false}});
  const modules=new Map();
  const boundaries=new Map([
    ['node:tls',{default:tls}],['node:crypto',{createHash}],
    ['node:perf_hooks',{performance:{now:()=>time}}],['node:timers',{setTimeout,clearTimeout}],
  ]);
  const synthetic=(id,values)=>new vm.SyntheticModule(Object.keys(values),function(){
    for(const[k,v]of Object.entries(values))this.setExport(k,v);
  },{context,identifier:id});
  const load=id=>{
    if(modules.has(id))return modules.get(id);
    let m;
    if(boundaries.has(id))m=synthetic(id,boundaries.get(id));
    else {
      const url=new URL(id);assert.equal(url.search,'');assert.equal(url.hash,'');
      assert.equal(new URL('.',url).href,root.href);
      if(url.pathname.endsWith('/g7-owner-ingress-config.mjs'))m=synthetic(id,{default:cfg});
      else m=new vm.SourceTextModule(readFileSync(url,'utf8'),{context,identifier:id,
        importModuleDynamically:()=>{throw Error('dynamic import forbidden');}});
    }
    modules.set(id,m);return m;
  };
  const entry=new vm.SourceTextModule(`import * as boot from './g7-owner-ingress-boot.mjs';
    import * as origin from './g7-cell-rotation.mjs';
    import * as ingress from './g7-owner-ingress.mjs'; export {boot,origin,ingress};`,
    {context,identifier:new URL('test-entry.mjs',root).href});
  await entry.link((spec,parent)=>load(spec.startsWith('node:')?spec:new URL(spec,parent.identifier).href));
  await entry.evaluate({timeout:1000});
  assert.equal([...modules.keys()].filter(k=>k.endsWith('/g7-owner-ingress.mjs')).length,1);
  assert.equal(createCount,0);assert.equal(listenCount,0);
  const ns=entry.namespace;
  return {...ns,advance,timers,modules,get server(){return server;},get createCount(){return createCount;},
    get listenCount(){return listenCount;},
    send(cell, socket=new Socket()) {server.handler(socket);socket.emit('data',pack(cell));socket.emit('end');return socket;},
    inspect(cell){return ns.origin.inspectCheckpointOrigin(cell,digest);},
    start(){return ns.boot.bootOwnerCheckpointIngress('/SYNTHETIC-NOT-LISTENED');}};
}
test('real canonical ESM null config is inert and denies before listen',()=>{
  assert.equal(realOrigin('SYNTHETIC_REAL_NULL',digest),'UNAVAILABLE');
  assert.throws(()=>realBoot('/SYNTHETIC-NOT-LISTENED'),/UNCONFIGURED/);
  assert.throws(()=>realBoot('/SYNTHETIC-NOT-LISTENED'),/ALREADY_BOOTED/);
});
test('VM null/invalid config denies even when mock TLS would accept',async()=>{
  for(const cfg of [null,{}, {...config,receiverUID:config.candidateUID}, {...config,gatewayUID:config.candidateUID}]) {
    const g=await graph({cfg});assert.throws(()=>g.start(),/UNCONFIGURED/);
    assert.equal(g.createCount,0);assert.equal(g.listenCount,0);assert.equal(g.inspect('NULL'),'UNAVAILABLE');
  }
});
test('receiver commits through ACTUAL canonical origin; factory cannot populate singleton; close revokes',async()=>{
  const g=await graph();const independent=g.ingress.createIngress(config,()=>pin);
  const s=new Socket();independent.handle(s);s.emit('data',pack('FACTORY_ONLY'));s.emit('end');
  assert(independent.read('FACTORY_ONLY',digest));assert.equal(g.inspect('FACTORY_ONLY'),'UNAVAILABLE');
  const before=new Socket();g.ingress.receiveOwnerCheckpointConnection(before);assert(before.destroyed);
  const life=g.start();await life.ready;assert.equal(g.server.maxConnections,1);
  assert(g.send('SYNTHETIC_OWNER').destroyed);assert.equal(g.inspect('SYNTHETIC_OWNER'),'ESTABLISHED');
  assert.equal(g.inspect('OTHER'),'UNAVAILABLE');
  assert.equal(g.origin.inspectCheckpointOrigin('SYNTHETIC_OWNER','sha256:'+'b'.repeat(64)),'UNAVAILABLE');
  assert.throws(()=>g.start(),/ALREADY_BOOTED/);
  const pending=new Socket();g.server.handler(pending);pending.emit('data',pack('PENDING'));
  const closed=life.close();assert.equal(life.close(),closed);assert(pending.destroyed);
  pending.emit('end');assert.equal(g.inspect('PENDING'),'UNAVAILABLE');
  assert.equal(g.inspect('SYNTHETIC_OWNER'),'UNAVAILABLE');await closed;
  g.server.emit('listening');g.send('LATE');assert.equal(g.inspect('LATE'),'UNAVAILABLE');
  assert(g.server.options.signal.aborted);assert.equal(g.timers.size,0);
});
test('concurrent racing boot has exactly one attempt; pending bind accepts nothing',async()=>{
  const g=await graph({mode:'pending'});
  const attempts=await Promise.allSettled([Promise.resolve().then(()=>g.start()),Promise.resolve().then(()=>g.start())]);
  assert.equal(attempts[0].status,'fulfilled');assert.equal(attempts[1].status,'rejected');
  assert.match(attempts[1].reason.message,/ALREADY_BOOTED/);assert.equal(g.listenCount,1);
  const life=attempts[0].value;g.send('EARLY');assert.equal(g.inspect('EARLY'),'UNAVAILABLE');
  await life.close();await assert.rejects(life.ready,/CLOSED/);
  g.server.emit('listening');g.send('LATE');assert.equal(g.inspect('LATE'),'UNAVAILABLE');
  assert(g.server.options.signal.aborted);assert.equal(g.timers.size,0);
});
test('sync and async bind failures revoke permanently, including late listening',async()=>{
  for(const mode of ['throw','error']) {
    const g=await graph({mode});const life=g.start();await assert.rejects(life.ready,/BIND_/);await life.close();
    g.server.emit('listening');g.send('AFTER_FAIL');assert.equal(g.inspect('AFTER_FAIL'),'UNAVAILABLE');
    assert.throws(()=>g.start(),/ALREADY_BOOTED/);assert.equal(g.timers.size,0);
  }
});
test('bind deadline cancels pending listen without accepting; bounded close timeout',async()=>{
  const g=await graph({mode:'pending',closeMode:'hang'});const life=g.start();
  g.advance(2000);await assert.rejects(life.ready,/BIND_TIMEOUT/);
  assert(g.server.options.signal.aborted);g.server.emit('listening');g.send('TOO_LATE');
  assert.equal(g.inspect('TOO_LATE'),'UNAVAILABLE');g.advance(2000);
  await assert.rejects(life.close(),/CLOSE_TIMEOUT/);assert.equal(g.timers.size,0);
});
test('throwing and hung close immediately revoke records and connections',async()=>{
  for(const closeMode of ['throw','error','hang']) {
    const g=await graph({closeMode});const life=g.start();await life.ready;g.send('BEFORE_CLOSE');
    assert.equal(g.inspect('BEFORE_CLOSE'),'ESTABLISHED');const closing=life.close();
    assert.equal(g.inspect('BEFORE_CLOSE'),'UNAVAILABLE');g.send('AFTER_CLOSE');
    assert.equal(g.inspect('AFTER_CLOSE'),'UNAVAILABLE');g.advance(2000);
    await assert.rejects(closing,/CLOSE_(THROW|ERROR|TIMEOUT)/);assert.equal(g.timers.size,0);
  }
});
test('unsolicited server close/error revoke successful boot',async()=>{
  for(const event of ['close','error']) {
    const g=await graph();const life=g.start();await life.ready;g.send('BEFORE_EVENT');
    assert.equal(g.inspect('BEFORE_EVENT'),'ESTABLISHED');if(event==='close') g.server.unsolicitedClose(); else g.server.emit(event,Error('SERVER_FAILURE'));
    assert.equal(g.inspect('BEFORE_EVENT'),'UNAVAILABLE');await life.close();
    g.send('AFTER_EVENT');assert.equal(g.inspect('AFTER_EVENT'),'UNAVAILABLE');assert.equal(g.timers.size,0);
  }
});
test('canonical production transport identity guards remain mandatory',async()=>{
  const g=await graph();const life=g.start();await life.ready;
  const sockets=[Object.assign(new Socket(),{authorized:false}),Object.assign(new Socket(),{encrypted:false}),
    Object.assign(new Socket(),{isSessionReused:()=>true}),Object.assign(new Socket(),{getPeerCertificate:()=>({raw:Buffer.from('WRONG')})})];
  for(const s of sockets){g.send('REJECTED',s);assert(s.destroyed);assert.equal(g.inspect('REJECTED'),'UNAVAILABLE');}
  const changed=new Socket();g.server.handler(changed);changed.emit('data',pack('CHANGED'));
  changed.authorized=false;changed.emit('end');assert.equal(g.inspect('CHANGED'),'UNAVAILABLE');
  assert.equal(g.origin.classifyStoppedRotationRecovery({}).executionAuthorized,false);
  await life.close();assert.equal(g.timers.size,0);
});
test('invalid explicit endpoint never calls listen; remains one-shot',async()=>{
  const g=await graph();assert.throws(()=>g.boot.bootOwnerCheckpointIngress('relative'),/ENDPOINT_INVALID/);
  assert.equal(g.listenCount,0);assert.throws(()=>g.start(),/ALREADY_BOOTED/);
});

test('Node24 abort close waits for completion without duplicate callback error',async()=>{
  const g=await graph();const life=g.start();await life.ready;
  let completed=false;
  const closed=life.close();closed.then(()=>{completed=true;},()=>{});
  assert.equal(g.server.listening,false);assert.equal(g.server.closeCalls,1);
  assert.equal(g.server.closeEvents,0);assert.equal(completed,false);
  assert.equal(life.close(),closed);
  await closed;
  assert.equal(g.server.closeEvents,1);assert.equal(g.server.duplicateErrors,0);
  assert.equal(g.timers.size,0);
});
test('mock independently reproduces Node duplicate-close callback semantics',async()=>{
  const g=await graph();const life=g.start();await life.ready;
  const closed=life.close();let duplicate;
  g.server.close(error=>{duplicate=error;});
  assert.equal(duplicate,undefined);await closed;
  assert.equal(duplicate.code,'ERR_SERVER_NOT_RUNNING');
  assert.equal(g.server.duplicateErrors,1);
});
test('already observed unsolicited close needs no further close request',async()=>{
  const g=await graph();const life=g.start();await life.ready;
  g.server.unsolicitedClose();await life.close();
  assert.equal(g.server.closeCalls,0);assert.equal(g.timers.size,0);
});
test('unknown cleanup cannot succeed from abort alone or a late event',async()=>{
  const g=await graph({closeMode:'hang'});const life=g.start();await life.ready;
  const closed=life.close();let settled=false;closed.then(()=>{settled=true;},()=>{});
  await Promise.resolve();assert.equal(settled,false);
  g.advance(2000);await assert.rejects(closed,/CLOSE_TIMEOUT/);
  g.server.unsolicitedClose();await assert.rejects(life.close(),/CLOSE_TIMEOUT/);
  assert.equal(g.inspect('LATE'),'UNAVAILABLE');
});
