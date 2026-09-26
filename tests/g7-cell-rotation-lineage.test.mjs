// UNSIGNED synthetic summaries; real SHA-256, no authenticity or IO admission.
// Audited import map: node assert/fs/crypto/vm in harness; tested module NONE.
// Fixed source reads only. Cell parsed, never linked/evaluated. No child/network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createContext, SourceTextModule } from 'node:vm';
const baseline = process.argv[2] === 'baseline';
const source = readFileSync(new URL(baseline ? '../baseline/g7-cell-rotation.mjs' :
  '../tools/g7-cell-rotation.mjs', import.meta.url), 'utf8');
const cell = readFileSync(new URL('../tools/g7-cell.mjs', import.meta.url), 'utf8');
const context = createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
const deny = () => { throw Error('unmapped import'); };
const module = new SourceTextModule(source, { context, importModuleDynamically: deny });
assert.deepEqual(module.dependencySpecifiers, []);
await module.link(deny); await module.evaluate({ timeout: 1000 });
const json = new SourceTextModule('export const parse = JSON.parse;', { context });
await json.link(deny); await json.evaluate({ timeout: 1000 });
const norm = v => json.namespace.parse(JSON.stringify(v));
const clone = v => JSON.parse(JSON.stringify(v));
const canonical = v => v === null || typeof v !== 'object' ? JSON.stringify(v) :
  Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' :
    '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
const hashText = s => 'sha256:' + createHash('sha256').update(s).digest('hex');
const digest = v => hashText(canonical(v));
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const trust = n => ({ rootKeyId: hashText('root' + n), policy: { version: n, mock: 'UNSIGNED' },
  revocation: { version: 1, mock: 'UNSIGNED' } });
const floor = (t, time) => ({ rootKeyId: t.rootKeyId, policyVersion: t.policy.version,
  policyDigest: digest(t.policy), revocationVersion: t.revocation.version,
  revocationDigest: digest(t.revocation), lastWallMs: time });
const accepted = (n, t, time) => ({ cellId: 'cell1', transactionId: id(n), revision: n,
  releaseDigest: hashText('release' + n), floor: floor(t, time) });
function seal(p) {
  let previous = null;
  for (const [i, row] of p.entries.entries()) {
    row.path = 'rotations/' + p.expected.binding.rotationId + '/' + String(i + 1).padStart(6, '0') + '.json';
    row.item.record.binding = clone(p.expected.binding);
    row.item.record.previousHash = previous;
    row.item.checksum = digest(row.item.record); previous = row.item.checksum;
  }
}
function fixture(count = 3, phase = 3, selected = 'TARGET', current = 'NEXT', rootReturn = false) {
  const chain = [], inventory = [];
  let a = accepted(1, trust(1), 10), old = floor(trust(1), 11), prior = trust(1), previous = null;
  const genesis = { accepted: clone(a), trustDigest: digest(prior), floor: clone(old) };
  let selectedAccepted, currentFloor;
  for (let i = 0; i < count; i++) {
    const last = i === count - 1, next = trust(i + 2);
    if (last && rootReturn) next.rootKeyId = trust(1).rootKeyId;
    inventory.push({ transactionId: a.transactionId, terminalChecksum: hashText('terminal' + a.revision) });
    const rotation = { mock: 'UNSIGNED edge ' + i };
    const b = { cellId: 'cell1', rotationId: id(100 + i), priorAcceptedDigest: digest(a),
      priorRevision: a.revision, inventoryDigest: digest(inventory), previousTransitionDigest: previous,
      oldFloor: clone(old), priorTrustDigest: digest(prior), nextTrustDigest: digest(next),
      rotationDigest: digest(rotation), targetTransactionId: id(i + 2),
      targetReleaseDigest: hashText('release' + (i + 2)), targetRevision: i + 2 };
    const nextFloor = floor(next, old.lastWallMs + 1);
    const target = accepted(i + 2, next, old.lastWallMs + 2);
    const finalFloor = floor(next, old.lastWallMs + 3);
    const details = [{ priorTrust: clone(prior), nextTrust: clone(next), rotation },
      { classification: 'EXACT_NEXT', nextFloor }, { accepted: target, finalFloor }];
    const p = { expected: { binding: b, inventory: clone(inventory) }, entries:
      details.slice(0, last ? phase : 3).map((details, j) => ({ path: '', item: { record: {
        schemaVersion: 'alica.cell-rotation-history/v1', sequence: j + 1, previousHash: null,
        phase: ['PREPARED', 'TRUST_COMMITTED', 'COMPLETE'][j], binding: clone(b), details }, checksum: '' } })) };
    seal(p); chain.push(p);
    if (last) {
      selectedAccepted = clone(selected === 'PRIOR' ? a : target);
      currentFloor = clone(current === 'PRIOR' ? old : finalFloor);
    }
    a = target; old = finalFloor; prior = next; previous = p.entries.at(-1).item.checksum;
  }
  const p = chain.pop();
  return { ...p, lineage: { predecessors: chain, genesis,
    latest: { rotationId: p.expected.binding.rotationId, terminalDigest: p.entries.at(-1).item.checksum },
    accepted: selectedAccepted, currentFloor } };
}
function anchor(f) { f.lineage.latest = { rotationId: f.expected.binding.rotationId,
  terminalDigest: f.entries.at(-1).item.checksum }; }
let cases = 0;
function valid(f, wanted, label, hash = hashText) {
  const before = JSON.stringify(f);
  const result = module.namespace.validateRotationHistoryStructure(norm(f.entries), norm(f.expected), hash, norm(f.lineage));
  assert.equal(result.structurallyValid, wanted, label);
  assert.equal(result.authenticatedHistory, false); assert.equal(result.executionAuthorized, false);
  assert(Object.isFrozen(result)); assert.equal(JSON.stringify(f), before);
  assert.equal(result.terminalDigest, wanted ? f.entries.at(-1).item.checksum : null);
  cases++;
}
for (const n of [1, 2, 3, 8]) valid(fixture(n), true, 'complete ' + n);
// Baseline MUST fail here: previous published prefix-only helper ignores lineage.
{ const f = fixture(); f.lineage.predecessors.splice(1, 1); valid(f, false, 'missing predecessor'); }
function bad(label, edit) { const f = fixture(); edit(f); valid(f, false, label); }
bad('missing genesis rotation', f => f.lineage.predecessors.shift());
bad('no predecessors', f => { f.lineage.predecessors = []; });
bad('reordered', f => f.lineage.predecessors.reverse());
bad('duplicate edge', f => f.lineage.predecessors.push(clone(f.lineage.predecessors[0])));
bad('latest replay', f => f.lineage.predecessors.push({ entries: clone(f.entries), expected: clone(f.expected) }));
bad('branch with valid local checksums', f => {
  f.expected.binding.previousTransitionDigest = f.lineage.predecessors[0].entries.at(-1).item.checksum;
  seal(f); anchor(f);
});
bad('unanchored truncation', f => { f.entries.pop(); });
bad('latest checkpoint substitution', f => { f.lineage.latest.terminalDigest = hashText('wrong'); });
bad('latest rotation substitution', f => { f.lineage.latest.rotationId = id(999); });
bad('genesis acceptance substitution', f => { f.lineage.genesis.accepted.releaseDigest = hashText('wrong'); });
bad('genesis trust substitution', f => { f.lineage.genesis.trustDigest = hashText('wrong'); });
bad('genesis floor rollback', f => { f.lineage.genesis.floor.lastWallMs = 0; });
bad('genesis is not genesis', f => {
  const p = f.lineage.predecessors[0]; p.expected.binding.previousTransitionDigest = hashText('hidden'); seal(p);
});
for (const key of ['priorAcceptedDigest', 'priorTrustDigest', 'previousTransitionDigest'])
  bad('resealed ' + key, f => { f.expected.binding[key] = hashText('wrong'); seal(f); anchor(f); });
for (const key of ['rotationId', 'rotationDigest', 'targetTransactionId'])
  bad('replay ' + key, f => { f.expected.binding[key] = f.lineage.predecessors[0].expected.binding[key]; seal(f); anchor(f); });
valid(fixture(3, 3, 'TARGET', 'NEXT', true), false, 'fully resealed retired genesis root return');
// Each single prefix is structurally sound even in the retired-root attack.
{ const f = fixture(3, 3, 'TARGET', 'NEXT', true);
  assert.equal(module.namespace.validateRotationHistoryStructure(norm(f.entries), norm(f.expected), hashText).structurallyValid, true); cases++; }
for (const phase of ['ABORTED', 'RECOVERING', 'UNKNOWN']) bad('unsupported ' + phase, f => {
  const p = f.lineage.predecessors[0]; p.entries[2].item.record.phase = phase; seal(p);
});
bad('unfinished predecessor', f => f.lineage.predecessors[0].entries.pop());
bad('inventory omission resealed', f => {
  f.expected.inventory.shift(); f.expected.binding.inventoryDigest = digest(f.expected.inventory); seal(f); anchor(f);
});
bad('inventory rewrite resealed', f => {
  f.expected.inventory[0].terminalChecksum = hashText('rewritten');
  f.expected.binding.inventoryDigest = digest(f.expected.inventory); seal(f); anchor(f);
});
for (const key of ['policyVersion', 'revocationVersion', 'lastWallMs']) {
  bad('current rollback ' + key, f => { f.lineage.currentFloor[key] = 0; });
  bad('accepted rollback ' + key, f => { f.lineage.accepted.floor[key] = 0; });
  bad('old-floor rollback ' + key, f => { f.expected.binding.oldFloor[key] = 0; seal(f); anchor(f); });
}
for (const key of ['rootKeyId', 'policyDigest', 'revocationDigest']) {
  bad('current equal-version substitution ' + key, f => { f.lineage.currentFloor[key] = hashText('wrong'); });
  bad('accepted substitution ' + key, f => { f.lineage.accepted.floor[key] = hashText('wrong'); });
}
for (const key of ['cellId', 'transactionId', 'revision', 'releaseDigest'])
  bad('accepted binding ' + key, f => { f.lineage.accepted[key] = 'wrong'; });
for (const key of ['predecessors', 'genesis', 'latest', 'accepted', 'currentFloor'])
  bad('missing field ' + key, f => { delete f.lineage[key]; });
bad('unknown lineage field', f => { f.lineage.extra = true; });
bad('unknown anchor field', f => { f.lineage.latest.extra = true; });
bad('unknown prefix field', f => { f.lineage.predecessors[0].extra = true; });
const gates = ['custodyAndReap', 'authenticatedHistory', 'independentAuthorization', 'currentTrustFresh',
  'floorsAndTime', 'bindingsAndInventory', 'durabilityCertain', 'lifetimeFit', 'replacementEligible',
  'freshTransaction', 'certifiedTeardown'];
const observation = (f, selection, classification) => ({ schemaVersion: 'alica.cell-rotation-observation/v1',
  phase: f.entries.at(-1).item.record.phase, selection, classification,
  targetState: selection === 'TARGET' ? 'COMMITTED' : 'ABSENT',
  targetEffects: selection === 'TARGET' ? 'ACCEPTED' : 'NONE', checks: Object.fromEntries(gates.map(k => [k, true])) });
const target = (f, fresh = false) => ({ transactionId: fresh ? id(999) : f.expected.binding.targetTransactionId,
  releaseDigest: f.expected.binding.targetReleaseDigest, revision: f.expected.binding.targetRevision });
function decision(f, o, t, wanted) {
  const out = module.namespace.classifyRotationHistoryRecovery(norm(f.entries), norm(f.expected), norm(o),
    hashText, norm(t), norm(f.lineage));
  assert.equal(out.disposition, wanted);
  for (const k of ['executionAuthorized', 'updateTrust', 'activationReplay']) assert.equal(out[k], false);
  assert(Object.isFrozen(out)); cases++;
}
for (const [phase, selection, current, disposition] of [
  [1, 'PRIOR', 'PRIOR', 'ABORT_PRIOR'], [1, 'PRIOR', 'NEXT', 'REPLACE_FRESH'],
  [2, 'PRIOR', 'NEXT', 'REPLACE_FRESH'], [2, 'TARGET', 'NEXT', 'RECONCILE_ACCEPTED'],
  [3, 'TARGET', 'NEXT', 'CURRENT_START_SEPARATE']]) {
  const f = fixture(3, phase, selection, current), o = observation(f, selection, 'EXACT_' + current);
  const t = disposition === 'ABORT_PRIOR' ? null : target(f, disposition === 'REPLACE_FRESH');
  valid(f, true, disposition); decision(f, o, t, disposition);
  for (const k of gates.filter(k => disposition !== 'ABORT_PRIOR' || !['replacementEligible', 'freshTransaction'].includes(k))) {
    if (k === 'freshTransaction' && selection === 'TARGET') continue;
    decision(f, { ...o, checks: { ...o.checks, [k]: false } }, t, 'NEEDS_OPERATOR');
  }
  decision(f, { ...o, classification: 'UNRESOLVED' }, t, 'NEEDS_OPERATOR');
  decision(f, { ...o, classification: current === 'NEXT' ? 'EXACT_PRIOR' : 'EXACT_NEXT' }, t, 'NEEDS_OPERATOR');
  decision(f, { ...o, selection: selection === 'TARGET' ? 'PRIOR' : 'TARGET' }, t, 'NEEDS_OPERATOR');
  const missing = clone(f); missing.lineage.predecessors.pop(); decision(missing, o, t, 'NEEDS_OPERATOR');
}
valid(fixture(3, 2, 'TARGET', 'PRIOR'), false, 'accepted target with prior current');
valid(fixture(3, 3, 'PRIOR', 'NEXT'), false, 'complete but prior selected');
valid(fixture(3, 1, 'TARGET', 'NEXT'), false, 'accepted before committed record');
// Limits enforced before ANY hash call; distinguish cumulative UTF-8 from chars.
for (const kind of ['bytes', 'utf8', 'escaped', 'string', 'key', 'array', 'keys', 'depth', 'nodes']) {
  const f = fixture(1); let padding;
  if (kind === 'bytes') padding = Array(20).fill('x'.repeat(14000));
  if (kind === 'utf8') padding = Array(6).fill('😀'.repeat(6000));
  if (kind === 'escaped') padding = Array(4).fill('\u0000'.repeat(16000));
  if (kind === 'string') padding = 'x'.repeat(16385);
  if (kind === 'key') padding = { ['x'.repeat(16385)]: 0 };
  if (kind === 'array') padding = Array(257).fill(0);
  if (kind === 'keys') padding = Object.fromEntries(Array.from({ length: 257 }, (_, i) => [i, 0]));
  if (kind === 'depth') { padding = 0; for (let i = 0; i < 33; i++) padding = [padding]; }
  if (kind === 'nodes') padding = Array.from({ length: 150 }, () => Array(230).fill(0));
  f.lineage.padding = padding; let hashes = 0;
  valid(f, false, 'prehash bounded ' + kind, s => { hashes++; return hashText(s); });
  assert.equal(hashes, 0, kind); cases++;
}
{ const f = fixture(); f.lineage.predecessors = Array(32).fill(f.lineage.predecessors[0]);
  let hashes = 0; valid(f, false, '32 predecessor cap', s => { hashes++; return hashText(s); });
  assert.equal(hashes, 0); cases++; }
// Exact cumulative serialization boundary, using audited private-function
// extraction ONLY for accounting tests. Product behavior tested above via exports.
const begin = source.indexOf('function lineageSnapshot(value) {');
const end = source.indexOf('function historyAccepted(', begin);
assert(begin >= 0 && end > begin);
const closedBegin = source.indexOf('function closed(value, keys) {');
const closedEnd = source.indexOf('const choices =', closedBegin);
assert(closedBegin >= 0 && closedEnd > closedBegin);
const bounds = new SourceTextModule(`const requireHistory = ok => { if (!ok) throw Error('limit'); };
${source.slice(closedBegin, closedEnd)}
${source.slice(begin, end)}
export const snapshot = lineageSnapshot;`, { context, importModuleDynamically: deny });
assert.deepEqual(bounds.dependencySpecifiers, []); await bounds.link(deny); await bounds.evaluate({ timeout: 1000 });
for (const delta of [-1, 0, 1]) {
  const a = Array(16).fill('x'.repeat(16000));
  const length = 262144 + delta - Buffer.byteLength(canonical(a)) - 3;
  a.push('x'.repeat(length)); assert.equal(Buffer.byteLength(canonical(a)), 262144 + delta);
  if (delta <= 0) assert.equal(canonical(bounds.namespace.snapshot(norm(a))), canonical(a));
  else assert.throws(() => bounds.namespace.snapshot(norm(a)));
  cases++;
}
const hostile = new SourceTextModule(`
import {validateRotationHistoryStructure} from './g7-cell-rotation.mjs';
export function run(hash) {
 const f = ${JSON.stringify(fixture())}; let reads = 0; const results = [];
 const test = l => results.push(validateRotationHistoryStructure(f.entries,f.expected,hash,l));
 const getter = {...f.lineage}; Object.defineProperty(getter,'currentFloor',{enumerable:true,get(){reads++;throw Error('getter');}}); test(getter);
 const cycle = {...f.lineage}; cycle.predecessors = [cycle]; test(cycle);
 const hole = {...f.lineage}; hole.predecessors = Array(1); test(hole);
 test({...f.lineage,toJSON(){reads++;return {};}});
 test(new Proxy({}, {ownKeys(){throw Error('proxy');}}));
 return {reads,denied:results.every(r=>!r.structurallyValid)};
}`, { context, importModuleDynamically: deny });
await hostile.link(n => { assert.equal(n, './g7-cell-rotation.mjs'); return module; });
await hostile.evaluate({ timeout: 1000 });
assert.deepEqual(clone(hostile.namespace.run(hashText)), { reads: 0, denied: true }); cases += 5;
const parsed = new SourceTextModule(cell, { context, importModuleDynamically: deny });
assert(parsed.dependencySpecifiers.includes('./g7-cell-rotation.mjs'));
assert(cell.includes("export { validateRotationHistoryStructure, classifyRotationHistoryRecovery } from './g7-cell-rotation.mjs';"));
assert.equal(context.process, undefined); assert.equal(context.require, undefined);
console.log('PASS ' + cases + ' retained-lineage / existing seam / bounded-serialization cases');
console.log('UNSIGNED summaries; Cell parse-only; no authentication/freshness/inventory/lifetime/native qualification');
