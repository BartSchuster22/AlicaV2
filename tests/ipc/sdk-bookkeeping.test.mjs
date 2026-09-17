// Production SDK bookkeeping components, not native IPC/SDK equivalence evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AcapError } from '@alica/acap-contracts';
import {
  CallbackLedger,
  WorkerEffects,
} from '../../packages/kernel/dist/g6/sdk-effects.js';
import {
  SDKPending,
  SDKRejection,
} from '../../packages/kernel/dist/g6/sdk-rpc.js';
import { BrokerEffects } from '../../packages/kernel/dist/g6/broker-effects.js';
const code = (expected) => (error) => error.code === expected;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const admission = () => ({
  endpoint: {},
  signal: new AbortController().signal,
  end: performance.now() + 1000,
});

test('cleanup can precede registration reply; binding remains one-to-one', async () => {
  let calls = 0,
    faults = 0;
  const ledger = new CallbackLedger(2, () => faults++);
  const token = ledger.reserve(async () => {
    calls++;
  });
  const cleanup = ledger.cleanup(token, 'e1', 1000);
  ledger.bind(token, 'e1');
  assert.equal(ledger.cleanup(token, 'e1', 1000), cleanup);
  await cleanup;
  assert.equal(calls, 1);
  assert.deepEqual(ledger.inspect(), { records: 1, closures: 0, bindings: 1 });
  assert.throws(() => ledger.bind(token, 'e2'), code('UNAUTHENTICATED'));
  assert.equal(faults, 1);
});

test('registration reply may precede cleanup; callback reuse/foreign binding fails', async () => {
  let calls = 0;
  const ledger = new CallbackLedger(2, () => {});
  const a = ledger.reserve(async () => {
    calls++;
  });
  const b = ledger.reserve(async () => {});
  ledger.bind(a, 'e1');
  assert.throws(() => ledger.bind(b, 'e1'), code('UNAUTHENTICATED'));
  assert.throws(
    () => ledger.cleanup('unknown', 'e1', 1),
    code('UNAUTHENTICATED'),
  );
  await ledger.cleanup(a, 'e1', 1000);
  assert.equal(calls, 1);
});

test('completed effects remain charged; definite rejection releases only unbound reservation', async () => {
  const ledger = new CallbackLedger(1, () => {});
  const rejected = ledger.reserve(async () => {});
  ledger.reject(rejected);
  const accepted = ledger.reserve(async () => {});
  assert.notEqual(accepted, rejected);
  ledger.bind(accepted, 'e1');
  await ledger.cleanup(accepted, 'e1', 1000);
  assert.throws(
    () => ledger.reserve(async () => {}),
    code('RESOURCE_EXHAUSTED'),
  );
  assert.throws(() => ledger.reject(accepted), code('UNAUTHENTICATED'));
});

test('cleanup first error is cached, including throwing undefined', async () => {
  let count = 0;
  const ledger = new CallbackLedger(1, () => {});
  const token = ledger.reserve(async () => {
    count++;
    throw undefined;
  });
  const first = ledger.cleanup(token, 'e1', 1000);
  await assert.rejects(first, code('INTERNAL'));
  assert.equal(first, ledger.cleanup(token, 'e1', 1000));
  assert.equal(count, 1);
});

test('cleanup deadline wins over late success and fails the physical session once', async () => {
  const gate = deferred();
  let failures = 0;
  const ledger = new CallbackLedger(1, () => failures++);
  const token = ledger.reserve(() => gate.promise);
  const first = ledger.cleanup(token, 'e1', 10);
  await assert.rejects(first, code('DEADLINE_EXCEEDED'));
  gate.resolve();
  await Promise.resolve();
  await assert.rejects(
    ledger.cleanup(token, 'e1', 1000),
    code('DEADLINE_EXCEEDED'),
  );
  assert.equal(failures, 1);
  assert.equal(ledger.inspect().closures, 0);
});

test('registerCleanup returns void; synchronous rejection stops acquisition', async () => {
  const ledger = new CallbackLedger(4, () => {});
  let continued = false;
  const effects = new WorkerEffects(ledger, {
    register: () => {
      throw new SDKRejection('RESOURCE_EXHAUSTED');
    },
    release: async () => assert.fail('unaccepted effect released'),
    isDefiniteRejection: (error) => error instanceof SDKRejection,
    failSession: () => assert.fail('definite rejection is not uncertain'),
  });
  await assert.rejects(
    effects.acquire('s1', 1, 1000, async (register) => {
      register(async () => {});
      continued = true;
    }),
    code('RESOURCE_EXHAUSTED'),
  );
  assert.equal(continued, false);
  assert.equal(ledger.inspect().records, 0);
});

test('failed acquisition closes registration before reverse rollback awaits', async () => {
  const ledger = new CallbackLedger(4, () => {});
  const order = [],
    gate = deferred();
  let registerLater,
    index = 0;
  const effects = new WorkerEffects(ledger, {
    register: () => 'e' + ++index,
    release: async (id) => {
      order.push(id);
      if (id === 'e2') await gate.promise;
    },
    isDefiniteRejection: () => false,
    failSession: () => assert.fail('unexpected failure'),
  });
  const task = effects.acquire('s1', 1, 1000, async (register) => {
    registerLater = register;
    assert.equal(
      register(async () => {}),
      undefined,
    );
    register(async () => {});
    throw new AcapError('CONFLICT');
  });
  for (let turn = 0; turn < 100 && !order.length; turn++)
    await Promise.resolve();
  assert.equal(
    order.length,
    1,
    'rollback must start without waiting on its own cleanup',
  );
  assert.throws(
    () => registerLater(async () => {}),
    code('FAILED_PRECONDITION'),
  );
  gate.resolve();
  await assert.rejects(task, code('CONFLICT'));
  assert.deepEqual(order, ['e2', 'e1']);
});

test('uncertain registration retains callback charge, fails session and never retries', async () => {
  let requests = 0,
    failures = 0;
  const ledger = new CallbackLedger(4, () => failures++);
  const effects = new WorkerEffects(ledger, {
    register: () => {
      requests++;
      throw new AcapError('UNAVAILABLE');
    },
    release: async () => assert.fail('unknown outcome released'),
    isDefiniteRejection: () => false,
    failSession: () => failures++,
  });
  await assert.rejects(
    effects.acquire('s1', 1, 1000, async (register) => {
      register(async () => {});
    }),
    code('UNAVAILABLE'),
  );
  assert.equal(requests, 1);
  assert.equal(failures, 1);
  assert.equal(ledger.inspect().records, 1);
});

test('pending publication accepts zero/multiple but never substitutes ack', async () => {
  for (const admitted of [0, 1, 3]) {
    const rpc = new SDKPending(() => assert.fail('unexpected fault'));
    const a = admission();
    const task = rpc.request(a, ['published'], (wireId) => {
      rpc.accept(a.endpoint, {
        kind: 'control',
        wireId,
        value: { kind: 'published', admitted },
      });
    });
    assert.deepEqual(await task, { kind: 'published', admitted });
    assert.equal(rpc.size, 0);
  }
  let faults = 0,
    id;
  const rpc = new SDKPending(() => {
    faults++;
    rpc.close();
  });
  const a = admission();
  const task = rpc.request(a, ['published'], (wireId) => {
    id = wireId;
  });
  assert.throws(
    () =>
      rpc.accept(a.endpoint, {
        kind: 'control',
        wireId: id,
        value: { kind: 'ack' },
      }),
    code('UNAUTHENTICATED'),
  );
  await assert.rejects(task, code('UNAVAILABLE'));
  assert.equal(faults, 1);
});

test('wrong endpoint and wrong effect cannot settle pending operations', async () => {
  for (const wrongEndpoint of [false, true]) {
    const rpc = new SDKPending(() => rpc.close());
    const a = admission();
    let id;
    const task = rpc.request(
      a,
      ['effect-released'],
      (wireId) => {
        id = wireId;
      },
      'e1',
    );
    assert.throws(
      () =>
        rpc.accept(wrongEndpoint ? {} : a.endpoint, {
          kind: 'control',
          wireId: id,
          value: {
            kind: 'effect-released',
            effectId: wrongEndpoint ? 'e1' : 'e2',
          },
        }),
      code('UNAUTHENTICATED'),
    );
    await assert.rejects(task, code('UNAVAILABLE'));
  }
});

test('RPC IDs are never reused across endpoints and retired replies remain endpoint-bound', async () => {
  let faults = 0;
  const rpc = new SDKPending(() => {
    faults++;
    rpc.close();
  });
  const a = admission(),
    b = admission();
  let aid, bid;
  const at = rpc.request(a, ['ack'], (id) => {
    aid = id;
  });
  const bt = rpc.request(b, ['ack'], (id) => {
    bid = id;
  });
  assert.notEqual(aid, bid);
  const reply = { kind: 'control', wireId: aid, value: { kind: 'ack' } };
  rpc.accept(a.endpoint, reply);
  await at;
  rpc.accept(a.endpoint, reply);
  assert.throws(() => rpc.accept(b.endpoint, reply), code('UNAUTHENTICATED'));
  await assert.rejects(bt, code('UNAVAILABLE'));
  assert.equal(faults, 1);
});

test('64 pending requests shared across endpoints reject before send', async () => {
  const rpc = new SDKPending(() => {});
  let sent = 0;
  const tasks = Array.from({ length: 64 }, () =>
    rpc.request(admission(), ['ack'], () => sent++),
  );
  assert.throws(
    () => rpc.request(admission(), ['ack'], () => sent++),
    code('RESOURCE_EXHAUSTED'),
  );
  assert.equal(sent, 64);
  assert.equal(rpc.size, 64);
  rpc.close();
  const results = await Promise.allSettled(tasks);
  assert.ok(
    results.every(
      (result) =>
        result.status === 'rejected' && result.reason.code === 'UNAVAILABLE',
    ),
  );
  assert.equal(rpc.size, 0);
});

test('synchronous pending RPC pumps until actual reply, not a Promise surrogate', () => {
  const rpc = new SDKPending(() => assert.fail('unexpected fault'));
  const a = admission();
  let id,
    turns = 0;
  const value = rpc.requestSync(
    a,
    ['scope'],
    (wireId) => {
      id = wireId;
    },
    () => {
      if (++turns === 2)
        rpc.accept(a.endpoint, {
          kind: 'control',
          wireId: id,
          value: { kind: 'scope', scopeId: 's2', scopeGeneration: 1 },
        });
    },
  );
  assert.equal(value.kind, 'scope');
  assert.equal(turns, 2);
  assert.equal(rpc.size, 0);
});

test('broker registrations consume the same Host-owned lifetime effect ledger', async () => {
  const endpoint = {},
    scope = { id: 's1', generation: 1 };
  const owned = [async () => {}]; // Existing Host provide/on charge.
  const dispatched = [];
  const broker = new BrokerEffects({
    registerScope: (actual, id, generation) => {
      assert.equal(actual, endpoint);
      if (id !== scope.id || generation !== scope.generation)
        throw new AcapError('PERMISSION_DENIED');
      return scope;
    },
    releaseScope: (actual) => {
      if (actual !== endpoint) throw new AcapError('PERMISSION_DENIED');
    },
    own: (_, cleanup) => {
      if (owned.length >= 2) throw new AcapError('RESOURCE_EXHAUSTED');
      let task;
      const dispose = () => (task ??= Promise.resolve().then(cleanup));
      owned.push(dispose);
      return dispose;
    },
    dispatch: async (effectId, callbackId, actualScope, inline) => {
      dispatched.push({ effectId, callbackId });
      assert.equal(actualScope, scope);
      assert.equal(inline, endpoint);
    },
    failSession: () => {},
  });
  assert.throws(
    () => broker.register(endpoint, 's1', 2, 'bad'),
    code('PERMISSION_DENIED'),
  );
  assert.equal(broker.size, 0);
  const id = broker.register(endpoint, 's1', 1, 'cb1');
  assert.throws(
    () => broker.register(endpoint, 's1', 1, 'cb2'),
    code('RESOURCE_EXHAUSTED'),
  );
  assert.throws(() => broker.release({}, id), code('PERMISSION_DENIED'));
  await Promise.all([
    broker.release(endpoint, id),
    broker.release(endpoint, id),
  ]);
  assert.equal(dispatched.length, 1);
  assert.throws(
    () => broker.register(endpoint, 's1', 1, 'cb3'),
    code('RESOURCE_EXHAUSTED'),
  );
  assert.equal(broker.size, 1);
});
