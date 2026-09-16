import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin, onceDisposer, clientEndpoint } from '@alica/plugin-sdk';
import { createTestCell } from '@alica/testkit';
import { digest } from '@alica/acap-contracts';
const d = {
  schemaVersion: 'acap.capability/v1',
  id: 'org.sdk.sum',
  version: '1.0.0',
  features: [],
  operations: [
    {
      name: 'sum',
      kind: 'unary',
      idempotency: 'none',
      input: {
        type: 'object',
        properties: { a: { type: 'integer' }, b: { type: 'integer' } },
        required: ['a', 'b'],
        additionalProperties: false,
      },
      output: { type: 'integer' },
    },
  ],
};
const requirement = {
  capabilityId: d.id,
  major: 1,
  minMinor: 0,
  operations: ['sum'],
  features: [],
};
const events = {
  schemaVersion: 'acap.event-descriptor/v1',
  id: 'org.sdk.changed',
  version: '1.0.0',
  payload: { type: 'string', maxLength: 32 },
};
const empty = definePlugin({ activate() {} }),
  options = () => ({ deadlineMs: Date.now() + 500 });
const is = (code) => (e) => e.code === code;
async function fixture(t, variant = false) {
  const cell = createTestCell();
  t.after(() => cell.close());
  const provider = cell.instance({ id: 'org.sdk.provider' });
  await provider.activate(
    definePlugin({
      activate(ctx) {
        ctx.provide(d, {
          sum: async (x) =>
            variant ? [x.a, x.b].reduce((a, b) => a + b, 0) : x.a + x.b,
        });
      },
    }),
  );
  const consumer = cell.instance({
    id: 'org.sdk.consumer',
    permissions: { capabilities: { [d.id]: ['sum'] } },
  });
  await consumer.activate(empty);
  const handle = await consumer.context.require(requirement);
  return { cell, provider, consumer, handle };
}
test('public SDK provides, resolves, and bridges generated endpoints', async (t) => {
  const { handle } = await fixture(t);
  const endpoint = clientEndpoint(handle, d);
  assert.equal(await endpoint.call('sum', { a: 2, b: 3 }, options()), 5);
  assert(Object.isFrozen(handle));
  assert.throws(
    () => clientEndpoint(handle, { ...d, version: '1.1.0' }),
    is('CONTRACT_MISMATCH'),
  );
});
test('independently implemented provider substitutes without consumer changes', async (t) => {
  for (const variant of [false, true]) {
    const { handle } = await fixture(t, variant);
    assert.equal(await handle.call('sum', { a: -3, b: 8 }, options()), 5);
  }
});
test('missing optional returns null but denied optional does not hide permissions', async (t) => {
  const cell = createTestCell();
  t.after(() => cell.close());
  const allowed = cell.instance({
    id: 'org.sdk.allowed',
    permissions: { capabilities: { [d.id]: ['sum'] } },
  });
  await allowed.activate(empty);
  assert.equal(await allowed.context.optional(requirement), null);
  await assert.rejects(allowed.context.require(requirement), is('NOT_FOUND'));
  const denied = cell.instance({ id: 'org.sdk.denied' });
  await denied.activate(empty);
  await assert.rejects(
    denied.context.optional(requirement),
    is('PERMISSION_DENIED'),
  );
});
test('optional does not hide incompatible present provider', async (t) => {
  const { consumer } = await fixture(t);
  await assert.rejects(
    consumer.context.optional({ ...requirement, major: 2 }),
    is('INCOMPATIBLE_VERSION'),
  );
});
test('idempotent disposer shares result and rejection without executing twice', async () => {
  let n = 0;
  const dispose = onceDisposer(async () => {
    n++;
    throw { code: 'INTERNAL', message: 'private' };
  });
  const a = dispose(),
    b = dispose();
  assert.equal(a, b);
  await assert.rejects(a, is('INTERNAL'));
  await assert.rejects(b, is('INTERNAL'));
  assert.equal(n, 1);
});
test('owned effects clean in reverse order and partial acquisition cleans immediately', async (t) => {
  const cell = createTestCell();
  t.after(() => cell.close());
  const i = cell.instance({ id: 'org.sdk.effects' }),
    order = [];
  await i.activate(
    definePlugin({
      async activate(ctx) {
        await ctx.effect(async (own) => {
          own(async () => {
            order.push('first');
          });
        });
        await assert.rejects(
          ctx.effect(async (own) => {
            own(async () => {
              order.push('partial');
            });
            throw { code: 'CONFLICT' };
          }),
          is('CONFLICT'),
        );
        await ctx.effect(async (own) => {
          own(async () => {
            order.push('last');
          });
        });
      },
    }),
  );
  assert.deepEqual(order, ['partial']);
  await i.dispose();
  await i.dispose();
  assert.deepEqual(order, ['partial', 'last', 'first']);
});
test('activation injection rolls back staged providers and acquired effects', async (t) => {
  const cell = createTestCell();
  t.after(() => cell.close());
  const i = cell.instance({ id: 'org.sdk.activation' });
  let disposed = 0;
  i.failNext('activation');
  await assert.rejects(
    i.activate(
      definePlugin({
        async activate(ctx) {
          ctx.provide(d, { sum: async () => 0 });
          await ctx.effect(async (own) =>
            own(async () => {
              disposed++;
            }),
          );
        },
      }),
    ),
    is('INTERNAL'),
  );
  assert.equal(i.state, 'FAILED');
  assert.equal(disposed, 1);
  assert.equal(cell.inspect().providers, 0);
});
test('revocation injection rejects existing handle before provider dispatch', async (t) => {
  const { consumer, handle, cell } = await fixture(t);
  consumer.failNext('revocation');
  await assert.rejects(
    handle.call('sum', { a: 1, b: 2 }, options()),
    is('PERMISSION_DENIED'),
  );
  assert.equal(cell.inspect().pending, 0);
  await assert.rejects(
    handle.call('sum', { a: 1, b: 2 }, options()),
    is('PERMISSION_DENIED'),
  );
});
test('timeout injection is deterministic, one-shot, and not elapsed-time simulation', async (t) => {
  const { consumer, handle } = await fixture(t);
  consumer.failNext('timeout');
  await assert.rejects(
    handle.call('sum', { a: 1, b: 2 }, options()),
    is('DEADLINE_EXCEEDED'),
  );
  assert.equal(await handle.call('sum', { a: 1, b: 2 }, options()), 3);
});
test('cleanup injection is reported while remaining cleanups continue', async (t) => {
  const cell = createTestCell();
  t.after(() => cell.close());
  const i = cell.instance({ id: 'org.sdk.cleanup' });
  let n = 0;
  await i.activate(
    definePlugin({
      async activate(ctx) {
        for (let k = 0; k < 2; k++)
          await ctx.effect(async (own) =>
            own(async () => {
              n++;
            }),
          );
      },
    }),
  );
  i.failNext('cleanup');
  const report = await i.dispose();
  assert.equal(n, 2);
  assert.equal(report.state, 'FAILED');
  assert.deepEqual(report.failedDisposers, ['INTERNAL']);
  assert.equal(report.restartRequired, true);
  assert.deepEqual(await i.dispose(), report);
});
test('cleanup timeout is visible and does not hang disposal', async (t) => {
  const cell = createTestCell({ cleanupMs: 5 });
  t.after(() => cell.close());
  const i = cell.instance({ id: 'org.sdk.stuck' });
  await i.activate(
    definePlugin({
      async activate(ctx) {
        await ctx.effect(async (own) => own(() => new Promise(() => {})));
      },
    }),
  );
  const report = await i.dispose();
  assert.equal(report.timedOutResources, 1);
  assert.equal(report.restartRequired, true);
  assert.deepEqual(report.failedDisposers, ['DEADLINE_EXCEEDED']);
});
test('destroyed child handles cannot escape their owning scope', async (t) => {
  const { cell, consumer } = await fixture(t);
  const child = consumer.context.createScope();
  await assert.rejects(child.require(requirement), is('PERMISSION_DENIED'));
  cell.grantScope(consumer, child.scope);
  const h = await child.require(requirement);
  assert.equal(await h.call('sum', { a: 1, b: 2 }, options()), 3);
  await cell.destroyScope(child.scope);
  await assert.rejects(
    h.call('sum', { a: 1, b: 2 }, options()),
    is('UNAVAILABLE'),
  );
});
test('provider disposal invalidates old handles instead of rebinding', async (t) => {
  const { provider, handle } = await fixture(t);
  await provider.dispose();
  await assert.rejects(
    handle.call('sum', { a: 1, b: 2 }, options()),
    is('UNAVAILABLE'),
  );
});
test('typed events validate payloads and deliver immutable broker envelopes', async (t) => {
  const cell = createTestCell({ events: [events] });
  t.after(() => cell.close());
  const seen = [];
  const listener = cell.instance({
    id: 'org.sdk.listener',
    permissions: { subscribe: [events.id] },
  });
  await listener.activate(
    definePlugin({
      activate(ctx) {
        ctx.events(events).on(async (e) => {
          seen.push(e);
          assert(Object.isFrozen(e));
          assert.equal(e.contractDigest, digest(events));
        });
      },
    }),
  );
  const source = cell.instance({
    id: 'org.sdk.source',
    permissions: { publish: [events.id] },
  });
  await source.activate(empty);
  assert.equal((await source.context.events(events).emit('hello')).admitted, 1);
  await cell.flush();
  assert.equal(seen[0].data, 'hello');
  assert.throws(
    () => source.context.events(events).emit(42),
    is('INVALID_ARGUMENT'),
  );
  await listener.dispose();
  assert.equal((await source.context.events(events).emit('later')).admitted, 0);
});
test('secret references are scoped and logs refuse arbitrary data fields', async (t) => {
  const cell = createTestCell({ secrets: { test_token: 'synthetic-private' } });
  t.after(() => cell.close());
  const i = cell.instance({
    id: 'org.sdk.secret',
    permissions: { secrets: ['test_token'] },
  });
  await i.activate(empty);
  assert.equal(await i.context.secret('test_token'), 'synthetic-private');
  await assert.rejects(i.context.secret('other'), is('PERMISSION_DENIED'));
  await assert.rejects(
    i.context.createScope().secret('test_token'),
    is('PERMISSION_DENIED'),
  );
  i.context.log({ level: 'info', event: 'checkpoint' });
  assert.throws(
    () =>
      i.context.log({
        level: 'info',
        event: 'checkpoint',
        value: 'synthetic-private',
      }),
    is('INVALID_ARGUMENT'),
  );
  assert(!JSON.stringify(cell.inspect()).includes('synthetic-private'));
});
test('invalid input and unknown operation retain exact ACAP rejection codes', async (t) => {
  const { handle } = await fixture(t);
  await assert.rejects(
    handle.call('sum', { a: '1', b: 2 }, options()),
    is('INVALID_ARGUMENT'),
  );
  await assert.rejects(handle.call('other', {}, options()), is('NOT_FOUND'));
});

test('uncooperative event handler is reported as incomplete cleanup', async (t) => {
  const cell = createTestCell({ events: [events], cleanupMs: 5 });
  t.after(() => cell.close());
  let started;
  const began = new Promise((r) => (started = r));
  const listener = cell.instance({
    id: 'org.sdk.blocked',
    permissions: { subscribe: [events.id] },
  });
  await listener.activate(
    definePlugin({
      activate(ctx) {
        ctx.events(events).on(async () => {
          started();
          await new Promise(() => {});
        });
      },
    }),
  );
  const source = cell.instance({
    id: 'org.sdk.publisher',
    permissions: { publish: [events.id] },
  });
  await source.activate(empty);
  await source.context.events(events).emit('blocked');
  await began;
  const report = await listener.dispose();
  assert.equal(report.state, 'FAILED');
  assert.equal(report.restartRequired, true);
  assert.equal(report.timedOutResources, 1);
});

test('optional validates malformed requirement before reporting absence', async (t) => {
  const cell = createTestCell();
  t.after(() => cell.close());
  const c = cell.instance({
    id: 'org.sdk.optionalinvalid',
    permissions: { capabilities: { [d.id]: ['sum'] } },
  });
  await c.activate(empty);
  await assert.rejects(
    c.context.optional({ ...requirement, major: -1 }),
    is('INVALID_ARGUMENT'),
  );
});
