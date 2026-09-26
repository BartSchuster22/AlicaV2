import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import tls from 'node:tls';
import { EventEmitter } from 'node:events';
import { createIngress, lookupOwnerCheckpointConfirmation, createOwnerCheckpointReceiver } from '../tools/g7-owner-ingress.mjs';
const frame=fs.readFileSync(new URL('./synthetic.frame',import.meta.url));
const config={gatewayCertificateSHA256:'b'.repeat(64),gatewayUID:process.getuid()+1,receiverUID:process.getuid(),candidateUID:process.getuid()+2};
const digest='sha256:'+'a'.repeat(64);
let assertions=0;
const check=x=>{assert.ok(x);assertions++;};
class Socket extends EventEmitter {
 constructor(identity=config.gatewayCertificateSHA256){super();this.identity=identity;this.destroyed=false;}
 setTimeout(n,fn){if(n===0)return;check(n===2000);this.timeout=fn;}
 destroy(){this.destroyed=true;}
}
const identify=s=>s.identity; // EXPLICIT synthetic authenticated-transport identity injection.
const ingress=createIngress(config,identify);
// Exercise actual production server construction against a socket-boundary mock.
// No TLS socket, key parsing, network bind, or credential provisioning occurs.
const originalCreateServer=tls.createServer;
try {
 tls.createServer=(options,handler)=>{
  check(options.requestCert===true&&options.rejectUnauthorized===true);
  check(options.handshakeTimeout===2000&&options.minVersion==='TLSv1.2');
  check(handler===ingress.handle);return {};
 };
 check(ingress.createServer({key:'SYNTHETIC',cert:'SYNTHETIC',ca:'SYNTHETIC'}).maxConnections===1);
} finally {tls.createServer=originalCreateServer;}

function send(bridge,bytes=frame,identity=config.gatewayCertificateSHA256){
 const s=new Socket(identity);bridge.handle(s);
 if(!s.destroyed){s.emit('data',bytes.subarray(0,2));s.emit('data',bytes.subarray(2,17));s.emit('data',bytes.subarray(17));s.emit('end');}
 return s;
}
check(lookupOwnerCheckpointConfirmation('SYNTHETIC_CELL',digest)===undefined);
assert.throws(()=>createOwnerCheckpointReceiver(), /UNCONFIGURED/);assertions++;
check(send(ingress,frame,'c'.repeat(64)).destroyed);
check(ingress.read('SYNTHETIC_CELL',digest)===undefined);
// Default production identity extractor rejects a fake socket even with pin text.
const noFake=createIngress(config);send(noFake);check(noFake.read('SYNTHETIC_CELL',digest)===undefined);
// Private adapter lookup runs actual candidate source with linkage to this
// synthetic ingress; no replacement of lexical lookup or origin classifier.
const source=fs.readFileSync(new URL('../tools/g7-cell-rotation.mjs',import.meta.url),'utf8');
const context=vm.createContext({});
const dependency=new vm.SyntheticModule(['lookupOwnerCheckpointConfirmation'],function(){this.setExport('lookupOwnerCheckpointConfirmation',ingress.read);},{context});
const cell=new vm.SourceTextModule(source,{context});
await cell.link(spec=>{assert.equal(spec,'./g7-owner-ingress.mjs');return dependency;});await cell.evaluate();
check(cell.namespace.inspectCheckpointOrigin('SYNTHETIC_CELL',digest)==='UNAVAILABLE');
// Real frame came from raw gateway method -> actual encoder -> TLS send mock.
send(ingress);
check(cell.namespace.inspectCheckpointOrigin('SYNTHETIC_CELL',digest)==='ESTABLISHED');
check(cell.namespace.inspectCheckpointOrigin('OTHER',digest)==='UNAVAILABLE');
check(cell.namespace.inspectCheckpointOrigin('SYNTHETIC_CELL','sha256:'+'c'.repeat(64))==='UNAVAILABLE');
const record=ingress.read('SYNTHETIC_CELL',digest);check(Object.isFrozen(record));
assert.throws(()=>{record.purpose='recovery';});assertions++;
check(record.confirmationEvidence===frame.subarray(4).toString().split('\ngenesis/')[0]);
for(const bytes of [Buffer.alloc(0),frame.subarray(0,-1),Buffer.concat([frame,Buffer.from('x')]),Buffer.concat([frame,frame]),Buffer.alloc(2053),Buffer.from([0,0,0,0]),Buffer.from([0,0,8,1])]){
 const b=createIngress(config,identify);send(b,bytes);check(b.read('SYNTHETIC_CELL',digest)===undefined);
}
function pack(text){const b=Buffer.from(text);const h=Buffer.alloc(4);h.writeUInt32BE(b.length);return Buffer.concat([h,b]);}
for(const text of [frame.subarray(4).toString()+'\n',frame.subarray(4).toString().replace('only','recovery'),JSON.stringify(record),'LLM approval',frame.subarray(4).toString().replace('established','assumed')]){
 const b=createIngress(config,identify);send(b,pack(text));check(b.read('SYNTHETIC_CELL',digest)===undefined);
}
for(const c of [null,{}, {...config,receiverUID:config.candidateUID},{...config,gatewayUID:config.candidateUID}]){
 const b=createIngress(c,identify);send(b);check(b.read('SYNTHETIC_CELL',digest)===undefined);
}
// Authenticated connection identity is rechecked before commit.
const b=createIngress(config,identify),s=new Socket();b.handle(s);s.emit('data',frame);s.identity='c'.repeat(64);s.emit('end');check(b.read('SYNTHETIC_CELL',digest)===undefined);
const timeout=createIngress(config,identify),t=new Socket();timeout.handle(t);t.emit('data',frame);t.timeout();t.emit('end');check(timeout.read('SYNTHETIC_CELL',digest)===undefined);
const bound=createIngress(config,identify);
for(let i=0;i<65;i++)send(bound,pack(frame.subarray(4).toString().replace('SYNTHETIC_CELL','CELL'+i)));
check(bound.read('CELL63',digest)!==undefined);check(bound.read('CELL64',digest)===undefined);
// Existing exported old-reader/classifier behavior retains fail-closed actions.
assert.throws(()=>cell.namespace.requireOrdinaryCellRoot(['rotations']));assertions++;
const denied=cell.namespace.classifyStoppedRotationRecovery({});
check(denied.executionAuthorized===false&&denied.updateTrust===false&&denied.activationReplay===false);
console.log('PASS actual receiver + private lookup + origin:',assertions,'assertions; no real TLS/OS isolation evidence');
