import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { Scheduler } from '../../packages/kernel/dist/g6/scheduler.js';
import { WireBudget } from '../../packages/kernel/dist/g6/wire.js';
import { AcapError } from '@alica/acap-contracts';
const input = (extra = {}) => ({
  scope: 'root',
  purpose: 'invoke',
  requestedMs: 5000,
  encodedBytes: 32,
  authorize() {},
  ...extra,
});
function fixture(t, id = 'a'.repeat(64)) {
  const failures = [],
    budget = new WireBudget();
  const scheduler = new Scheduler(id, 1, budget, (code) => failures.push(code));
  t.after(() => {
    scheduler.reaped();
    assert.deepEqual(budget.usage, { bytes: 0, frames: 0, control: 0 });
  });
  return { scheduler, budget, failures };
}
test('ordinary overlap, FIFO roots and reserved nested/lifecycle admission', async (t) => {
  const { scheduler: s } = fixture(t);
  const roots = await Promise.all(
    Array.from({ length: 4 }, () => s.admit(input())),
  );
  let dispatched = false;
  const queued = s.admit(input()).then((c) => {
    dispatched = true;
    return c;
  });
  const nested = await Promise.all(
    Array.from({ length: 4 }, () => s.admit(input({ parent: roots[0] }))),
  );
  const lifecycle = await s.admit(input({ purpose: 'lifecycle' }));
  assert.equal(dispatched, false);
  assert.deepEqual(s.usage, {
    ordinary: 4,
    nested: 4,
    lifecycle: 1,
    queued: 1,
    records: 10,
    offers: 0,
    failed: false,
  });
  await assert.rejects(s.admit(input({ parent: roots[1] })), {
    code: 'RESOURCE_EXHAUSTED',
  });
  roots[1].finish();
  assert.equal((await queued).terminal, undefined);
  for (const c of [...roots, ...nested, lifecycle]) c.finish();
});
test('actual queued timeout retains original clock and never dispatches', async (t) => {
  const { scheduler: s } = fixture(t);
  await Promise.all(Array.from({ length: 4 }, () => s.admit(input())));
  await assert.rejects(s.admit(input({ requestedMs: 20 })), {
    code: 'DEADLINE_EXCEEDED',
  });
  assert.equal(s.usage.queued, 0);
  assert.equal(s.usage.records, 4);
});
test('A to B to A ancestry succeeds; parent cancellation does not affect sibling', async (t) => {
  const { scheduler: a } = fixture(t),
    { scheduler: b } = fixture(t, 'b'.repeat(64));
  const root = await a.admit(input()),
    sibling = await a.admit(input());
  const middle = await b.admit(input({ parent: root }));
  const back = await a.admit(input({ parent: middle }));
  assert.equal(back.depth, 3);
  assert.ok(back.end <= root.end);
  root.finish('PERMISSION_DENIED');
  assert.equal(middle.terminal, 'PERMISSION_DENIED');
  assert.equal(back.terminal, 'PERMISSION_DENIED');
  sibling.assertLive();
  assert.equal(a.usage.records, 1);
  assert.equal(b.usage.records, 0);
});
test('depth eight succeeds, nine rejects immediately', async (t) => {
  const { scheduler: a } = fixture(t),
    { scheduler: b } = fixture(t, 'b'.repeat(64));
  let parent;
  for (let i = 0; i < 8; i++)
    parent = await (i % 2 ? b : a).admit(input({ parent }));
  assert.equal(parent.depth, 8);
  await assert.rejects(a.admit(input({ parent })), {
    code: 'RESOURCE_EXHAUSTED',
  });
});
test('expired unconsumed offer retains slot/bytes; foreign ACK cannot release it', async (t) => {
  const { scheduler: s, budget } = fixture(t);
  const c = await s.admit(input());
  const offer = s.offer(c);
  c.finish('DEADLINE_EXCEEDED');
  assert.equal(s.usage.offers, 1);
  assert.equal(budget.usage.bytes, 32);
  assert.throws(() => s.acknowledge('b'.repeat(64), 1, c.id, offer.offerId), {
    code: 'UNAUTHENTICATED',
  });
  assert.throws(() => s.acknowledge(s.sessionId, 1, c.id, '0'.repeat(64)), {
    code: 'UNAUTHENTICATED',
  });
  assert.equal(s.usage.offers, 1);
  assert.equal(s.acknowledge(s.sessionId, 1, c.id, offer.offerId), undefined);
  assert.equal(s.usage.records, 0);
  assert.throws(() => s.acknowledge(s.sessionId, 1, c.id, offer.offerId), {
    code: 'UNAUTHENTICATED',
  });
});
test('hard offer expiry quarantines until physical reap, not logical failure', async (t) => {
  const { scheduler: s, failures, budget } = fixture(t);
  const c = await s.admit(input());
  s.offer(c);
  c.finish('CANCELLED');
  await delay(1100);
  assert.deepEqual(failures, ['UNAVAILABLE']);
  assert.equal(s.usage.offers, 1);
  assert.equal(s.usage.ordinary, 1);
  assert.equal(budget.usage.frames, 1);
  assert.equal(c.terminal, 'CANCELLED');
  s.reaped();
  assert.equal(s.usage.records, 0);
});
test('queued authorization is rechecked; rejected head cannot block following work', async (t) => {
  const { scheduler: s } = fixture(t);
  const roots = await Promise.all(
    Array.from({ length: 4 }, () => s.admit(input())),
  );
  let allowed = true;
  const denied = s.admit(
    input({
      authorize() {
        if (!allowed) throw new AcapError('PERMISSION_DENIED');
      },
    }),
  );
  const rejection = assert.rejects(denied, { code: 'PERMISSION_DENIED' });
  const next = s.admit(input());
  allowed = false;
  roots[0].finish();
  await rejection;
  (await next).assertLive();
  assert.equal(s.usage.queued, 0);
});
test('pre-abort and shared byte exhaustion leave no partial admission', async (t) => {
  const { scheduler: s, budget } = fixture(t);
  await assert.rejects(s.admit(input({ signal: AbortSignal.abort() })), {
    code: 'CANCELLED',
  });
  const release = budget.reserve(8388608);
  await assert.rejects(s.admit(input()), { code: 'RESOURCE_EXHAUSTED' });
  assert.equal(s.usage.records, 0);
  release();
});
