// Bounded source-only regression: fixed reads, no subprocess/network/signing.
// Cell source is parsed, NEVER linked/evaluated. Only its exact #base method is
// extracted into a fail-closed VM harness; imports resolve to the pure module.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule } from 'node:vm';

const rotationSource = readFileSync(new URL('../tools/g7-cell-rotation.mjs', import.meta.url), 'utf8');
const cellSource = readFileSync(new URL('../tools/g7-cell.mjs', import.meta.url), 'utf8');
const context = createContext(Object.create(null), {
  codeGeneration: { strings: false, wasm: false },
});
const denyDynamic = () => { throw new Error('Unmapped dynamic import'); };
const rotation = new SourceTextModule(rotationSource, {
  context, identifier: 'rotation', importModuleDynamically: denyDynamic,
});
assert.deepEqual(rotation.dependencySpecifiers, []);
await rotation.link(() => { throw new Error('Unexpected pure module dependency'); });
await rotation.evaluate({ timeout: 1000 });
// Same-realm JSON normalization: the production closed validator rejects foreign
// prototypes, accessors and inherited fields rather than interpreting objects.
const make = new SourceTextModule('export const parse = JSON.parse;', { context });
await make.link(() => { throw new Error('Unexpected dependency'); });
await make.evaluate({ timeout: 1000 });
const normalize = (x) => make.namespace.parse(JSON.stringify(x));
const classify = (x) => rotation.namespace.classifyStoppedRotationRecovery(normalize(x));
const gateNames = [
  'custodyAndReap', 'authenticatedHistory', 'independentAuthorization',
  'currentTrustFresh', 'floorsAndTime', 'bindingsAndInventory',
  'durabilityCertain', 'lifetimeFit', 'replacementEligible',
  'freshTransaction', 'certifiedTeardown',
];
const base = () => ({
  schemaVersion: 'alica.cell-rotation-observation/v1',
  classification: 'EXACT_PRIOR', phase: 'PREPARED', selection: 'PRIOR',
  targetState: 'ABSENT', targetEffects: 'NONE',
  checks: Object.fromEntries(gateNames.map((key) => [key, true])),
});
let cases = 0;
function expect(input, disposition) {
  const before = JSON.stringify(input);
  const out = classify(input);
  assert.equal(out.disposition, disposition);
  assert.equal(out.executionAuthorized, false);
  assert.equal(out.updateTrust, false);
  assert.equal(out.activationReplay, false);
  assert.equal(Object.isFrozen(out), true);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(Object.keys(out).sort(), [
    'activationReplay', 'disposition', 'executionAuthorized', 'updateTrust',
  ]);
  cases++;
}
const prior = base();
const next = { ...base(), classification: 'EXACT_NEXT' };
const committed = { ...next, phase: 'TRUST_COMMITTED', selection: 'TARGET',
  targetState: 'COMMITTED', targetEffects: 'ACCEPTED' };
const complete = { ...committed, phase: 'COMPLETE' };
const positives = [
  [prior, 'ABORT_PRIOR'],
  [next, 'REPLACE_FRESH'],
  [{ ...next, phase: 'TRUST_COMMITTED' }, 'REPLACE_FRESH'],
  ...['PREPARED', 'TRUST_COMMITTED'].flatMap((phase) =>
    ['STAGING', 'VERIFIED'].map((targetState) => [
      { ...next, phase, targetState, targetEffects: 'EARLY' }, 'REPLACE_FRESH',
    ])),
  [committed, 'RECONCILE_ACCEPTED'],
  [{ ...committed, targetState: 'ACTIVATING' }, 'RECONCILE_ACCEPTED'],
  [complete, 'CURRENT_START_SEPARATE'],
];
for (const [input, disposition] of positives) {
  expect(input, disposition);
  // Every positive branch needs ALL independent common gates, including fit.
  for (const key of [...gateNames.slice(0, 8), 'certifiedTeardown'])
    expect({ ...input, checks: { ...input.checks, [key]: false } }, 'NEEDS_OPERATOR');
  // Accepted bytes also need current package eligibility, not just old lineage.
  if (input.classification === 'EXACT_NEXT')
    expect({ ...input, checks: { ...input.checks, replacementEligible: false } },
      'NEEDS_OPERATOR');
  for (const classification of ['UNRESOLVED', 'EXACT_OTHER', undefined])
    expect({ ...input, classification }, 'NEEDS_OPERATOR');
}
for (const key of ['replacementEligible', 'freshTransaction']) {
  expect({ ...next, checks: { ...next.checks, [key]: false } }, 'NEEDS_OPERATOR');
  // Safe prior abandonment does not require a usable replacement/new transaction.
  expect({ ...prior, checks: { ...prior.checks, [key]: false } }, 'ABORT_PRIOR');
}
// Exhaustive structural cross product against independently listed allowed rows.
const allowed = new Map(positives.map(([v, d]) => [
  [v.classification, v.phase, v.selection, v.targetState, v.targetEffects].join('|'), d,
]));
for (const classification of ['EXACT_PRIOR', 'EXACT_NEXT', 'UNRESOLVED'])
  for (const phase of ['PREPARED', 'TRUST_COMMITTED', 'COMPLETE'])
    for (const selection of ['PRIOR', 'TARGET', 'OTHER'])
      for (const targetState of ['ABSENT', 'STAGING', 'VERIFIED', 'ACTIVATING', 'COMMITTED', 'OTHER'])
        for (const targetEffects of ['NONE', 'EARLY', 'ACCEPTED', 'UNKNOWN']) {
          const key = [classification, phase, selection, targetState, targetEffects].join('|');
          expect({ ...base(), classification, phase, selection, targetState, targetEffects },
            allowed.get(key) ?? 'NEEDS_OPERATOR');
        }
for (const invalid of [null, [], 1, 'EXACT_NEXT', {},
  { ...next, extra: true }, { ...next, schemaVersion: 'alica.cell-rotation-observation/v2' },
  { ...next, checks: { ...next.checks, requestSaysAuthorized: true } }])
  expect(invalid, 'NEEDS_OPERATOR');
for (const key of Object.keys(next)) {
  const missing = { ...next }; delete missing[key];
  expect(missing, 'NEEDS_OPERATOR');
}
for (const key of gateNames) {
  const checks = { ...next.checks }; delete checks[key];
  expect({ ...next, checks }, 'NEEDS_OPERATOR');
  for (const invalid of [null, 1, 'true'])
    expect({ ...next, checks: { ...next.checks, [key]: invalid } }, 'NEEDS_OPERATOR');
}
// Same-realm accessor rejection; getter must not execute.
const hostile = new SourceTextModule(`
  import { classifyStoppedRotationRecovery } from './g7-cell-rotation.mjs';
  export function run() {
    const v = ${JSON.stringify(next)};
    let reads = 0;
    Object.defineProperty(v, 'phase', { enumerable: true,
      get() { reads++; throw new Error('getter'); } });
    return [classifyStoppedRotationRecovery(v).disposition, reads];
  }
`, { context });
const linker = (name) => {
  if (name !== './g7-cell-rotation.mjs') throw new Error('Unmapped import: ' + name);
  return rotation;
};
await hostile.link(linker);
await hostile.evaluate({ timeout: 1000 });
assert.equal(hostile.namespace.run().join(','), 'NEEDS_OPERATOR,0'); cases++;

// Parse full Cell source but never resolve its native-capable dependency closure.
const parsedCell = new SourceTextModule(cellSource, { context,
  importModuleDynamically: denyDynamic });
assert(parsedCell.dependencySpecifiers.includes('./g7-cell-rotation.mjs'));
assert(cellSource.includes("export { classifyStoppedRotationRecovery } from './g7-cell-rotation.mjs';"));
const begin = cellSource.indexOf('  #base() {');
const end = cellSource.indexOf('  #trust(material, floor) {', begin);
assert(begin >= 0 && end > begin);
assert.equal(cellSource.indexOf('  #base() {', begin + 1), -1);
const exactBase = cellSource.slice(begin, end);
// Only this exact pure import is resolvable; all filesystem/read helpers below
// are explicit in-memory mocks. No kernel, native loader or process in context.
const harness = new SourceTextModule(`
import { requireOrdinaryCellRoot } from './g7-cell-rotation.mjs';
let names, events;
const listPrivate = (_fd, path) => {
  events.push(path ? 'list-child' : 'list-root');
  if (path) throw new Error('unexpected child IO');
  return names;
};
const readPrivate = () => { events.push('kernel-read'); return ''; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (ok) => { if (!ok) throw new Error('denied'); };
const cellSchema = (_name, value) => value;
class Probe {
  #fd = 1; #channel = false; #owned = false;
  #guard() { events.push('guard'); }
  #read(path) {
    events.push('read:' + path);
    if (path === 'identity.json') return { cellId: 'cell1', schemaVersion: 'alica.cell-identity/v1' };
    if (path === 'floor.json') return {};
    throw new Error('unexpected read');
  }
${exactBase}
  run() { return this.#base(); }
}
export function run(input) {
  names = input; events = [];
  try { new Probe().run(); return { events, denied: false }; }
  catch (e) { return { events, denied: true, code: e.code, runtime: e.runtime }; }
}
`, { context, importModuleDynamically: denyDynamic });
await harness.link(linker);
await harness.evaluate({ timeout: 1000 });
const ordinary = ['identity.json', 'floor.json', 'kernel.json', 'transactions',
  'releases', 'accepted.json'];
for (const marker of ['rotations', 'rotations/000001.json']) {
  for (const names of [[marker], [...ordinary, marker], [marker, ...ordinary]]) {
    const out = harness.namespace.run(normalize(names));
    assert.equal(out.denied, true);
    assert.equal(out.code, 'FAILED_PRECONDITION');
    assert.equal(out.runtime, 'NEEDS_OPERATOR');
    assert.equal(out.events.join(','), 'guard,list-root');
    cases++;
  }
}
const ordinaryOut = harness.namespace.run(normalize(ordinary));
assert.equal(ordinaryOut.denied, false);
assert.equal(ordinaryOut.events.join(','),
  'guard,list-root,read:identity.json,read:floor.json,kernel-read'); cases++;
assert.equal(harness.namespace.run(normalize([...ordinary, 'unexpected'])).denied, true); cases++;
assert.equal(context.process, undefined);
assert.equal(context.require, undefined);
console.log('PASS ' + cases + ' cases; pure decision matrix + exact #base VM barrier');
console.log('Cell parsed only; VM import map: rotation module only; no native/network/subprocess/signing');
