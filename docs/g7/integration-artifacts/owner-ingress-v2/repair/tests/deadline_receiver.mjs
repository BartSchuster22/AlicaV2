import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
const original=process.argv[2]==='original';
const source=fs.readFileSync(new URL(original?'../../tools/g7-owner-ingress.mjs':'../tools/g7-owner-ingress.mjs',import.meta.url),'utf8');
const frame=fs.readFileSync(new URL('./synthetic.frame',import.meta.url));
let now=0,next=0;const timers=new Map();
const context=vm.createContext({Buffer,process:{getuid:()=>1000}});
const deps={
 'node:tls':{default:{TLSSocket:class{},createServer(){throw Error('NO SERVER');}}},
 'node:crypto':{createHash},'./g7-owner-ingress-config.mjs':{default:null},
 'node:perf_hooks':{performance:{now:()=>now}},
 'node:timers':{setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)}
};
const m=new vm.SourceTextModule(source,{context});
await m.link(spec=>{assert(deps[spec]);const values=deps[spec];return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate({timeout:100});
const cfg={gatewayUID:1001,receiverUID:1000,candidateUID:1002,gatewayCertificateSHA256:'b'.repeat(64)};
class Socket extends EventEmitter{
 setTimeout(ms,fn){this.inactivity=ms;this.timeout=fn;}
 destroy(){this.destroyed=true;}
}
const digest='sha256:'+'a'.repeat(64);
let cases=0;
function setup(identify=()=>cfg.gatewayCertificateSHA256){now=0;assert.equal(timers.size,0);const ingress=m.namespace.createIngress(cfg,identify);const s=new Socket();ingress.handle(s);return {ingress,s};}
function empty(ingress){assert.equal(ingress.read('SYNTHETIC_CELL',digest),undefined);}
function released(ingress){const fresh=new Socket();ingress.handle(fresh);assert(!fresh.destroyed);fresh.emit('error',Error('synthetic'));assert(fresh.destroyed);assert.equal(timers.size,0);}
// Drip feed with no inactivity callback. Late EOF must never commit, even when
// absolute timer dispatch is deliberately withheld (scheduler delay model).
{
 const {ingress,s}=setup();s.emit('data',frame.subarray(0,2));now=1900;s.emit('data',frame.subarray(2,10));now=2001;s.emit('data',frame.subarray(10));s.emit('end');empty(ingress);assert(s.destroyed);assert.equal(timers.size,0);released(ingress);cases++;
}
for(const time of [1999,2000,2001]){
 const {ingress,s}=setup();s.emit('data',frame);now=time;s.emit('end');assert.equal(!!ingress.read('SYNTHETIC_CELL',digest),time<2000);assert.equal(timers.size,0);assert.equal(s.inactivity,0);released(ingress);cases++;
}
// Timer expiry without any new event actively closes/releases the only slot.
{
 const {ingress,s}=setup();now=2000;for(const {fn}of [...timers.values()])fn();assert(s.destroyed);s.emit('data',frame);s.emit('end');empty(ingress);released(ingress);cases++;
}
for(const event of ['error','close']){
 const {ingress,s}=setup();s.emit(event,Error('cancel/error'));s.emit('data',frame);s.emit('end');empty(ingress);assert.equal(timers.size,0);released(ingress);cases++;
}
{
 const {ingress,s}=setup();const denied=new Socket();ingress.handle(denied);assert(denied.destroyed);assert.equal(timers.size,1);s.emit('close');released(ingress);cases++;
}
{
 let calls=0;const {ingress,s}=setup(()=>{if(++calls===2)now=2000;return cfg.gatewayCertificateSHA256;});s.emit('data',frame);s.emit('end');empty(ingress);assert.equal(timers.size,0);cases++;
}
{
 const {ingress,s}=setup(()=>{throw Error('identity error');});assert(s.destroyed);assert.equal(timers.size,0);empty(ingress);cases++;
}
for(const invalid of [Buffer.alloc(2053),frame.subarray(0,-1)]){
 const {ingress,s}=setup();s.emit('data',invalid);s.emit('end');empty(ingress);assert.equal(timers.size,0);released(ingress);cases++;
}
console.log('PASS receiver total deadline:',cases,'deterministic synthetic cases; zero real sockets/timer sleeps');
