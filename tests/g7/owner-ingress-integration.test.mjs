import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
const root = resolve('tools');
const tick = () => new Promise(r => setImmediate(r));
async function owner(options = {}) {
  const events = [], sent = [], modules = new Map();
  let server, status = 'RUNNING', exited, release;
  const raw = Buffer.from('synthetic certificate only');
  class Socket extends EventEmitter {
    encrypted = true; authorized = true;
    isSessionReused() { return false; }
    getPeerCertificate() { return { raw }; }
    setTimeout() {}
    destroy() { events.push('socket-destroy'); }
  }
  const context = vm.createContext({ Buffer, AbortController, console,
    process: { argv: ['node','owner',...(options.argv ?? ['/synthetic/root','/synthetic/input','31','32',
      ...(options.accepted ? ['accepted-pin','input-pin'] : []),
      ...(options.opt === false ? [] : ['--owner-checkpoint-ingress','/synthetic.sock'])])],
      getuid: () => 1000, exit(code) { events.push('exit:'+code); exited = code; throw new Error('MOCK_PROCESS_EXIT'); } }
  });
  const config = { gatewayCertificateSHA256: createHash('sha256').update(raw).digest('hex'),
    gatewayUID: 1001, receiverUID: 1000, candidateUID: 1002,
    tlsCredentials: { key: 'SYNTHETIC', cert: 'SYNTHETIC', ca: 'SYNTHETIC' } };
  const mocks = {
    'node:fs': { closeSync: fd => events.push('fd-close:'+fd) },
    'node:module': { createRequire: () => path => { assert.equal(path,'../native/g7/build/ownership.node'); return { guardParent: fd => { if (!Number.isInteger(fd)) { events.push('custody-denied'); throw Error('CUSTODY'); } assert.equal(fd,32); events.push('guard'); } }; } },
    'node:path': await import('node:path'),
    'node:crypto': await import('node:crypto'),
    'node:perf_hooks': await import('node:perf_hooks'),
    'node:timers': await import('node:timers'),
    '@alica/acap-contracts': { parse: () => ({archive:{},authorization:{},trust:{}}), digest: () => 'input-pin', check: (v) => { if (!v) throw Error('CONFLICT'); } },
    'g7-durable.mjs': { openPrivateRoot: () => { events.push('input-open'); return 40; }, readPrivate: () => '' },
    'g7-owner-channel.mjs': { OwnerChannel: class {
      constructor(fd) { assert.equal(fd,32); events.push('channel'); }
      next() { events.push('next'); return new Promise(r => { release = r; }); }
      async send(message) { if (exited !== undefined) throw Error('MOCK_PROCESS_EXIT'); sent.push(JSON.parse(JSON.stringify(message))); events.push(message.stopped ? 'stopped' : message.uncertain ? 'uncertain' : 'snapshot'); }
    } },
    'g7-cell.mjs': { CellPreparation: class {
      constructor(path, custody) { assert.equal(path,'/synthetic/root'); assert.equal(custody.fd,31); events.push('cell'); }
      async install() { events.push('install'); if (options.operationFail) throw Error('OP'); }
      async startAccepted(t,a,d) { events.push('accepted-argument:'+d); events.push('startAccepted'); if(options.acceptedReject) throw Error('CONFLICT'); assert.equal(d,'accepted-pin'); }
      status() { return {runtime:status}; }
      async shutdown() { events.push('shutdown'); if(options.shutdownFail) throw Error('SHUTDOWN'); status='STOPPED'; }
      close() { events.push('cell-close'); }
    } },
    'node:tls': { default: { TLSSocket: Socket, createServer(opts, handle) {
      assert.equal(opts.rejectUnauthorized,true); assert.equal(opts.requestCert,true);
      events.push('createServer'); server = new EventEmitter(); server.handle = handle; server.listening = false;
      server.listen = ({signal}) => {
        events.push('listen');
        signal.addEventListener('abort', () => {
          events.push('abort'); server.listening = false;
          if(options.closeFail) queueMicrotask(() => server.emit('error',Error('CLOSE')));
          else if(!options.deferClose) queueMicrotask(() => server.emit('close'));
        });
        if(options.bootFail) throw Error('BIND');
      };
      server.close = () => { throw Error('unexpected duplicate close'); };
      return server;
    } } }
  };
  if(!options.nullConfig) mocks['g7-owner-ingress-config.mjs'] = {default:config};
  function synth(id, values) { const keys=Object.keys(values); return new vm.SyntheticModule(keys,function(){ for(const k of keys)this.setExport(k,values[k]); },{context,identifier:id}); }
  async function load(spec, parent = root+'/entry.mjs') {
    const id=spec.startsWith('.') ? resolve(dirname(parent),spec) : spec;
    if(modules.has(id)) return modules.get(id);
    const mock=mocks[id] ?? mocks[id.split('/').at(-1)];
    const mod=mock ? synth(id,mock) : new vm.SourceTextModule(readFileSync(id,'utf8'),{context,identifier:id,initializeImportMeta(meta){meta.url='file://'+id;}});
    modules.set(id,mod);
    await mod.link((s,m)=>load(s,m.identifier)); return mod;
  }
  const mod=await load('./g7-cell-owner.mjs');
  const done=mod.evaluate().catch(e=> { if(e.message !== 'MOCK_PROCESS_EXIT' && !(options.unusableChannel && e.message === 'CUSTODY')) throw e; });
  await tick();
  return {events,sent,modules,done,server,exited:()=>exited,
    ready:async()=>{server.listening=true;server.emit('listening');await tick();},
    stop:async()=>{assert.ok(release);release('STOP');await tick();},
    origin:async()=>{const m=await load('./g7-cell-rotation.mjs');await m.evaluate();return m.namespace;},
    frame(){const socket=new Socket();server.handle(socket);const body=Buffer.from('explicit owner confirmation\nCellID=mock-cell\nSHA256=sha256:'+ 'a'.repeat(64)+'\npurpose=historical rotation pins only\ngenesis/latest/expected independently established');const h=Buffer.alloc(4);h.writeUInt32BE(body.length);socket.emit('data',Buffer.concat([h,body]));socket.emit('end');}
  };
}
test('actual owner waits for canonical boot readiness and closes before STOP report',async()=>{
 const x=await owner({deferClose:true,accepted:true});
 assert.deepEqual(x.events.slice(0,4),['guard','channel','cell','fd-close:31']);
 assert.ok(x.events.includes('listen'));assert.ok(!x.events.includes('input-open'));assert.ok(!x.events.includes('startAccepted'));
 await x.ready();assert.ok(x.events.includes('startAccepted'));
 const origin=await x.origin();x.frame();assert.notEqual(origin.inspectCheckpointOrigin('mock-cell','sha256:'+'a'.repeat(64)),'UNAVAILABLE');
 await x.stop();assert.ok(x.events.includes('abort'));assert.ok(!x.events.includes('shutdown'));assert.ok(!x.events.includes('stopped'));
 assert.equal(origin.inspectCheckpointOrigin('mock-cell','sha256:'+'a'.repeat(64)),'UNAVAILABLE');
 x.server.emit('close');await x.done;
 assert.ok(x.events.indexOf('abort')<x.events.indexOf('shutdown'));assert.ok(x.events.indexOf('shutdown')<x.events.indexOf('stopped'));assert.equal(x.exited(),0);
 assert.equal([...x.modules.keys()].filter(p=>p.endsWith('/g7-owner-ingress.mjs')).length,1);
});
test('no opt-in keeps null configuration inert and existing install contract',async()=>{
 const x=await owner({opt:false,nullConfig:true});assert.equal(x.server,undefined);assert.ok(x.events.includes('install'));await x.stop();await x.done;assert.equal(x.exited(),0);assert.ok(!x.events.includes('abort'));
});
test('opt-in cannot enable production null config',async()=>{
 const x=await owner({nullConfig:true});await x.done;assert.equal(x.server,undefined);assert.ok(!x.events.includes('install'));assert.deepEqual(x.sent,[{uncertain:true}]);assert.equal(x.exited(),1);
});
test('bind failure closes then denies without dependent operations',async()=>{
 const x=await owner({bootFail:true});await x.done;assert.ok(x.events.includes('abort'));assert.ok(!x.events.includes('input-open'));assert.equal(x.exited(),1);assert.deepEqual(x.sent,[{uncertain:true}]);
});
test('operation failure revokes immediately and waits for cleanup before uncertainty',async()=>{
 const x=await owner({operationFail:true,deferClose:true});await x.ready();assert.ok(x.events.includes('abort'));assert.ok(!x.events.includes('uncertain'));x.server.emit('close');await x.done;assert.equal(x.exited(),1);assert.deepEqual(x.sent,[{uncertain:true}]);
});
test('close failure is uncertainty, never shutdown or clean stop',async()=>{
 const x=await owner({closeFail:true});await x.ready();await x.stop();await x.done;assert.equal(x.exited(),1);assert.ok(!x.events.includes('shutdown'));assert.ok(!x.events.includes('stopped'));assert.equal(x.sent.at(-1).uncertain,true);
});
test('shutdown failure after ingress close remains uncertain',async()=>{
 const x=await owner({shutdownFail:true});await x.ready();await x.stop();await x.done;assert.equal(x.exited(),1);assert.ok(x.events.indexOf('abort')<x.events.indexOf('shutdown'));assert.ok(!x.events.includes('stopped'));
});
test('actual runtime assembly selector and inventory guard include canonical closure',async()=>{
 const text=readFileSync(root+'/g7-runtime-assembly.mjs','utf8');
 const context=vm.createContext({});
 const mod=new vm.SourceTextModule(text,{context,identifier:root+'/g7-runtime-assembly.mjs'});
 const imports={ 'node:crypto':['createHash'], 'node:module':['builtinModules','createRequire'], 'node:fs':['readFileSync','writeFileSync','readdirSync','lstatSync','mkdirSync','renameSync','rmdirSync'], './g7-runtime-layout.mjs':['dependencyLayout'], './g7-runtime-inputs.mjs':['ageInputs'], 'node:path':['resolve','join','dirname','posix'], 'node:url':['fileURLToPath'], 'node:child_process':['execFileSync'], './g7-runtime-dependencies.mjs':['assembleRuntimeDependencies'] };
 context.process={argv:[]};
 await mod.link(s=>new vm.SyntheticModule(imports[s],function(){for(const k of imports[s])this.setExport(k,()=>{throw Error('assembly I/O forbidden');});},{context}));await mod.evaluate();
 const selected=Array.from(mod.namespace.runtimeTools);assert.ok(Object.isFrozen(mod.namespace.runtimeTools));
 assert.match(text,/for \(const name of runtimeTools\)/);
 const closure=['g7-cell-owner.mjs','g7-owner-ingress-boot.mjs','g7-owner-ingress.mjs','g7-owner-ingress-config.mjs','g7-cell-rotation.mjs'];
 for(const n of closure)assert.ok(selected.includes(n),n);
 const edges=[];
 for(const n of closure)for(const m of readFileSync(root+'/'+n,'utf8').matchAll(/from ['"](\.\/[^'"]+)['"]/g)) {
  if(closure.includes(m[1].slice(2)))edges.push({from:'tools/'+n,target:'tools/'+m[1].slice(2)});
 }
 assert.ok(edges.some(e=>e.from.endsWith('boot.mjs')&&e.target.endsWith('g7-owner-ingress.mjs')));
 assert.ok(edges.some(e=>e.from.endsWith('rotation.mjs')&&e.target.endsWith('g7-owner-ingress.mjs')));
 const start=text.indexOf('  const pinnedPaths =');const end=text.indexOf('  const result =',start);assert.ok(start>0&&end>start);
 const guard=text.slice(start,end);const inventory=selected.map(n=>({path:'runtime/tools/'+n}));
 const run=inv=>vm.runInNewContext(guard,{inventory:inv,relativeEdges:edges,fail:(v,m)=>assert.ok(v,m)});
 run(inventory);assert.throws(()=>run(inventory.filter(e=>!e.path.endsWith('g7-owner-ingress-boot.mjs'))),/unpackaged relative edge/);
 assert.throws(()=>run(inventory.filter(e=>!e.path.endsWith('g7-owner-ingress-config.mjs'))),/unpackaged relative edge/);
});

const positional = ['/synthetic/root','/synthetic/input','31','32'];
const pins = [...positional,'accepted-pin','input-pin'];
const flag = '--owner-checkpoint-ingress';
const pair = [flag,'/synthetic.sock'];
const malformed = [
 ['six valid pins plus bare flag', [...pins,flag]],
 ['pair plus extra', [...pins,...pair,'extra']],
 ['duplicate pair', [...positional,...pair,...pair]],
 ['misplaced flag', [...positional,flag,'accepted-pin','input-pin']],
 ['extra positional', [...pins,'extra']],
 ['dangling after four', [...positional,flag]],
 ['duplicate bare flag', [...positional,flag,...pair]],
 ['misplaced pair before digest', [...positional,...pair,'accepted-pin']],
 ['unknown option', [...positional,'--unknown']],
 ['empty path', [...pins,flag,'']],
 ['relative path', [...pins,flag,'relative.sock']],
 ['NUL path', [...pins,flag,'/bad\0.sock']],
 ['overlong path', [...pins,flag,'/'+'x'.repeat(104)]],
 ['overlong UTF8 path', [...pins,flag,'/'+'é'.repeat(52)]],
];
for (const [name,argv] of malformed) test('grammar denies '+name,async()=>{
 const x=await owner({argv});
 // Assert before awaiting completion: an ignored flag must fail, not hang.
 for(const event of ['input-open','install','startAccepted','listen','snapshot','stopped'])
   assert.ok(!x.events.includes(event),event+' must not happen');
 assert.equal(x.server,undefined);
 await x.done;assert.equal(x.exited(),1);assert.deepEqual(x.sent,[{uncertain:true}]);
 assert.deepEqual(x.events.slice(0,4),['guard','channel','cell','fd-close:31']);
});
for (const count of [0,1,2,3]) test('short arity '+count+' with unusable channel fails custody',async()=>{
 const x=await owner({argv:positional.slice(0,count),unusableChannel:true});await x.done;
 assert.deepEqual(x.events,['custody-denied']);assert.deepEqual(x.sent,[]);
});
for(const count of [4,5,6]) for(const opt of [false,true])
 test('valid positional arity '+count+' opt-in '+opt+' preserves digest bindings',async()=>{
 const x=await owner({argv:[...pins.slice(0,count),...(opt?pair:[])]});
 if(opt){assert.ok(!x.events.includes('input-open'));await x.ready();}
 assert.ok(x.events.includes(count===4?'install':'startAccepted'));
 assert.equal(x.events.includes('accepted-argument:accepted-pin'),count>4);
 await x.stop();await x.done;assert.equal(x.exited(),0);
 });
for(const value of ['wrong-input-pin','accepted-pin',''])
 test('production owner input digest guard rejects '+JSON.stringify(value),async()=>{
 const x=await owner({argv:[...positional,'accepted-pin',value]});await x.done;
 assert.ok(x.events.includes('input-open'));assert.ok(!x.events.includes('startAccepted'));
 assert.ok(!x.events.includes('install'));assert.deepEqual(x.sent,[{uncertain:true}]);assert.equal(x.exited(),1);
 });
test('accepted digest negative is Cell rejection propagation and argument binding only',async()=>{
 const x=await owner({argv:[...positional,'wrong-accepted-pin','input-pin'],acceptedReject:true});await x.done;
 assert.ok(x.events.includes('accepted-argument:wrong-accepted-pin'));
 assert.deepEqual(x.sent,[{uncertain:true}]);assert.equal(x.exited(),1);
});
test('swapped digest pins deny in production input guard',async()=>{
 const x=await owner({argv:[...positional,'input-pin','accepted-pin']});await x.done;
 assert.ok(!x.events.includes('startAccepted'));assert.deepEqual(x.sent,[{uncertain:true}]);assert.equal(x.exited(),1);
});
