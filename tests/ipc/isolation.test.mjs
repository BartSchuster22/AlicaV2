// Deterministic real-socket regressions; the unchanged shared consumer remains
// the end-to-end authority/deadline gate. No transport-dependent expectations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  environment,
  fixture,
  trustMaterial,
  echo,
} from '../../tools/g3-fixtures.mjs';
import { HostIPC } from '../../packages/kernel/dist/g6/host-adapter.js';
import { PhysicalSession } from '../../packages/kernel/dist/g6/session.js';
import { AcapError } from '@alica/acap-contracts';
import { SDKPending } from '../../packages/kernel/dist/g6/sdk-rpc.js';

const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
async function until(fn) {
  const end = performance.now() + 4000;
  while (!fn()) {
    assert.ok(performance.now() < end, 'isolation observation deadline');
    await pause();
  }
}
async function launch(t) {
  let adapter;
  const activate = HostIPC.prototype.activate;
  HostIPC.prototype.activate = function () {
    adapter = this;
    return activate.call(this);
  };
  t.after(() => {
    HostIPC.prototype.activate = activate;
  });
  const e = environment(t, {
    activationMs: 5000,
    maxCallMs: 5000,
    cleanupMs: 1000,
  });
  e.host.updateTrust(
    trustMaterial(e.root, e.publisher, e.now(), {
      policy: {
        version: 2,
        publishers: [
          {
            id: 'org.alica.synthetic',
            keyIds: [e.publisher.id],
            executionModes: ['inproc', 'ipc'],
          },
        ],
      },
      revocation: { version: 2 },
    }),
  );
  const id = e.host.discover(
    fixture(e.publisher, {
      id: 'org.alica.isolation',
      manifest: { execution: 'ipc' },
      code: `export async function activate(ctx) {ctx.provide(${JSON.stringify(echo)}, {echo: async value => value})}`,
    }),
  );
  await e.host.activate(id);
  const worker = fileURLToPath(
    new URL('./isolation-worker.mjs', import.meta.url),
  );
  const session = new PhysicalSession({
    ...adapter.session.options,
    worker,
    readPaths: [...adapter.session.options.readPaths, worker],
    instanceId: 'isolation-dispatcher',
    generation: 7,
  });
  t.after(async () => {
    await session.shutdown();
    assert.equal(session.unreaped, false);
  });
  await session.ready;
  const replies = new Map();
  session.onFrame = (context, frame) => {
    assert.equal(frame.tag, 'response');
    assert.equal(frame.body.kind, 'invoke');
    assert.equal(frame.body.response.result.kind, 'success');
    assert.equal(
      replies.has(frame.body.response.requestId),
      false,
      'no late duplicate delivery',
    );
    replies.set(
      frame.body.response.requestId,
      frame.body.response.result.value,
    );
    if (frame.body.response.result.value === 'close-now')
      context.finish('CANCELLED');
  };
  const open = () =>
    session.open({
      scope: session.options.scopeId,
      purpose: 'invoke',
      requestedMs: 4000,
      encodedBytes: 256,
      authorize: () => {},
    });
  const send = (endpoint, payload) => {
    const requestId = randomUUID();
    endpoint.stream.send({
      schemaVersion: 'acap.ipc/v1',
      tag: 'request',
      sessionId: session.sessionId,
      generation: session.options.generation,
      contextId: endpoint.context.id,
      sequence: 1,
      body: {
        kind: 'invoke',
        wireId: 1,
        registrationId: 'isolation',
        call: {
          requestId,
          capabilityId: echo.id,
          descriptorDigest: session.expected.contracts[0].descriptorDigest,
          operation: 'echo',
          deadlineMs: Date.now() + 4000,
          payload,
        },
        caller: {
          principal: 'org.alica.isolation',
          instanceId: session.options.instanceId,
          scope: session.options.scopeId,
          scopeGeneration: session.options.scopeGeneration,
          grantId: 'isolation-grant',
          grantRevision: 1,
        },
        remainingMs: 4000,
      },
    });
    return requestId;
  };
  const observe = async () => {
    assert.equal(session.active, true, 'physical session survives');
    const endpoint = await open();
    try {
      const requestId = send(endpoint, 'observe');
      await until(() => replies.has(requestId) || !session.active);
      assert.equal(session.active, true, 'healthy sibling receives its reply');
      return JSON.parse(replies.get(requestId));
    } finally {
      endpoint.context.finish();
    }
  };
  return { session, replies, open, send, observe };
}

for (const [code, phase] of [
  ['DEADLINE_EXCEEDED', 3],
  ['DEADLINE_EXCEEDED', 4],
  ['PERMISSION_DENIED', 4],
]) {
  test(
    `pre-offer phase ${phase} ${code} preserves the real session and releases admission`,
    { timeout: 15000 },
    async (t) => {
      const e = await launch(t);
      const now = e.session.scheduler.now;
      const before = e.session.scheduler.usage;
      let checks = 0;
      try {
        await assert.rejects(
          e.session.open({
            scope: e.session.options.scopeId,
            purpose: 'invoke',
            requestedMs: 4000,
            encodedBytes: 256,
            authorize: () => {
              checks++;
              if (code === 'DEADLINE_EXCEEDED' && checks === phase) {
                e.session.scheduler.now = () => now() + 5000;
              }
              if (code === 'PERMISSION_DENIED' && checks === 4)
                throw new AcapError(code);
            },
          }),
          { code },
        );
      } finally {
        e.session.scheduler.now = now;
      }
      assert.ok(checks >= 3);
      assert.deepEqual(e.session.scheduler.usage, before);
      assert.equal(e.session.active, true);
      await e.observe();
    },
  );
}

test(
  'worker deadline abort does not close a broker-live work socket',
  { timeout: 15000 },
  async (t) => {
    const e = await launch(t);
    const expired = await e.open();
    e.send(expired, 'expire');
    let observation;
    const end = performance.now() + 2000;
    for (;;) {
      observation = await e.observe();
      if (observation.aborted) break;
      assert.ok(performance.now() < end, 'worker deadline must abort promptly');
      await pause();
    }
    assert.equal(observation.reason, 'DEADLINE_EXCEEDED');
    assert.equal(
      observation.closed,
      false,
      'broker still owns endpoint retirement',
    );
    assert.equal(expired.context.terminal, undefined);
    expired.context.finish('DEADLINE_EXCEEDED');
    await until(() => expired.stream.closed);
    await e.observe();
  },
);

test(
  'reply after observed broker closure is endpoint-local, not physical EPIPE failure',
  { timeout: 15000 },
  async (t) => {
    const e = await launch(t);
    const closed = await e.open();
    const requestId = e.send(closed, 'reply-race');
    await until(() => e.replies.has(requestId) || !e.session.active);
    assert.equal(e.replies.get(requestId), 'close-now');
    const observation = await e.observe();
    assert.equal(observation.raced, true);
    assert.equal(observation.closed, true);
    assert.equal(observation.aborted, true);
    assert.equal(e.replies.get(requestId), 'close-now');
  },
);

test(
  'scope-check write racing broker closure rejects locally and preserves sibling',
  { timeout: 15000 },
  async (t) => {
    const e = await launch(t);
    const requestId = e.send(await e.open(), 'scope-check-race');
    await until(() => e.replies.has(requestId) || !e.session.active);
    assert.equal(e.replies.get(requestId), 'close-now');
    const observation = await e.observe();
    assert.equal(observation.raced, true);
    assert.equal(observation.closed, true);
    assert.equal(observation.aborted, true);
  },
);

test(
  'unexpected worker EOF on broker-live work still fails the physical session',
  { timeout: 15000 },
  async (t) => {
    const e = await launch(t);
    e.send(await e.open(), 'unexpected-eof');
    await until(() => !e.session.active);
    assert.equal(e.session.active, false);
    await e.session.exited;
    assert.equal(e.session.unreaped, false);
  },
);

test(
  'effect-release write racing broker closure still fails the real worker',
  { timeout: 15000 },
  async (t) => {
    const e = await launch(t);
    const requestId = e.send(await e.open(), 'mutation-race');
    await until(() => !e.session.active);
    assert.equal(e.replies.get(requestId), 'close-now');
    await e.session.exited;
    assert.equal(e.session.unreaped, false);
  },
);

test('cancelled read-only scope observation retires only its RPC', async () => {
  let failed = 0;
  const rpc = new SDKPending(() => {
    failed++;
    rpc.close();
  });
  const controller = new AbortController();
  const pending = rpc.request(
    {
      endpoint: {},
      signal: controller.signal,
      end: performance.now() + 4000,
      readOnly: true,
    },
    ['ack'],
    () => {},
  );
  controller.abort();
  await assert.rejects(pending, { code: 'CANCELLED' });
  assert.equal(failed, 0);
  assert.equal(rpc.size, 0);
  const sibling = {
    endpoint: {},
    signal: new AbortController().signal,
    end: performance.now() + 4000,
  };
  const result = rpc.request(sibling, ['ack'], (wireId) => {
    rpc.accept(sibling.endpoint, {
      kind: 'control',
      wireId,
      value: { kind: 'ack' },
    });
  });
  assert.deepEqual(await result, { kind: 'ack' });
});

test('synchronous scope observation timeout is local, malformed response remains fatal', () => {
  let failed = 0;
  const rpc = new SDKPending(() => {
    failed++;
    rpc.close();
  });
  const controller = new AbortController();
  const admission = {
    endpoint: {},
    signal: controller.signal,
    end: performance.now() + 4000,
    readOnly: true,
  };
  assert.throws(
    () =>
      rpc.requestSync(
        admission,
        ['ack'],
        () => {},
        () => controller.abort(),
      ),
    { code: 'CANCELLED' },
  );
  assert.equal(failed, 0);
  assert.equal(rpc.size, 0);
  const timed = { ...admission, signal: new AbortController().signal };
  assert.throws(
    () =>
      rpc.requestSync(
        timed,
        ['ack'],
        () => {},
        () => {
          timed.end = performance.now() - 1;
        },
      ),
    { code: 'DEADLINE_EXCEEDED' },
  );
  assert.equal(failed, 0);
  assert.equal(rpc.size, 0);
  const other = { ...admission, signal: new AbortController().signal };
  assert.throws(
    () =>
      rpc.requestSync(
        other,
        ['ack'],
        (wireId) => {
          rpc.accept(other.endpoint, {
            kind: 'control',
            wireId,
            value: { kind: 'secret', value: 'wrong' },
          });
        },
        () => assert.fail('unexpected pump'),
      ),
    { code: 'UNAUTHENTICATED' },
  );
  assert.ok(failed > 0);
});

test('unanswered SDK mutation and effect-release remain fail-closed on endpoint abort', async () => {
  for (const expected of [['registered'], ['effect-released'], ['ack']]) {
    let failed = 0;
    const rpc = new SDKPending(() => {
      failed++;
      rpc.close();
    });
    const controller = new AbortController();
    const pending = rpc.request(
      {
        endpoint: {},
        signal: controller.signal,
        end: performance.now() + 4000,
      },
      expected,
      () => {},
      expected[0] === 'effect-released' ? 'effect1' : undefined,
    );
    controller.abort('DEADLINE_EXCEEDED');
    await assert.rejects(pending, { code: 'CANCELLED' });
    assert.equal(failed, 1);
    assert.equal(rpc.size, 0);
  }
});
