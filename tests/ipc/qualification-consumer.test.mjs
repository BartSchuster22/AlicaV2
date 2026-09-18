// Identical package strings and consumer assertions for both production factories.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  a,
  b,
  sourceA,
  sourceB,
  factory,
} from './qualification-consumer-fixture.mjs';
async function consumer(e) {
  const call = (bound, text, options = {}) =>
    bound.call('run', text, { deadlineMs: Date.now() + 4500, ...options });
  // The upstream consumer is granted B; A is not. Its outbound must be denied.
  await assert.rejects(call(e.ca, 'deny'), { code: 'PERMISSION_DENIED' });
  const grantA = e.grant(e.A, b.id, ['run']);
  e.grant(e.B, a.id, ['run']);
  assert.equal(await call(e.ca, 'nest:2'), 'leaf', 'actual A -> B -> A');
  assert.equal(
    await call(e.ca, 'nest:4'),
    'leaf',
    'deeper real repeated provider visits',
  );
  await assert.rejects(call(e.ca, 'nest:24'), { code: 'RESOURCE_EXHAUSTED' });
  assert.equal(
    await call(e.cb, 'leaf'),
    'leaf',
    'depth exhaustion does not poison unrelated calls',
  );
  const controller = new AbortController();
  const parent = call(e.ca, 'descendant', { signal: controller.signal });
  const rejected = assert.rejects(parent, { code: 'CANCELLED' });
  const end = Date.now() + 4000;
  while ((await call(e.cb, 'counts')).split(':')[0] === '0') {
    assert.ok(Date.now() < end);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const healthy = call(e.cb, 'slow');
  controller.abort();
  await rejected;
  assert.equal(
    await healthy,
    'slow',
    'unrelated live context survives ancestor cancellation',
  );
  while ((await call(e.cb, 'counts')).split(':')[1] === '0') {
    assert.ok(Date.now() < end);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const expired = assert.rejects(
    call(e.ca, 'descendant', { deadlineMs: Date.now() + 80 }),
    { code: 'DEADLINE_EXCEEDED' },
  );
  assert.equal(
    await call(e.cb, 'slow'),
    'slow',
    'unrelated live context survives sibling deadline',
  );
  await expired;
  // A deadline may expire before downstream admission. Observe the actual
  // baseline instead of assuming the expired invocation entered provider B.
  const beforeRevocation = Number((await call(e.cb, 'counts')).split(':')[0]);
  const pending = call(e.ca, 'descendant');
  const revoked = assert.rejects(pending, { code: 'PERMISSION_DENIED' });
  const revocationEnd = Date.now() + 4000;
  while (
    Number((await call(e.cb, 'counts')).split(':')[0]) <= beforeRevocation
  ) {
    assert.ok(Date.now() < revocationEnd);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const independent = call(e.cb, 'slow');
  e.host.revokeGrant(grantA.grantId);
  await revoked;
  assert.equal(
    await independent,
    'slow',
    'unrelated live context survives sibling grant revocation',
  );
  assert.equal(await call(e.ca, 'mutate'), '1');
  await e.host.dispose(e.A);
  await assert.rejects(call(e.ca, 'mutate'), { code: 'UNAVAILABLE' });
  assert.equal(
    await call(e.cb, 'leaf'),
    'leaf',
    'optional provider loss does not quiesce independent consumer',
  );
}
for (const mode of ['inproc', 'ipc'])
  test(
    `same-source matrix consumer ${mode}: ancestry, authority and live sibling independence`,
    { timeout: 30000 },
    async (t) => {
      t.diagnostic(
        JSON.stringify({
          consumerSHA256: createHash('sha256')
            .update(consumer.toString())
            .digest('hex'),
          providerASHA256: createHash('sha256').update(sourceA).digest('hex'),
          providerBSHA256: createHash('sha256').update(sourceB).digest('hex'),
        }),
      );
      await consumer(await factory(t, mode));
    },
  );
