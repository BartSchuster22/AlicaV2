// Deterministic structural fixtures, NOT signed/authenticated trust evidence.
// Reads ONLY two ordinary source files; Cell is parsed, never linked/evaluated.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createContext, SourceTextModule } from 'node:vm';
const source = readFileSync(new URL('../tools/g7-cell-rotation.mjs', import.meta.url), 'utf8');
const cell = readFileSync(new URL('../tools/g7-cell.mjs', import.meta.url), 'utf8');
const context = createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
const deny = () => { throw new Error('Forbidden import'); };
const module = new SourceTextModule(source, { context, importModuleDynamically: deny });
assert.deepEqual(module.dependencySpecifiers, []);
await module.link(deny); await module.evaluate({ timeout: 1000 });
const helpers = new SourceTextModule('export const parse = JSON.parse;', { context });
await helpers.link(deny); await helpers.evaluate({ timeout: 1000 });
const normalize = (v) => helpers.namespace.parse(JSON.stringify(v));
const clone = (v) => JSON.parse(JSON.stringify(v));
const canonical = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v) :
  Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' :
    '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
const hashText = (s) => 'sha256:' + createHash('sha256').update(s).digest('hex');
const digest = (v) => hashText(canonical(v));
const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const d = (s) => hashText(s);
function fixture(count = 3) {
  const priorTrust = { rootKeyId: d('old-root'), policy: { version: 4, mock: 'old-policy' },
    revocation: { version: 6, mock: 'same-revocation' } };
  const nextTrust = { rootKeyId: d('new-root'), policy: { version: 5, mock: 'new-policy' },
    revocation: clone(priorTrust.revocation) };
  const rotation = { mock: 'UNSIGNED public transition fixture; not cryptographic evidence' };
  const floor = (m, time) => ({ rootKeyId: m.rootKeyId, policyVersion: m.policy.version,
    policyDigest: digest(m.policy), revocationVersion: m.revocation.version,
    revocationDigest: digest(m.revocation), lastWallMs: time });
  const inventory = [{ transactionId: id(1), terminalChecksum: d('terminal1') },
    { transactionId: id(2), terminalChecksum: d('terminal2') }];
  const binding = { cellId: 'cell1', rotationId: id(3), priorAcceptedDigest: d('prior-accepted'),
    priorRevision: 2, inventoryDigest: digest(inventory), previousTransitionDigest: null,
    oldFloor: floor(priorTrust, 100), priorTrustDigest: digest(priorTrust),
    nextTrustDigest: digest(nextTrust), rotationDigest: digest(rotation),
    targetTransactionId: id(4), targetReleaseDigest: d('target-release'), targetRevision: 3 };
  const details = [{ priorTrust, nextTrust, rotation },
    { classification: 'EXACT_NEXT', nextFloor: floor(nextTrust, 110) },
    { accepted: { cellId: 'cell1', transactionId: id(4), revision: 3,
      releaseDigest: binding.targetReleaseDigest, floor: floor(nextTrust, 120) },
      finalFloor: floor(nextTrust, 121) }];
  const entries = details.slice(0, count).map((details, i) => ({
    path: 'rotations/' + binding.rotationId + '/' + String(i + 1).padStart(6, '0') + '.json',
    item: { record: { schemaVersion: 'alica.cell-rotation-history/v1', sequence: i + 1,
      previousHash: null, phase: ['PREPARED', 'TRUST_COMMITTED', 'COMPLETE'][i],
      binding: clone(binding), details }, checksum: '' },
  }));
  const f = { entries, expected: { binding, inventory } }; reseal(f); return f;
}
function reseal(f) {
  let previous = null;
  for (const row of f.entries) {
    row.item.record.previousHash = previous;
    row.item.checksum = digest(row.item.record); previous = row.item.checksum;
  }
}
function rebind(f) {
  for (const row of f.entries) row.item.record.binding = clone(f.expected.binding);
  reseal(f);
}
let cases = 0;
function valid(f, wanted, hash = hashText) {
  const before = JSON.stringify(f);
  const result = module.namespace.validateRotationHistoryStructure(normalize(f.entries), normalize(f.expected), hash);
  assert.equal(result.structurallyValid, wanted);
  assert.equal(result.authenticatedHistory, false);
  assert.equal(result.executionAuthorized, false);
  assert(Object.isFrozen(result));
  assert.equal(JSON.stringify(f), before);
  assert.equal(result.phase, wanted ? f.entries.at(-1).item.record.phase : null);
  assert.equal(result.terminalDigest, wanted ? f.entries.at(-1).item.checksum : null);
  cases++;
}
for (let count = 1; count <= 3; count++) valid(fixture(count), true);
// Expected anchor is external; a valid linked non-genesis prefix is NOT a proof
// that the referenced predecessor exists/authenticates or that this is latest.
{ const f = fixture(); f.expected.binding.previousTransitionDigest = d('external-anchor'); rebind(f); valid(f, true); }
function bad(edit, seal = true) {
  const f = fixture(); edit(f); if (seal) reseal(f); valid(f, false);
}
bad(f => { f.entries = []; });
bad(f => { f.entries.reverse(); });
bad(f => { f.entries.splice(1, 1); });
bad(f => { f.entries.push(clone(f.entries[2])); });
bad(f => { f.entries[1] = clone(f.entries[0]); });
bad(f => { f.entries[0].item.checksum = d('tamper'); }, false);
bad(f => { f.entries[1].item.record.previousHash = d('branch'); }, false);
bad(f => { f.entries[0].item.record.previousHash = f.entries[2].item.checksum; }, false);
for (const path of ['../000001.json', 'rotations/x/000001.json',
  'rotations/' + id(3) + '/1.json', 'rotations/' + id(3) + '/000001.json.next'])
  bad(f => { f.entries[0].path = path; });
for (const phase of ['ABORTED', 'RECOVERING', 'TRUST_COMMITTED', 'UNSUPPORTED'])
  bad(f => { f.entries[0].item.record.phase = phase; });
for (const sequence of [0, 2, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])
  bad(f => { f.entries[0].item.record.sequence = sequence; });
for (const level of ['row', 'item', 'record', 'details', 'expected', 'binding']) {
  bad(f => {
    const obj = { row: f.entries[0], item: f.entries[0].item, record: f.entries[0].item.record,
      details: f.entries[0].item.record.details, expected: f.expected, binding: f.expected.binding }[level];
    obj.extra = true;
  });
}
for (const key of Object.keys(fixture().expected.binding)) {
  bad(f => { delete f.entries[0].item.record.binding[key]; });
  bad(f => { f.entries[1].item.record.binding[key] = 'binding-substitution'; });
}
for (const key of ['priorAcceptedDigest', 'inventoryDigest', 'priorTrustDigest', 'nextTrustDigest',
  'rotationDigest', 'targetReleaseDigest', 'previousTransitionDigest'])
  bad(f => { f.expected.binding[key] = d('anchor-substitution'); });
for (const revision of [0, -1, 1.5, '2', Number.MAX_SAFE_INTEGER])
  bad(f => { f.expected.binding.priorRevision = revision; rebind(f); });
bad(f => { f.expected.binding.targetRevision = 4; rebind(f); });
bad(f => { f.expected.inventory.reverse(); f.expected.binding.inventoryDigest = digest(f.expected.inventory); rebind(f); });
bad(f => { f.expected.inventory.push(clone(f.expected.inventory[1])); f.expected.binding.inventoryDigest = digest(f.expected.inventory); rebind(f); });
bad(f => { f.expected.inventory[1].terminalChecksum = d('swap'); });
bad(f => { f.expected.inventory[1].transactionId = id(4); f.expected.binding.inventoryDigest = digest(f.expected.inventory); rebind(f); });
for (const key of ['priorTrust', 'nextTrust', 'rotation'])
  bad(f => { f.entries[0].item.record.details[key].substitution = true; });
bad(f => { f.entries[1].item.record.details.classification = 'EXACT_PRIOR'; });
for (const key of ['rootKeyId', 'policyDigest', 'revocationDigest'])
  bad(f => { f.entries[1].item.record.details.nextFloor[key] = d('swap'); });
for (const key of ['policyVersion', 'revocationVersion', 'lastWallMs'])
  bad(f => { f.entries[1].item.record.details.nextFloor[key] = 0; });
for (const key of ['rootKeyId', 'policyDigest', 'revocationDigest'])
  bad(f => { f.entries[2].item.record.details.finalFloor[key] = d('rollback'); });
for (const key of ['policyVersion', 'revocationVersion', 'lastWallMs'])
  bad(f => { f.entries[2].item.record.details.finalFloor[key] = 0; });
for (const [key, value] of Object.entries({ cellId: 'wrong', transactionId: id(9), revision: 4,
  releaseDigest: d('wrong') })) bad(f => { f.entries[2].item.record.details.accepted[key] = value; });
// Even fully rehashed material substitutions must retain distinct roots and +1.
for (const edit of [m => { m.rootKeyId = d('old-root'); }, m => { m.policy.version = 7; }])
  bad(f => { const m = f.entries[0].item.record.details.nextTrust; edit(m);
    f.expected.binding.nextTrustDigest = digest(m); rebind(f); });
bad(f => { const m = f.entries[0].item.record.details.rotation; m.padding = '😀'.repeat(4000);
  f.expected.binding.rotationDigest = digest(m); rebind(f); });
valid(fixture(), false, () => { throw new Error('digest failure'); });
valid(fixture(), false, () => 'not-a-sha256');
valid(fixture(), false, null);
const gates = ['custodyAndReap', 'authenticatedHistory', 'independentAuthorization',
  'currentTrustFresh', 'floorsAndTime', 'bindingsAndInventory', 'durabilityCertain',
  'lifetimeFit', 'replacementEligible', 'freshTransaction', 'certifiedTeardown'];
const observation = (phase = 'PREPARED') => ({ schemaVersion: 'alica.cell-rotation-observation/v1',
  classification: 'EXACT_NEXT', phase, selection: 'PRIOR', targetState: 'ABSENT', targetEffects: 'NONE',
  checks: Object.fromEntries(gates.map(k => [k, true])) });
const target = (n = 5) => ({ transactionId: id(n), releaseDigest: d('target-release'), revision: 3 });
function decision(f, o, t, wanted) {
  const result = module.namespace.classifyRotationHistoryRecovery(normalize(f.entries),
    normalize(f.expected), normalize(o), hashText, normalize(t));
  assert.equal(result.disposition, wanted);
  for (const k of ['executionAuthorized', 'updateTrust', 'activationReplay']) assert.equal(result[k], false);
  assert(Object.isFrozen(result)); cases++;
}
for (let n = 1; n <= 2; n++) {
  const f = fixture(n), o = observation(n === 1 ? 'PREPARED' : 'TRUST_COMMITTED');
  decision(f, o, target(), 'REPLACE_FRESH');
  for (const state of ['STAGING', 'VERIFIED']) decision(f,
    { ...o, targetState: state, targetEffects: 'EARLY' }, target(), 'REPLACE_FRESH');
  for (const k of gates) decision(f, { ...o, checks: { ...o.checks, [k]: false } }, target(), 'NEEDS_OPERATOR');
  for (const t of [null, target(4), target(1), { ...target(), releaseDigest: d('other') },
    { ...target(), revision: 4 }, { ...target(), extra: true }]) decision(f, o, t, 'NEEDS_OPERATOR');
  decision(f, { ...o, classification: 'UNRESOLVED' }, target(), 'NEEDS_OPERATOR');
  decision(f, { ...o, phase: 'COMPLETE' }, target(), 'NEEDS_OPERATOR');
}
const prior = { ...observation(), classification: 'EXACT_PRIOR' };
decision(fixture(1), prior, null, 'ABORT_PRIOR');
decision(fixture(1), prior, target(), 'NEEDS_OPERATOR');
decision(fixture(2), { ...prior, phase: 'TRUST_COMMITTED' }, null, 'NEEDS_OPERATOR');
decision(fixture(1), { ...prior, targetEffects: 'EARLY' }, null, 'NEEDS_OPERATOR');
for (const [count, phase, disposition] of [[2, 'TRUST_COMMITTED', 'RECONCILE_ACCEPTED'],
  [3, 'COMPLETE', 'CURRENT_START_SEPARATE']]) {
  const o = { ...observation(phase), selection: 'TARGET', targetState: 'COMMITTED', targetEffects: 'ACCEPTED' };
  decision(fixture(count), o, target(4), disposition);
  decision(fixture(count), o, target(5), 'NEEDS_OPERATOR');
  decision(fixture(count), { ...o, checks: { ...o.checks, authenticatedHistory: false } }, target(4), 'NEEDS_OPERATOR');
  decision(fixture(count), { ...o, checks: { ...o.checks, currentTrustFresh: false } }, target(4), 'NEEDS_OPERATOR');
}
{ const f = fixture(1); f.entries[0].item.checksum = d('bad');
  decision(f, observation(), target(), 'NEEDS_OPERATOR'); }
// Adversarial in-realm data: no getter/toJSON callbacks may run.
const hostile = new SourceTextModule(`
import { validateRotationHistoryStructure } from './g7-cell-rotation.mjs';
export function run(hash) {
  const f = ${JSON.stringify(fixture())};
  const tests = []; let reads = 0;
  const entry = f.entries[0];
  Object.defineProperty(entry, 'path', {enumerable:true,get(){ reads++; throw Error('getter'); }});
  tests.push(validateRotationHistoryStructure(f.entries,f.expected,hash));
  const a = []; a.length = 1;
  tests.push(validateRotationHistoryStructure(a,f.expected,hash));
  const cycle = {}; cycle.self = cycle;
  tests.push(validateRotationHistoryStructure(cycle,f.expected,hash));
  tests.push(validateRotationHistoryStructure(new Proxy({}, {ownKeys(){throw Error('proxy');}}),f.expected,hash));
  const e = {...f.expected, toJSON(){reads++;return {};}};
  tests.push(validateRotationHistoryStructure([],e,hash));
  return { denied: tests.every(t => !t.structurallyValid && !t.authenticatedHistory), reads };
}`, { context, importModuleDynamically: deny });
await hostile.link(name => { assert.equal(name, './g7-cell-rotation.mjs'); return module; });
await hostile.evaluate({ timeout: 1000 });
assert.deepEqual(JSON.parse(JSON.stringify(hostile.namespace.run(hashText))), { denied: true, reads: 0 }); cases += 5;
const parsedCell = new SourceTextModule(cell, { context, importModuleDynamically: deny });
assert(parsedCell.dependencySpecifiers.includes('./g7-cell-rotation.mjs'));
assert(cell.includes("export { validateRotationHistoryStructure, classifyRotationHistoryRecovery } from './g7-cell-rotation.mjs';"));
assert.equal(context.process, undefined); assert.equal(context.require, undefined);
console.log('PASS ' + cases + ' structural/history-seam cases; SHA-256 hashes real, trust fixtures UNSIGNED');
console.log('No auth/freshness/lifetime/runtime qualification; all decisions non-executing; Cell parse-only, imports denied');
