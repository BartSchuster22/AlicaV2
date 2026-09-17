import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicKey, verify } from 'node:crypto';
import test from 'node:test';
import { bootstrap, canonical, digest } from '@alica/kernel';
import { config } from '../../tools/g3-fixtures.mjs';

const fixture = JSON.parse(
  execFileSync(
    'python3',
    ['-S', 'tools/g7-bootstrap-trust.py', '--test-fixture'],
    {
      encoding: 'utf8',
      timeout: 15000,
    },
  ),
);
assert.equal(fixture.testOnly, true);
const original = fixture.material;
async function withTrust(
  fn,
  material = structuredClone(original),
  now = fixture.nowMs,
) {
  const dir = mkdtempSync(join(tmpdir(), 'alica-g7-trust-test-'));
  const hosts = [];
  const construct = (m, path, clock, cellId = 'g7-ephemeral-test-cell') => {
    const host = bootstrap(canonical({ ...config, cellId }), {
      trust: m,
      statePath: path,
      now: clock,
      initialize: true,
    });
    hosts.push(host);
    return host;
  };
  try {
    return await fn(material, join(dir, 'water.json'), () => now, construct);
  } finally {
    for (const host of hosts) await host.shutdown();
    rmSync(dir, { recursive: true, force: true });
  }
}
function reject(mutator, now = fixture.nowMs) {
  const material = structuredClone(original);
  mutator(material);
  return assert.rejects(() =>
    withTrust(
      (m, p, clock, construct) => construct(m, p, clock),
      material,
      now,
    ),
  );
}

test('Python root signatures are accepted by the unchanged production Kernel verifier', () => {
  return withTrust((material, path, now, construct) => {
    const trust = construct(material, path, now);
    trust.createScope(config.rootScope);
    const water = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(water.rootKeyId, material.rootKeyId);
    assert.equal(water.policyDigest, digest(material.policy));
    assert.equal(water.policyVersion, 1);
    assert.equal(water.revocationVersion, 1);
  });
});

test('root policy authorizes only the designated publisher and IPC execution', () => {
  assert.equal(original.policy.publishers.length, 1);
  assert.equal(original.policy.publishers[0].id, 'org.aquiero.alica');
  assert.deepEqual(original.policy.publishers[0].executionModes, ['ipc']);
  assert.notEqual(original.policy.publishers[0].keyIds[0], original.rootKeyId);
});

test('signature domains are not interchangeable', () => {
  const raw = Buffer.from(original.keys[original.rootKeyId], 'base64');
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
    format: 'der',
    type: 'spki',
  });
  const signature = Buffer.from(original.policySignature.signature, 'base64');
  assert.equal(
    verify(
      null,
      Buffer.from('ALICA-TRUST-POLICY-v1\n' + canonical(original.policy)),
      key,
      signature,
    ),
    true,
  );
  assert.equal(
    verify(
      null,
      Buffer.from('ALICA-BUNDLE-v1\n' + canonical(original.policy)),
      key,
      signature,
    ),
    false,
  );
});

test('tampered policy is rejected', () => reject((m) => m.policy.version++));
test('prohibited inproc trust expansion is rejected', () =>
  reject((m) => m.policy.publishers[0].executionModes.push('inproc')));
test('root substitution is rejected', () =>
  reject((m) => (m.rootKeyId = m.policy.publishers[0].keyIds[0])));
test('wrong public bytes under approved key ID are rejected', () =>
  reject((m) => (m.keys[m.rootKeyId] = Buffer.alloc(32).toString('base64'))));
test('missing signature is rejected', () =>
  reject((m) => delete m.policySignature));
test('noncanonical signature encoding is rejected', () =>
  reject((m) => (m.policySignature.signature += '\n')));
test('tampered revocation metadata is rejected', () =>
  reject((m) =>
    m.revocation.revokedKeyIds.push(m.policy.publishers[0].keyIds[0]),
  ));
test('metadata issued in the future is rejected', () =>
  reject(() => {}, fixture.nowMs - 1));
test('expired revocation metadata is rejected', () =>
  reject(() => {}, original.revocation.expiresAtMs));
test('old policy age also blocks activation despite nominal policy expiry', () =>
  reject(
    () => {},
    original.policy.issuedAtMs + original.policy.maxOfflineAgeMs + 1,
  ));
test('unknown policy fields are rejected', () =>
  reject((m) => (m.policy.skipChecks = true)));

test('backward clock movement fails closed', () => {
  return withTrust((material, path, unused, construct) => {
    let now = fixture.nowMs;
    const trust = construct(material, path, () => now);
    now++;
    trust.createScope(config.rootScope);
    now -= 2;
    assert.throws(() => trust.createScope(config.rootScope));
  });
});

test('existing high-water state cannot be reset using initialize=true', () => {
  return withTrust((material, path, now, construct) => {
    construct(material, path, now);
    assert.throws(() => construct(material, path, now, 'different-cell'));
  });
});
