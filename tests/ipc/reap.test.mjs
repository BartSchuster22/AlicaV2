import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { observeReap } from '../../packages/kernel/src/g6/reap.ts';

// Pure observation tests, NOT native exit/reap or confinement qualification.
test('observed exit returns the actual receipt, without timeout side effects', async () => {
  const receipt = Object.freeze({ pid: 1, code: null, signal: 'SIGKILL' });
  let expired = false;
  assert.equal(
    await observeReap(Promise.resolve(receipt), 10, () => {
      expired = true;
      return Error('unexpected expiry');
    }),
    receipt,
  );
  await delay(20);
  assert.equal(expired, false);
});

test('unobserved reap rejects within a bound and does not release quarantine', async () => {
  let observeExit;
  let quarantined = true;
  const exited = new Promise((resolve) => {
    observeExit = resolve;
  });
  void exited.then(() => {
    quarantined = false;
  });
  const error = Error('unreaped');
  const start = performance.now();
  await assert.rejects(
    observeReap(exited, 20, () => error),
    (value) => value === error,
  );
  assert.ok(performance.now() - start < 1000);
  assert.equal(quarantined, true);
  observeExit('physical exit');
  assert.equal(await exited, 'physical exit');
  await Promise.resolve();
  assert.equal(quarantined, false);
});

test('late exit cannot change the first rejected observation', async () => {
  let observeExit;
  const exited = new Promise((resolve) => {
    observeExit = resolve;
  });
  const error = Error('unreaped');
  const result = observeReap(exited, 10, () => error);
  await assert.rejects(result, (value) => value === error);
  observeExit('late receipt');
  await assert.rejects(result, (value) => value === error);
  assert.equal(
    await observeReap(exited, 10, () => Error('unexpected')),
    'late receipt',
  );
});

test('independent observation clocks do not inherit sibling timeout', async () => {
  const error = Error('unreaped sibling');
  const slow = observeReap(new Promise(() => {}), 10, () => error);
  const failed = assert.rejects(slow, (value) => value === error);
  const healthy = observeReap(delay(30, 'receipt'), 500, () =>
    Error('unexpected'),
  );
  await failed;
  assert.equal(await healthy, 'receipt');
});
