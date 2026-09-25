// SOURCE ONLY / UNEXECUTED. Requires separate execution/build admission.
// Disposable keys are generated ONLY during a future authorized test run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
import { inspectPersistedTrust, canonical, digest, rawDigest } from '../../packages/kernel/dist/index.js';

const unresolved = { schemaVersion: 'alica.trust-inspection/v1', classification: 'UNRESOLVED' };
const config = { cellId: 'inspection-test', rootScope: 'root', timeTrusted: true,
  maxCallMs: 1000, cleanupMs: 50, activationMs: 1000, eventQueue: 4,
  auditCapacity: 4096, maxInstances: 64, maxScopes: 64, maxGrants: 512,
  maxEffects: 128, maxCalls: 64 };
const clone = (x) => JSON.parse(JSON.stringify(x));
function key() {
  const pair = generateKeyPairSync('ed25519');
  const raw = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  return { privateKey: pair.privateKey, id: rawDigest(raw), encoded: raw.toString('base64') };
}
function signature(value, domain, k) {
  return { algorithm: 'ed25519', keyId: k.id,
    signature: sign(null, Buffer.from(domain + '\n' + canonical(value)), k.privateKey).toString('base64') };
}
function material(k, version) {
  const policy = { schemaVersion: 'alica.trust-policy/v1', version, rootKeyIds: [k.id],
    publishers: [{ id: 'org.alica.synthetic', keyIds: [k.id], executionModes: ['ipc'] }],
    issuedAtMs: 10, expiresAtMs: 100, maxOfflineAgeMs: 50 };
  const revocation = { schemaVersion: 'alica.revocation/v1', version,
    issuedAtMs: 10, expiresAtMs: 100, revokedKeyIds: [], revokedArtifactDigests: [] };
  return { rootKeyId: k.id, keys: { [k.id]: k.encoded }, policy, revocation,
    policySignature: signature(policy, 'ALICA-TRUST-POLICY-v1', k),
    revocationSignature: signature(revocation, 'ALICA-REVOCATION-v1', k) };
}
function state(m) {
  return { cellId: config.cellId, rootKeyId: m.rootKeyId,
    policyVersion: m.policy.version, policyDigest: digest(m.policy),
    revocationVersion: m.revocation.version, revocationDigest: digest(m.revocation), timeMs: 20 };
}
// These mutable builtin traps are scoped to one serial test; restore even on assertion failure.
// Not a syscall proof or sandbox test. Actual behavior remains unqualified until run.
test('read-only persisted trust inspection: exact authentication and closed failures', () => {
  // Structural guard supplements runtime traps; it is not proof of transitive purity.
  const source = fs.readFileSync(new URL('../../packages/kernel/src/trust-inspection.ts', import.meta.url), 'utf8');
  assert(!/new\s+(Host|Trust)\b|\b(setTimeout|setInterval|setImmediate|bootstrap)\s*\(/.test(source));
  const dir = fs.mkdtempSync(join(tmpdir(), 'alica-inspection-'));
  const statePath = join(dir, 'state');
  const a = key(), b = key(), priorTrust = material(a, 1), nextTrust = material(b, 2);
  const record = { schemaVersion: 'alica.root-rotation/v1', priorVersion: 1, nextVersion: 2,
    priorPolicyDigest: digest(priorTrust.policy), nextPolicyDigest: digest(nextTrust.policy),
    priorKeyId: a.id, nextKeyId: b.id };
  const rotation = { record, oldSignature: signature(record, 'ALICA-ROOT-ROTATION-v1', a),
    newSignature: signature(record, 'ALICA-ROOT-ROTATION-v1', b) };
  const pin = (o) => ({ cellId: config.cellId, priorTrustDigest: digest(o.priorTrust),
    nextTrustDigest: digest(o.nextTrust), rotationDigest: digest(o.rotation) });
  const options = { statePath, priorTrust, nextTrust, rotation };
  options.independentPin = pin(options); // Test harness stands in for independent provisioning.
  const save = (value) => fs.writeFileSync(statePath, typeof value === 'string' ? value : canonical(value));
  function observe(o = options, text = canonical(config), inject = {}) {
    const original = {}, globalOriginal = {};
    const opened = [], closed = [];
    const realOpen = fs.openSync, realClose = fs.closeSync;
    const originalNow = Date.now;
    const replace = (name, fn) => { original[name] = fs[name]; fs[name] = fn; };
    try {
      for (const name of ['writeFileSync', 'writeSync', 'appendFileSync', 'mkdirSync',
        'renameSync', 'unlinkSync', 'rmSync', 'fsyncSync', 'fdatasyncSync', 'truncateSync',
        'ftruncateSync', 'chmodSync', 'fchmodSync', 'chownSync', 'fchownSync', 'utimesSync',
        'futimesSync', 'linkSync', 'symlinkSync', 'copyFileSync']) {
        replace(name, () => { assert.fail('forbidden filesystem mutation: ' + name); });
      }
      // Assertions inside the API can be caught: counters independently detect forbidden effects.
      let forbidden = 0;
      for (const name of Object.keys(original)) fs[name] = () => { forbidden++; throw Error(name); };
      for (const name of ['setTimeout', 'setInterval', 'setImmediate']) {
        globalOriginal[name] = globalThis[name];
        globalThis[name] = () => { forbidden++; throw Error(name); };
      }
      Date.now = () => { forbidden++; throw Error('clock'); };
      replace('openSync', (path, flags, ...rest) => {
        assert.equal(path, o.statePath);
        assert.equal(flags, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        if (inject.open) throw Error('open');
        const fd = realOpen(path, flags, ...rest); opened.push(fd); return fd;
      });
      replace('closeSync', (fd) => {
        assert(opened.includes(fd)); assert(!closed.includes(fd)); closed.push(fd);
        realClose(fd);
        if (inject.close) throw Error('close');
      });
      for (const name of ['readSync', 'fstatSync']) if (inject[name]) {
        const real = fs[name]; replace(name, (...args) => inject[name](real, ...args));
      }
      syncBuiltinESMExports();
      try {
        const result = inspectPersistedTrust(text, o);
        assert.equal(forbidden, 0, 'no mutation/timers/clock, even when errors are caught');
        assert.deepEqual(closed, opened, 'only newly owned descriptors closed exactly once');
        assert(Object.isFrozen(result));
        return result;
      } finally { Date.now = originalNow; }
    } finally {
      Date.now = originalNow;
      for (const [name, fn] of Object.entries(original)) fs[name] = fn;
      for (const [name, fn] of Object.entries(globalOriginal)) globalThis[name] = fn;
      syncBuiltinESMExports();
    }
  }
  try {
    for (const [classification, m] of [['EXACT_PRIOR', priorTrust], ['EXACT_NEXT', nextTrust]]) {
      save(state(m));
      fs.writeFileSync(statePath + '.next', 'preserve opaque pending bytes');
      const before = fs.readFileSync(statePath);
      const pending = fs.readFileSync(statePath + '.next');
      const statBefore = fs.statSync(statePath);
      const result = observe();
      assert.deepEqual(result, { schemaVersion: 'alica.trust-inspection/v1', cellId: config.cellId,
        classification, policyVersion: m.policy.version, policyDigest: digest(m.policy),
        revocationVersion: m.revocation.version, revocationDigest: digest(m.revocation), lastWallMs: 20 });
      assert.deepEqual(fs.readFileSync(statePath), before);
      assert.deepEqual(fs.readFileSync(statePath + '.next'), pending);
      const statAfter = fs.statSync(statePath);
      for (const k of ['ino', 'mode', 'uid', 'gid', 'size', 'mtimeMs', 'ctimeMs']) assert.equal(statAfter[k], statBefore[k]);
      // Historical signatures do not assert freshness: even post-expiry observations classify.
      save({ ...state(m), timeMs: 1000 });
      assert.equal(observe().classification, classification);
    }
    save(state(priorTrust));
    for (const mutate of [
      (o) => { o.independentPin.priorTrustDigest = digest('wrong'); },
      (o) => { o.independentPin.nextTrustDigest = digest('wrong'); },
      (o) => { o.independentPin.rotationDigest = digest('wrong'); },
      (o) => { o.independentPin.cellId = 'other'; },
      (o) => { o.priorTrust.policySignature.signature = Buffer.alloc(64).toString('base64'); },
      (o) => { o.nextTrust.revocationSignature.signature = Buffer.alloc(64).toString('base64'); },
      (o) => { o.rotation.oldSignature = o.rotation.newSignature; },
      (o) => { o.rotation.newSignature = o.rotation.oldSignature; },
      (o) => { o.rotation.record.nextPolicyDigest = digest('wrong'); },
    ]) { const o = clone(options); mutate(o); assert.deepEqual(observe(o), unresolved); }
    // Repin bad material to reach crypto/tuple checks independently of pin mismatch.
    for (const mutate of [
      (o) => { o.priorTrust.policySignature.signature = Buffer.alloc(64).toString('base64'); },
      (o) => { o.nextTrust.revocationSignature.signature = Buffer.alloc(64).toString('base64'); },
      (o) => { o.rotation.oldSignature = o.rotation.newSignature; },
      (o) => { o.rotation.newSignature = o.rotation.oldSignature; },
      (o) => { o.rotation.record.nextPolicyDigest = digest('wrong');
        o.rotation.oldSignature = signature(o.rotation.record, 'ALICA-ROOT-ROTATION-v1', a);
        o.rotation.newSignature = signature(o.rotation.record, 'ALICA-ROOT-ROTATION-v1', b); },
    ]) { const o = clone(options); mutate(o); o.independentPin = pin(o); assert.deepEqual(observe(o), unresolved); }
    for (const change of [{ cellId: 'other' }, { rootKeyId: b.id }, { policyVersion: 2 },
      { policyDigest: digest('wrong') }, { revocationVersion: 2 }, { revocationDigest: digest('wrong') },
      { timeMs: -1 }, { timeMs: 9 }, { timeMs: '20' }, { policyVersion: true },
      { rootKeyId: 1 }, { cellId: ['inspection-test'] }, { extra: true },
      { schemaVersion: 'unsupported' }]) { save({ ...state(priorTrust), ...change }); assert.deepEqual(observe(), unresolved); }
    for (const text of ['null', '[]', '{}', '{', '', 'x'.repeat(4097),
      canonical(state(priorTrust)).replace('"timeMs":20', '"timeMs":9007199254740992'),
      canonical(state(priorTrust)).replace('"timeMs":20', '"timeMs":20,"timeMs":20')]) {
      save(text); assert.deepEqual(observe(), unresolved);
    }
    save(state(priorTrust));
    const callerFd = fs.openSync(statePath, 'r');
    try {
      assert.equal(observe(options, canonical(config), { readSync(real, fd, bytes, offset, length, position) {
        return real(fd, bytes, offset, Math.min(3, length), position);
      } }).classification, 'EXACT_PRIOR');
      assert(fs.fstatSync(callerFd).isFile(), 'caller-owned descriptor remains open');
    } finally { fs.closeSync(callerFd); }
    for (const k of Object.keys(state(priorTrust))) {
      const missing = state(priorTrust); delete missing[k]; save(missing);
      assert.deepEqual(observe(), unresolved);
    }
    save(state(priorTrust));
    for (const value of [null, [], 7, 'x', { ...options, statePath: 7 },
      { ...options, extra: true }, { ...options, independentPin: null }]) assert.deepEqual(observe(value), unresolved);
    let getterCalled = false;
    const accessor = { ...options };
    Object.defineProperty(accessor, 'statePath', { enumerable: true, get() { getterCalled = true; return statePath; } });
    assert.deepEqual(observe(accessor), unresolved); assert.equal(getterCalled, false);
    for (const text of ['null', '{}', canonical({ ...config, cellId: 7 }),
      canonical({ ...config, maxCalls: '64' }), canonical({ ...config, timeTrusted: false })]) assert.deepEqual(observe(options, text), unresolved);
    for (const inject of [{ open: true }, { close: true },
      { readSync() { throw Error('read'); } }, { fstatSync() { throw Error('stat'); } },
      { readSync() { return 0; } },
      { fstatSync(real, ...args) { const s = real(...args); s.size = 4097n; return s; } },
    ]) assert.deepEqual(observe(options, canonical(config), inject), unresolved);
    let stats = 0;
    assert.deepEqual(observe(options, canonical(config), { fstatSync(real, ...args) {
      const s = real(...args); if (++stats === 2) s.mtimeNs += 1n; return s;
    } }), unresolved);
    fs.unlinkSync(statePath);
    assert.deepEqual(observe(), unresolved); assert.equal(fs.existsSync(statePath), false);
    fs.symlinkSync(statePath + '.next', statePath);
    assert.deepEqual(observe(), unresolved); assert(fs.lstatSync(statePath).isSymbolicLink());
    fs.unlinkSync(statePath); fs.mkdirSync(statePath);
    assert.deepEqual(observe(), unresolved); assert(fs.statSync(statePath).isDirectory());
    assert.deepEqual(fs.readdirSync(dir).sort(), ['state', 'state.next']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
