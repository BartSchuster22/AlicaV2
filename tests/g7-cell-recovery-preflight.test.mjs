// Audited closure: node assert/fs/crypto/vm/path only in this harness.
// Cell is parse-only. Exact preflight/run/guard/journal/config fragments execute
// with explicit established-API mocks, NOT native/Kernel/real Cell evaluation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import * as path from 'node:path';
const root = new URL('../', import.meta.url);
const cell = readFileSync(new URL('tools/g7-cell.mjs', root), 'utf8');
const helper = readFileSync(new URL('tools/g7-cell-rotation.mjs', root), 'utf8');
const durable = readFileSync(new URL('tools/g7-durable.mjs', root), 'utf8');
const sha = s => 'sha256:' + createHash('sha256').update(s).digest('hex');
const canonical = v => v === null || typeof v !== 'object' ? JSON.stringify(v) :
  Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' :
    '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
const digest = v => sha(canonical(v));
const clone = v => JSON.parse(JSON.stringify(v));
const check = (v, code = 'INVALID_ARGUMENT') => { if (!v) throw Object.assign(Error(code), { code }); };
const slice = (s, a, b) => {
  assert.equal(s.split(a).length, 2, a); assert.equal(s.split(b).length, 2, b);
  return s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));
};
const context = vm.createContext({ Buffer, process: { pid: 4242 }, console },
  { codeGeneration: { strings: false, wasm: false } });
const deny = spec => { throw Error('UNMAPPED IMPORT: ' + spec); };
new vm.SourceTextModule(cell, { context, importModuleDynamically: deny }); // parse only
const h = new vm.SourceTextModule(helper, { context, importModuleDynamically: deny });
assert.deepEqual(h.dependencySpecifiers, []); await h.link(deny); await h.evaluate({ timeout: 1000 });
const j = new vm.SourceTextModule('export const parse = JSON.parse;', { context });
await j.link(deny); await j.evaluate();
const norm = v => j.namespace.parse(JSON.stringify(v));
const synthetic = async (values) => {
  const m = new vm.SyntheticModule(Object.keys(values), function () {
    for (const [k,v] of Object.entries(values)) this.setExport(k,v);
  }, { context }); await m.link(deny); await m.evaluate(); return m;
};
let fixture, calls, reads, lists, closed, mutation, inspectionMode, lost, rootState;
const cellSchema = (name, v) => {
  if (name === 'floor') {
    assert.deepEqual(Object.keys(v).sort(), ['lastWallMs','policyVersion','revocationVersion','rootKeyId']);
    check(['lastWallMs','policyVersion','revocationVersion'].every(k => Number.isSafeInteger(v[k]) && v[k] >= 0));
  } else if (name === 'accepted') {
    assert.deepEqual(Object.keys(v).sort(), ['cellId','release','schemaVersion','sequence','transactionId','trustFloor']);
    check(v.schemaVersion === 'alica.cell-accepted/v1'); cellSchema('floor', v.trustFloor);
  } else if (name === 'journal') {
    check(v.record.schemaVersion === 'alica.cell-journal/v1'); cellSchema('floor', v.record.trustFloor);
  } else throw Error('UNMAPPED SCHEMA');
  return v;
};
const constants = slice(cell, 'const same = ', '// Cross-transaction validation');
const configuration = slice(cell, 'function configuration(', '// Standalone instances');
const runFragment = slice(cell, '  async #run(', '  initialize(material, floor)');
const guard = slice(cell, '  #guard() {', '  // Read-only snapshot assessment');
const methods = slice(cell, '  ownedInspectRotationRecovery(', '  #read(p, max) {');
assert(!/bootstrap\(|updateTrust\(|#write\(|#advance\(|#stage\(|#status\(|#base\(/.test(methods));
const assembled = `
import { inspectPersistedTrust, verifyHistoricalTrustTransition } from '@alica/kernel';
import { parse, canonical, digest, rawDigest, check } from '@alica/acap-contracts';
import { readPrivate, listPrivateBounded, openPrivateRoot, closeSync } from 'mock:durable-boundary';
import { resolve, dirname, basename } from 'node:path';
import { validateRotationHistoryStructure } from './g7-cell-rotation.mjs';
import { cellSchema, limits, outcome } from 'mock:existing-cell-validation';
${constants}\n${configuration}
export class Harness {
  #fd = 7; #root = '/cell'; #session = true; #owned = true; #watch;
  #stopped = true; #serving = false; #running = false; #host;
  #cleanupUncertain = false; #priorRecovery; #failed = false; #busy = false;
  constructor(watch, state) { this.#watch = watch;
    if (state === 'no-session') this.#session = false;
    if (state === 'no-owned') this.#owned = false;
    if (state === 'no-watch') this.#watch = undefined;
    if (state === 'running') this.#running = true;
    if (state === 'serving') this.#serving = true;
    if (state === 'host') this.#host = {};
    if (state === 'uncertain') this.#cleanupUncertain = true;
    if (state === 'prior-recovery') this.#priorRecovery = 'digest';
    if (state === 'failed') this.#failed = true;
    if (state === 'busy') this.#busy = true;
    if (state === 'not-stopped') this.#stopped = false;
  }
${runFragment}\n${guard}\n${methods}
}`;
const imports = new Map([
  ['@alica/acap-contracts', await synthetic({ canonical, digest, rawDigest: sha, check,
    parse: (b, max = 16384) => { check(Buffer.byteLength(b) <= max, 'RESOURCE_EXHAUSTED'); return norm(JSON.parse(b)); } })],
  ['node:path', await synthetic({ resolve: path.resolve, dirname: path.dirname, basename: path.basename })],
  ['./g7-cell-rotation.mjs', h],
  ['mock:existing-cell-validation', await synthetic({ cellSchema,
    limits: { journalRecords: 4096, journalRecordBytes: 16384 }, outcome: e => e })],
  ['mock:durable-boundary', await synthetic({
    openPrivateRoot: p => { assert.equal(p, '/anchors'); reads++; return 8; },
    closeSync: fd => { assert.equal(fd, 8); closed++; },
    readPrivate: (fd, p, max) => {
      reads++; assert([7,8].includes(fd)); assert(Number.isSafeInteger(max) && max > 0 && max <= 65536);
      const key = fd === 8 ? 'CHECKPOINT' : p;
      if (fixture.ioError === key) throw Object.assign(Error('nofollow'), { code: 'ELOOP' });
      check(fixture.files.has(key), 'ENOENT');
      const b = fixture.files.get(key); check(b.length <= max, 'RESOURCE_EXHAUSTED'); return Buffer.from(b);
    },
    listPrivateBounded: (fd, p, max) => {
      assert.equal(fd, 7); lists++; const a = fixture.dirs.get(p ?? 'ROOT'); check(a, 'ENOENT');
      check(a.length <= max, 'RESOURCE_EXHAUSTED'); return norm(a.slice().sort());
    },
  })],
  ['@alica/kernel', await synthetic({ verifyHistoricalTrustTransition: undefined, inspectPersistedTrust: (configText, options) => {
    calls++; const config = JSON.parse(configText);
    assert.equal(config.cellId, 'cell1'); assert.equal(config.rootScope, 'root');
    assert.equal(config.timeTrusted, true); assert.equal(config.maxCallMs, 1000);
    assert.deepEqual(Object.keys(options).sort(), ['independentPin','nextTrust','priorTrust','rotation','statePath']);
    assert.equal(options.statePath, '/proc/4242/fd/7/kernel.json');
    const p = fixture.chain.at(-1), b = fixture.checkpoint.lineage.expected.at(-1).binding;
    assert.equal(canonical(options.independentPin), canonical({ cellId: 'cell1', priorTrustDigest: b.priorTrustDigest,
      nextTrustDigest: b.nextTrustDigest, rotationDigest: b.rotationDigest }));
    for (const k of ['priorTrust','nextTrust','rotation'])
      assert.equal(canonical(options[k]), canonical(p.entries[0].item.record.details[k]));
    if (mutation) mutation(fixture);
    if (inspectionMode === 'throw') throw Error('mock inspection error');
    if (inspectionMode === 'unresolved') return norm({schemaVersion:'alica.trust-inspection/v1',classification:'UNRESOLVED'});
    const m = inspectionMode === 'prior' ? options.priorTrust : options.nextTrust;
    const f = summaryFloor(m, fixture.time);
    const out = { schemaVersion: 'alica.trust-inspection/v1', cellId: 'cell1',
      classification: inspectionMode === 'prior' ? 'EXACT_PRIOR' : 'EXACT_NEXT',
      policyVersion: f.policyVersion, policyDigest: f.policyDigest,
      revocationVersion: f.revocationVersion, revocationDigest: f.revocationDigest, lastWallMs: f.lastWallMs };
    if (inspectionMode === 'bad-digest') out.policyDigest = sha('substitute');
    if (inspectionMode === 'bad-time') out.lastWallMs = Number.MAX_SAFE_INTEGER + 1;
    return norm(out);
  } })],
]);
const m = new vm.SourceTextModule(assembled, { context, importModuleDynamically: deny });
assert.deepEqual([...m.dependencySpecifiers].sort(), [...imports.keys()].sort());
await m.link(spec => imports.get(spec) ?? deny(spec)); await m.evaluate({ timeout: 1000 });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const trust = n => ({ rootKeyId: sha('root'+n), policy: { version:n, mock:'UNSIGNED' }, revocation:{version:1,mock:'UNSIGNED'} });
const cellFloor = (m, t) => ({rootKeyId:m.rootKeyId,policyVersion:m.policy.version,revocationVersion:m.revocation.version,lastWallMs:t});
const summaryFloor = (m,t) => ({...cellFloor(m,t),policyDigest:digest(m.policy),revocationDigest:digest(m.revocation)});
const release = n => Object.fromEntries(['bundleDigest','profileDigest','lockDigest','policyDigest','authorizationDigest'].map(k=>[k,sha(k+n)]));
function make(count=1) {
  const files = new Map(), dirs = new Map(), chain=[], inventory=[];
  const put = (p,v) => files.set(p,Buffer.from(canonical(v)));
  const acceptance = n => ({schemaVersion:'alica.cell-accepted/v1',cellId:'cell1',transactionId:id(n),sequence:n,
    release:release(n),trustFloor:cellFloor(trust(n),n*10)});
  const summary = n => ({cellId:'cell1',transactionId:id(n),revision:n,releaseDigest:digest(release(n)),floor:summaryFloor(trust(n),n*10)});
  const journal = n => {
    const rows=[]; let previousHash=null;
    for (const [i,state] of ['STAGING','VERIFIED','ACTIVATING','COMMITTED'].entries()) {
      const record={schemaVersion:'alica.cell-journal/v1',cellId:'cell1',transactionId:id(n),sequence:i+1,
        priorRevision:n-1,targetRevision:n,operation:n===1?'install':'upgrade',state,prior:n===1?null:release(n-1),
        target:release(n),trustFloor:cellFloor(trust(n),n*10),previousHash,outcome:state==='COMMITTED'?'OK':'PENDING'};
      const row={record,checksum:digest(record)}; rows.push(row); previousHash=row.checksum;
      put('transactions/'+id(n)+'/'+String(i+1).padStart(6,'0')+'.json',row);
    }
    dirs.set('transactions/'+id(n), ['000001.json','000002.json','000003.json','000004.json']); return rows.at(-1).checksum;
  };
  let terminal = journal(1), previous=null;
  for (let n=1;n<=count;n++) {
    inventory.push({transactionId:id(n),terminalChecksum:terminal});
    const rotation={mock:'UNSIGNED edge '+n};
    const b={cellId:'cell1',rotationId:id(100+n),priorAcceptedDigest:digest(summary(n)),priorRevision:n,
      inventoryDigest:digest(inventory),previousTransitionDigest:previous,oldFloor:summaryFloor(trust(n),n*10+1),
      priorTrustDigest:digest(trust(n)),nextTrustDigest:digest(trust(n+1)),rotationDigest:digest(rotation),
      targetTransactionId:id(n+1),targetReleaseDigest:digest(release(n+1)),targetRevision:n+1};
    const details=[{priorTrust:trust(n),nextTrust:trust(n+1),rotation},
      {classification:'EXACT_NEXT',nextFloor:summaryFloor(trust(n+1),(n+1)*10)},
      {accepted:summary(n+1),finalFloor:summaryFloor(trust(n+1),(n+1)*10+1)}];
    let hash=null; const entries=details.map((details,i)=>{
      const record={schemaVersion:'alica.cell-rotation-history/v1',sequence:i+1,previousHash:hash,
        phase:['PREPARED','TRUST_COMMITTED','COMPLETE'][i],binding:clone(b),details};
      const item={record,checksum:digest(record)}; hash=item.checksum;
      const p='rotations/'+b.rotationId+'/'+String(i+1).padStart(6,'0')+'.json';put(p,item);return {path:p,item};
    });
    chain.push({entries,expected:{binding:b,inventory:clone(inventory)}});
    dirs.set('rotations/'+b.rotationId,['000001.json','000002.json','000003.json']); previous=hash;terminal=journal(n+1);
  }
  const checkpoint={schemaVersion:'alica.cell-rotation-checkpoint/v1',cellId:'cell1',lineage:{
    genesis:{accepted:summary(1),trustDigest:digest(trust(1)),floor:summaryFloor(trust(1),11)},
    latest:{rotationId:chain.at(-1).expected.binding.rotationId,terminalDigest:previous},
    expected:chain.map(p=>clone(p.expected))}};
  put('CHECKPOINT',checkpoint); put('identity.json',{schemaVersion:'alica.cell-identity/v1',cellId:'cell1'});
  const accepted=acceptance(count+1);put('accepted.json',accepted);put('floor.json',cellFloor(trust(count+1),(count+1)*10+1));
  put('kernel.json',{opaque:'MOCK ONLY'});
  dirs.set('ROOT',['identity.json','accepted.json','floor.json','kernel.json','rotations','transactions','releases','supervision']);
  dirs.set('rotations',chain.map(p=>p.expected.binding.rotationId));dirs.set('transactions',Array.from({length:count+1},(_,i)=>id(i+1)));
  return {files,dirs,chain,checkpoint,accepted,time:(count+1)*10+1,put};
}
let cases=0;
async function run(label, edit=()=>{}, expected='DENIED', reason, count=1) {
  fixture=make(count);calls=reads=lists=closed=0;mutation=null;inspectionMode='next';lost=false;rootState='';
  edit(fixture);
  const watch={stopped:{status:'STOPPED',sequence:fixture.accepted.sequence,acceptedDigest:digest(fixture.accepted)},
    assert(){check(!lost,'CUSTODY_LOST');}};
  if (rootState==='no-reap') watch.stopped=undefined;
  if (rootState==='wrong-reap') watch.stopped.acceptedDigest=sha('wrong');
  const instance=new m.namespace.Harness(watch,rootState);
  let out;
  try { out=await instance.ownedInspectRotationRecovery('/anchors/checkpoint.json'); }
  catch(e) { out={status:'DENIED',reason:e.code}; }
  assert.equal(out.status,expected,label+': '+JSON.stringify(out));
  if(reason) assert.equal(out.reason,reason,label);
  if(out.executionAuthorized!==undefined){assert.equal(out.executionAuthorized,false);assert.equal(out.authenticatedHistory,false);
    assert.equal(out.updateTrust,false);assert.equal(out.activationReplay,false);assert.equal(out.disposition,'NEEDS_OPERATOR');}
  if(expected==='UNAVAILABLE') {assert.equal(calls,1);assert.equal(out.structurallyValid,true);assert.equal(closed,1);}
  cases++; return out;
}
await run('one edge assessed, no admission',()=>{},'UNAVAILABLE','ADMISSION_EVIDENCE_UNAVAILABLE');
await run('older edge auth unavailable',()=>{},'UNAVAILABLE','HISTORICAL_AUTHENTICATION_UNAVAILABLE',2);
const multi = await run('three mapped edges',()=>{},'UNAVAILABLE','HISTORICAL_AUTHENTICATION_UNAVAILABLE',3);
assert.deepEqual(Array.from(multi.missing), ['historicalSignatureAPI','currentEligibility',
  'independentReplacementAuthorization','durabilityEvidence','failureInclusiveNumericFit']);
await run('eight edges fit snapshot bounds',()=>{},'UNAVAILABLE','HISTORICAL_AUTHENTICATION_UNAVAILABLE',8);
await run('cumulative raw snapshot or operation bound',()=>{},'DENIED','RESOURCE_EXHAUSTED',12);
for(const state of ['no-session','no-owned','no-watch','running','serving','host','uncertain','prior-recovery','failed','busy','not-stopped','no-reap']) {
  await run(state,()=>{rootState=state;});assert.equal(reads,0,state+' read before custody');assert.equal(calls,0);
}
await run('wrong reap binding',()=>{rootState='wrong-reap';},'DENIED','REAP_BINDING_MISMATCH');
const cpEdit=fn=>f=>{fn(f.checkpoint);f.put('CHECKPOINT',f.checkpoint);};
for (const value of [null,undefined]) await run('missing mandatory lineage',cpEdit(c=>{c.lineage=value;}));
await run('request booleans rejected',cpEdit(c=>{c.authenticatedHistory=true;}));
await run('missing genesis',cpEdit(c=>{delete c.lineage.genesis;}));
await run('latest anchor substitution',cpEdit(c=>{c.lineage.latest.terminalDigest=sha('wrong');}),'DENIED','LINEAGE_INVALID');
await run('genesis anchor substitution',cpEdit(c=>{c.lineage.genesis.trustDigest=sha('wrong');}),'DENIED','LINEAGE_INVALID');
await run('truncated mapped rotations',f=>{f.dirs.get('rotations').pop();});
await run('extra rotation',f=>{f.dirs.get('rotations').push(id(999));});
await run('incomplete rows',f=>{f.dirs.get('rotations/'+id(101)).splice(1,1);});
await run('extra root residue',f=>{f.dirs.get('ROOT').push('kernel.json.next');});
await run('missing journal mapping',f=>{f.files.delete('transactions/'+id(1)+'/000004.json');});
await run('inventory checksum mismatch',cpEdit(c=>{c.lineage.expected[0].inventory[0].terminalChecksum=sha('wrong');}));
await run('unmapped floor',f=>{f.put('floor.json',cellFloor(trust(99),21));});
await run('unsafe numeric floor',f=>{f.put('floor.json',{...cellFloor(trust(2),21),policyVersion:2**53});});
await run('file bound',f=>{f.files.set('floor.json',Buffer.alloc(16385));},'DENIED','RESOURCE_EXHAUSTED');
await run('checkpoint bound',f=>{f.files.set('CHECKPOINT',Buffer.alloc(65537));},'DENIED','RESOURCE_EXHAUSTED');
await run('directory bound',f=>{f.dirs.set('ROOT',Array(33).fill('x'));},'DENIED','RESOURCE_EXHAUSTED');
await run('journal count bound',f=>{f.dirs.set('transactions/'+id(1),Array(33).fill('x'));},'DENIED','RESOURCE_EXHAUSTED');
for(const p of ['CHECKPOINT','identity.json','accepted.json','floor.json','kernel.json','rotations/'+id(101)+'/000001.json'])
  await run('nofollow boundary '+p,f=>{f.ioError=p;},'DENIED','ELOOP');
for(const mode of ['unresolved','throw','bad-digest','bad-time','prior']) await run('inspection '+mode,()=>{inspectionMode=mode;});
await run('anchor recheck',()=>{mutation=f=>f.files.set('CHECKPOINT',Buffer.from('{}'));},'DENIED','SNAPSHOT_CHANGED');
await run('history recheck',()=>{mutation=f=>f.files.set(f.chain[0].entries[0].path,Buffer.from('{}'));},'DENIED','SNAPSHOT_CHANGED');
await run('opaque recheck',()=>{mutation=f=>f.files.set('kernel.json',Buffer.from('{}'));},'DENIED','SNAPSHOT_CHANGED');
await run('inventory recheck',()=>{mutation=f=>f.dirs.get('ROOT').push('new');},'DENIED','SNAPSHOT_CHANGED');
await run('custody lost after inspection',()=>{mutation=()=>{lost=true;};},'DENIED','CUSTODY_LOST');

// Prior release is a real release envelope, not an accepted-summary digest.
function rewriteJournal(f, transaction, edit) {
  let previousHash=null;
  for(const name of f.dirs.get('transactions/'+transaction)) {
    const p='transactions/'+transaction+'/'+name, row=JSON.parse(f.files.get(p));
    edit(row.record);row.record.previousHash=previousHash;
    row.checksum=digest(row.record);previousHash=row.checksum;f.put(p,row);
  }
  return previousHash;
}
function resealHistory(f) {
  let previous=null;
  for(const [i,p] of f.chain.entries()) {
    const e=f.checkpoint.lineage.expected[i];
    e.binding.previousTransitionDigest=previous;e.binding.inventoryDigest=digest(e.inventory);
    let hash=null;
    for(const row of p.entries) {
      row.item.record.binding=clone(e.binding);row.item.record.previousHash=hash;
      row.item.checksum=digest(row.item.record);hash=row.item.checksum;f.put(row.path,row.item);
    }
    previous=hash;
  }
  f.checkpoint.lineage.latest.terminalDigest=previous;f.put('CHECKPOINT',f.checkpoint);
}
async function priorDenied(label,edit,count=1) {
  const out=await run(label,edit,'DENIED','PRIOR_RELEASE_MISMATCH',count);
  assert.equal(calls,0,label+' called inspection');assert.notEqual(out.structurallyValid,true);
}
await priorDenied('original independent release999 resealed counterexample',f=>{
  rewriteJournal(f,id(2),r=>{r.prior=release(999);});
});
for(const edge of [1,2,3]) await priorDenied('each retained preceding acceptance '+edge,f=>{
  const terminal=rewriteJournal(f,id(edge+1),r=>{r.prior=release(999);});
  for(const e of f.checkpoint.lineage.expected)
    for(const t of e.inventory) if(t.transactionId===id(edge+1))t.terminalChecksum=terminal;
  resealHistory(f);
},3);
await priorDenied('null prior',f=>{rewriteJournal(f,id(2),r=>{r.prior=null;});});
await priorDenied('one prior digest substituted in every row',f=>{
  rewriteJournal(f,id(2),r=>{r.prior.authorizationDigest=sha('wrong');});
});
// A fresh ID is supported when actually bound by the retained history. This is
// not permission to reinterpret an old history target as a replacement ID.
function freshBound(f) {
  const old=id(2), fresh=id(900), names=f.dirs.get('transactions/'+old);
  for(const name of names) {
    const p='transactions/'+old+'/'+name,q='transactions/'+fresh+'/'+name;
    f.files.set(q,f.files.get(p));f.files.delete(p);
  }
  f.dirs.delete('transactions/'+old);f.dirs.set('transactions/'+fresh,names);
  f.dirs.set('transactions',[id(1),fresh]);
  rewriteJournal(f,fresh,r=>{r.transactionId=fresh;r.operation='recover';});
  f.accepted.transactionId=fresh;f.put('accepted.json',f.accepted);
  f.checkpoint.lineage.expected[0].binding.targetTransactionId=fresh;
  f.chain[0].entries[2].item.record.details.accepted.transactionId=fresh;
  resealHistory(f);
}
await run('fresh history-bound recover transaction',freshBound,'UNAVAILABLE','ADMISSION_EVIDENCE_UNAVAILABLE');
await priorDenied('fresh history-bound recover wrong prior',f=>{
  freshBound(f);rewriteJournal(f,id(900),r=>{r.prior=release(999);});
});
await run('fresh replacement cannot bypass original target binding',f=>{
  freshBound(f);f.checkpoint.lineage.expected[0].binding.targetTransactionId=id(2);resealHistory(f);
});assert.equal(calls,0);
console.log('PASS added prior-binding regressions: 9; no fresh-recovery execution claim');

console.log('PASS actual Cell method fragments:',cases,'mock-only cases; no authentication/admission qualification');
// Entire durable source evaluated only against this closed, write-denying map.
let emitted=0, closes=0, fdCloses=0, maximumEntries=0, directoryError=false, symlink=false, flags=[];
const C={O_RDONLY:0,O_DIRECTORY:1,O_NOFOLLOW:2,O_NONBLOCK:4};
const forbidden=()=>{throw Error('FORBIDDEN WRITE EFFECT');};
const fsMock={constants:C,openSync:(p,f)=>{flags.push(f);if(symlink)throw Object.assign(Error('symlink'),{code:'ELOOP'});return 19;},
  closeSync:()=>{fdCloses++;},fstatSync:()=>({uid:1000,mode:0o700,isDirectory:()=>true}),
  opendirSync:(p,o)=>{assert.equal(o.bufferSize,1);return {readSync(){if(directoryError)throw Error('read failed');
    return emitted++<maximumEntries?{name:'n'+emitted}:null;},closeSync(){closes++;}};},
  mkdirSync:forbidden,linkSync:forbidden,unlinkSync:forbidden,renameSync:forbidden,writeSync:forbidden,
  fsyncSync:forbidden,readSync:forbidden,statfsSync:forbidden,readdirSync:forbidden};
const dc=vm.createContext({process:{getuid:()=>1000},Buffer},{codeGeneration:{strings:false,wasm:false}});
const dm=new vm.SourceTextModule(durable,{context:dc,importModuleDynamically:deny});
const dmap=new Map();
for(const [spec,v] of [['node:fs',fsMock],['node:crypto',{randomUUID:forbidden}],
  ['@alica/acap-contracts',{check,rawDigest:sha}],['./g7-archive.mjs',{safePath:p=>{check(!p.includes('..')&&!p.startsWith('/'));return p;}}]]) {
 const x=new vm.SyntheticModule(Object.keys(v),function(){for(const[k,z]of Object.entries(v))this.setExport(k,z);},{context:dc});
 await x.link(deny);await x.evaluate();dmap.set(spec,x);
}
assert.deepEqual([...dm.dependencySpecifiers].sort(),[...dmap.keys()].sort());
await dm.link(spec=>dmap.get(spec)??deny(spec));await dm.evaluate({timeout:1000});
let dcases=0;
for(const n of [0,1,32,256]) {emitted=closes=0;maximumEntries=n;
 assert.equal(dm.namespace.listPrivateBounded(7,undefined,n).length,n);assert.equal(closes,1);dcases++;}
emitted=closes=0;maximumEntries=1000;
assert.throws(()=>dm.namespace.listPrivateBounded(7,undefined,3));assert.equal(emitted,4);assert.equal(closes,1);dcases++;
for(const n of [-1,257,NaN,Infinity,1.5]) {assert.throws(()=>dm.namespace.listPrivateBounded(7,undefined,n));dcases++;}
emitted=closes=fdCloses=0;maximumEntries=1;flags=[];
assert.equal(dm.namespace.listPrivateBounded(7,'rotations/x',3).length,1);
assert(flags.every(f=>(f&C.O_NOFOLLOW)!==0&&(f&C.O_DIRECTORY)!==0));assert.equal(closes,1);assert(fdCloses>=2);dcases++;
directoryError=true;closes=0;assert.throws(()=>dm.namespace.listPrivateBounded(7,'rotations',3));assert.equal(closes,1);dcases++;
directoryError=false;symlink=true;assert.throws(()=>dm.namespace.listPrivateBounded(7,'rotations',3),{code:'ELOOP'});dcases++;
console.log('PASS actual bounded durable enumeration:',dcases,'mock-only cases; no filesystem/native qualification');
