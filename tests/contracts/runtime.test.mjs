import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CreditWindow,
  streamOutcomes,
  readStreamOutcomes,
  ContractProvider,
  ContractSession,
  BoundedChannel,
  payload,
  descriptor,
  digest,
  canonical,
  parse,
  negotiate,
  errorRecord,
  decodeResponse,
  generateClient,
  generateProvider,
  generateDeclaration,
  validateProfile,
  validateEventDescriptor,
  validateEventEnvelope,
  runConformance,
} from '@alica/acap-contracts';
import { environment, echo, requirement } from '../../tools/g3-fixtures.mjs';
const copy = structuredClone;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const is = (code) => (e) => e.code === code;
function setup(
  t,
  { d = echo, handlers = { echo: async (x) => x }, ...options } = {},
) {
  const provider = new ContractProvider(d, handlers, options.records ?? 256);
  const session = new ContractSession(provider, {
    caller: {
      principal: 'org.test.caller',
      instanceId: 'caller1',
      scope: 'root',
    },
    scopeGeneration: 1,
    authorize: () => {},
    ...options,
  });
  t.after(() => {
    session.close();
    provider.close();
  });
  return {
    provider,
    session,
    q: (payload = { text: 'a' }, extra = {}) => ({
      requestId: 'r1',
      capabilityId: d.id,
      descriptorDigest: digest(d),
      operation: d.operations[0].name,
      deadlineMs: Date.now() + 1000,
      payload,
      ...extra,
    }),
  };
}
function streamD() {
  const d = copy(echo);
  d.operations[0].kind = 'stream';
  return d;
}
function idemD() {
  const d = copy(echo);
  d.operations[0].idempotency = 'provider';
  d.operations[0].idempotencyPolicy = {
    retentionMs: 1000,
    persistence: 'instance',
  };
  return d;
}
test('public descriptor schema and canonical digest reject semantic and unknown-field violations', () => {
  for (const change of [
    (d) => {
      d.operations[0].input.required = ['missing'];
    },
    (d) => {
      d.operations[0].input.minimum = 0;
    },
    (d) => {
      d.operations[0].output.properties.text.minLength = 9999;
    },
    (d) => {
      d.extra = 1;
    },
    (d) => {
      d.version = '2147483648.0.0';
    },
    (d) => {
      d.operations.push(d.operations[0]);
    },
  ]) {
    const d = copy(echo);
    change(d);
    assert.throws(() => descriptor(canonical(d)));
  }
  assert.equal(digest(descriptor(canonical(echo))), digest(echo));
  assert.throws(() => descriptor('{"x":0,"x":1}'));
});
test('required versus optional features, version range and digest negotiation', () => {
  const d = copy(echo);
  d.features = ['fast'];
  assert.deepEqual(
    [
      ...negotiate(d, { ...requirement, optionalFeatures: ['fast', 'absent'] })
        .negotiatedFeatures,
    ],
    ['fast'],
  );
  for (const r of [
    { ...requirement, features: ['absent'] },
    { ...requirement, major: 2 },
    { ...requirement, minMinor: 1 },
    { ...requirement, maxMinor: 0, minMinor: 1 },
    { ...requirement, operations: ['unknown'] },
    { ...requirement, features: ['fast'], optionalFeatures: ['fast'] },
  ])
    assert.throws(() => negotiate(d, r));
  assert.throws(
    () => negotiate(d, requirement, 'sha256:' + '0'.repeat(64)),
    is('CONTRACT_MISMATCH'),
  );
});
test('closed wire protocol validates digest, unknown operations, payloads and spoofed identity', async (t) => {
  const { session, q } = setup(t);
  for (const [change, code] of [
    [{ descriptorDigest: 'sha256:' + '0'.repeat(64) }, 'CONTRACT_MISMATCH'],
    [{ operation: 'unknown' }, 'NOT_FOUND'],
    [{ payload: { text: 5 } }, 'INVALID_ARGUMENT'],
    [{ caller: 'forged' }, 'INVALID_ARGUMENT'],
  ]) {
    const result = await session.invoke(q({ text: 'a' }, change));
    assert.equal(result.result.error.code, code);
    assert.equal(result.result.error.message, code);
    assert.equal(result.result.error.retryable, false);
  }
});
test('authentication runs before revealing malformed contract details', async (t) => {
  const { session, q } = setup(t, {
    authorize: () => {
      throw { code: 'UNAUTHENTICATED', message: 'secret' };
    },
  });
  const r = await session.invoke(q({}, { descriptorDigest: 'bad' }));
  assert.equal(r.result.error.code, 'UNAUTHENTICATED');
  assert(!JSON.stringify(r).includes('secret'));
});
test('wire behavior survives JSON round trips and non-local plain exceptions', async (t) => {
  const { session, q } = setup(t);
  const req = parse(canonical(q()));
  const r = await session.invoke(req);
  assert.equal(decodeResponse(canonical(r), req.requestId).text, 'a');
  assert.throws(() => decodeResponse('{"requestId":"x","requestId":"y"}', 'x'));
  const other = setup(t, {
    handlers: {
      echo: async () => {
        throw JSON.parse(
          '{"code":"CONFLICT","message":"private-token","stack":"secret","details":{"secret":"x"}}',
        );
      },
    },
  });
  const bad = await other.session.invoke(other.q());
  assert.equal(bad.result.error.code, 'CONFLICT');
  assert.equal(JSON.stringify(bad).includes('private-token'), false);
  assert.deepEqual(Object.keys(bad.result.error).sort(), [
    'code',
    'correlationId',
    'message',
    'retryable',
  ]);
});
test('invalid provider output has normalized contract mismatch', async (t) => {
  for (const value of [{ text: 5 }, undefined, () => {}, new Date()]) {
    const { session, q } = setup(t, { handlers: { echo: async () => value } });
    assert.equal(
      (await session.invoke(q())).result.error.code,
      'CONTRACT_MISMATCH',
    );
  }
});
test('absolute expiration causes zero provider invocations and maximum budget clamps', async (t) => {
  let calls = 0,
    observed;
  const { session, q } = setup(t, {
    maxCallMs: 30,
    handlers: {
      echo: async (x, c) => {
        calls++;
        observed = c.deadlineMs;
        return x;
      },
    },
  });
  const before = Date.now();
  assert.equal(
    (await session.invoke(q({}, { deadlineMs: before - 1 }))).result.error.code,
    'INVALID_ARGUMENT',
  );
  assert.equal(
    (await session.invoke(q({ text: 'x' }, { deadlineMs: before - 1 }))).result
      .error.code,
    'DEADLINE_EXCEEDED',
  );
  assert.equal(calls, 0);
  assert.equal((await session.invoke(q())).result.kind, 'success');
  assert(observed <= Date.now() + 30);
});
for (const phase of ['before', 'during', 'after'])
  test(`cancellation ${phase} completion is terminal exactly once`, async (t) => {
    let calls = 0;
    const c = new AbortController();
    const { session, q } = setup(t, {
      handlers: {
        echo: async (x) => {
          calls++;
          await delay(20);
          return x;
        },
      },
    });
    if (phase === 'before') c.abort();
    const pending = session.invoke(q(), c.signal);
    if (phase === 'during') c.abort();
    const result = await pending;
    if (phase === 'after') {
      c.abort();
      session.cancel('r1');
      assert.equal(result.result.kind, 'success');
    } else {
      assert.equal(result.result.error.code, 'CANCELLED');
      if (phase === 'before') assert.equal(calls, 0);
    }
    await delay(25);
    assert.equal(session.outstanding, 0);
  });
test('request IDs are unique while outstanding; explicit cancel is idempotent', async (t) => {
  const { session, q } = setup(t, {
    handlers: {
      echo: async (x) => {
        await delay(25);
        return x;
      },
    },
  });
  const pending = session.invoke(q());
  assert.equal((await session.invoke(q())).result.error.code, 'CONFLICT');
  session.cancel('r1');
  session.cancel('r1');
  assert.equal((await pending).result.error.code, 'CANCELLED');
  assert.equal(session.outstanding, 0);
});
test('parent cancellation and deadlines propagate across sessions', async (t) => {
  let childSignal;
  const child = setup(t, {
    handlers: {
      echo: async (x, c) => {
        childSignal = c.signal;
        await delay(40);
        return x;
      },
    },
  });
  const parent = setup(t, {
    handlers: {
      echo: async (x) =>
        child.session.call('echo', x, { deadlineMs: Date.now() + 1000 }),
    },
  });
  const q = parent.q({ text: 'x' }, { deadlineMs: Date.now() + 15 });
  assert.equal(
    (await parent.session.invoke(q)).result.error.code,
    'DEADLINE_EXCEEDED',
  );
  assert.equal(childSignal.aborted, true);
  await delay(45);
  assert.equal(child.session.outstanding, 0);
});
test('instance idempotency: replay, conflict, in-flight duplicate and scope isolation', async (t) => {
  let calls = 0,
    seen;
  const { provider, session, q } = setup(t, {
    d: idemD(),
    handlers: {
      echo: async (x, c) => {
        seen = c.idempotencyKey;
        calls++;
        await delay(15);
        return x;
      },
    },
  });
  const first = session.invoke(
    q({ text: 'a' }, { idempotencyKey: 'key', requestId: 'first' }),
  );
  assert.equal(
    (
      await session.invoke(
        q({ text: 'a' }, { idempotencyKey: 'key', requestId: 'second' }),
      )
    ).result.error.code,
    'CONFLICT',
  );
  await first;
  assert.equal(
    (await session.invoke(q({ text: 'a' }, { idempotencyKey: 'key' }))).result
      .kind,
    'success',
  );
  assert.equal(calls, 1);
  assert.equal(seen, 'key');
  assert.equal(
    (await session.invoke(q({ text: 'b' }, { idempotencyKey: 'key' }))).result
      .error.code,
    'CONFLICT',
  );
  const another = new ContractSession(provider, {
    caller: { principal: 'org.test.other', instanceId: 'new', scope: 'root' },
    scopeGeneration: 1,
    authorize: () => {},
  });
  await another.invoke(q({ text: 'a' }, { idempotencyKey: 'key' }));
  assert.equal(calls, 2);
  another.close();
});
test('idempotency retention, reset and finite capacity never silently evict live keys', async (t) => {
  const d = idemD();
  d.operations[0].idempotencyPolicy.retentionMs = 15;
  let calls = 0;
  const { session, q } = setup(t, {
    d,
    records: 1,
    handlers: {
      echo: async (x) => {
        calls++;
        return x;
      },
    },
  });
  await session.invoke(q({ text: 'a' }, { idempotencyKey: 'one' }));
  assert.equal(
    (await session.invoke(q({ text: 'a' }, { idempotencyKey: 'two' }))).result
      .error.code,
    'RESOURCE_EXHAUSTED',
  );
  await delay(20);
  await session.invoke(q({ text: 'a' }, { idempotencyKey: 'one' }));
  assert.equal(calls, 2);
  const fresh = setup(t, {
    d,
    handlers: {
      echo: async (x) => {
        calls++;
        return x;
      },
    },
  });
  await fresh.session.invoke(fresh.q({ text: 'a' }, { idempotencyKey: 'one' }));
  assert.equal(calls, 3);
});
test('none rejects keys; stream idempotency is invalid; durable claim is not faked', async (t) => {
  const { session, q } = setup(t);
  assert.equal(
    (await session.invoke(q({ text: 'a' }, { idempotencyKey: 'key' }))).result
      .error.code,
    'INVALID_ARGUMENT',
  );
  const d = idemD();
  d.operations[0].kind = 'stream';
  assert.throws(() => descriptor(canonical(d)));
  d.operations[0].kind = 'unary';
  d.operations[0].idempotencyPolicy.persistence = 'durable';
  descriptor(canonical(d));
  assert.throws(
    () => new ContractProvider(d, { echo: async (x) => x }),
    is('FAILED_PRECONDITION'),
  );
});
test('stream yields detached validated items and exactly one iterator completion', async (t) => {
  const { session, q } = setup(t, {
    d: streamD(),
    handlers: {
      echo: async function* (x) {
        yield x;
        yield { text: 'second' };
      },
    },
  });
  const it = session.stream(q());
  assert.equal((await it.next()).value.text, 'a');
  assert.equal((await it.next()).value.text, 'second');
  assert.equal((await it.next()).done, true);
  assert.equal((await it.next()).done, true);
  assert.equal(session.outstanding, 0);
});
test('stream invalid item and explicit cancellation terminate without late items', async (t) => {
  for (const mode of ['invalid', 'cancel']) {
    const { session, q } = setup(t, {
      d: streamD(),
      streamCapacity: 1,
      handlers: {
        echo: async function* () {
          if (mode === 'invalid') {
            yield { text: 1 };
            return;
          }
          for (let i = 0; i < 10; i++) {
            yield { text: String(i) };
            if (mode === 'cancel') await delay(10);
          }
        },
      },
    });
    const it = session.stream(q());
    if (mode === 'cancel') {
      await it.next();
      session.cancel('r1');
    }
    if (mode === 'overflow') await delay(5);
    await assert.rejects(
      it.next(),
      is(
        mode === 'invalid'
          ? 'CONTRACT_MISMATCH'
          : mode === 'overflow'
            ? 'RESOURCE_EXHAUSTED'
            : 'CANCELLED',
      ),
    );
    assert.equal((await it.next()).done, true);
    assert.equal(session.outstanding, 0);
  }
});
test('stream rechecks authority before each item delivery', async (t) => {
  let allow = true;
  const { session, q } = setup(t, {
    d: streamD(),
    authorize: () => {
      if (!allow) throw { code: 'PERMISSION_DENIED' };
    },
    handlers: {
      echo: async function* () {
        yield { text: 'hidden' };
      },
    },
  });
  const it = session.stream(q());
  await delay(1);
  allow = false;
  await assert.rejects(it.next(), is('PERMISSION_DENIED'));
  assert.equal((await it.next()).done, true);
});
test('bounded event primitive terminates on overflow and never leaks subsequent queued data', async () => {
  const q = new BoundedChannel(1);
  assert(q.push({ n: 1 }));
  assert.equal(q.push({ n: 2 }), false);
  await assert.rejects(q.next(), is('RESOURCE_EXHAUSTED'));
  assert.equal((await q.next()).done, true);
  assert.equal(q.size, 0);
});
test('event envelope validates exact descriptor and broker identity fields', () => {
  const d = validateEventDescriptor(
    canonical({
      schemaVersion: 'acap.event-descriptor/v1',
      id: 'org.test.event',
      version: '1.0.0',
      payload: { type: 'integer' },
    }),
  );
  const event = {
    eventId: 'e1',
    type: d.id,
    contractDigest: digest(d),
    sourceProvider: 'org.test.provider',
    sourceScope: 'root',
    sourceInstanceId: 'i1',
    scopeGeneration: 1,
    sequence: 1,
    timeMs: Date.now(),
    data: 1,
  };
  assert.equal(validateEventEnvelope(canonical(event), d).data, 1);
  assert.throws(() =>
    validateEventEnvelope(canonical({ ...event, extra: 1 }), d),
  );
  assert.throws(
    () =>
      validateEventEnvelope(
        canonical({ ...event, contractDigest: 'sha256:' + '0'.repeat(64) }),
        d,
      ),
    is('CONTRACT_MISMATCH'),
  );
});
test('generation is byte deterministic and descriptor changes change generated bindings', () => {
  for (const generate of [
    generateClient,
    generateProvider,
    (d) => generateDeclaration(d, 'client'),
    (d) => generateDeclaration(d, 'provider'),
  ]) {
    assert.equal(generate(echo), generate(copy(echo)));
    const next = copy(echo);
    next.version = '1.1.0';
    if (generate !== generateDeclaration)
      assert.equal(typeof generate(next), 'string');
  }
  assert.notEqual(
    generateClient(echo),
    generateClient({ ...echo, version: '1.1.0' }),
  );
});
test('profile validation rejects duplicate roots, cycles, and unknown pins', () => {
  const p = {
    schemaVersion: 'alica.profile/v1',
    profileId: 'org.test.profile',
    version: '1.0.0',
    plugins: [
      {
        id: 'org.test.plugin',
        version: '1.0.0',
        packageDigest: 'sha256:' + '0'.repeat(64),
      },
    ],
    providerPins: [],
    scopes: [{ id: 'root', parent: null }],
  };
  validateProfile(canonical(p));
  for (const change of [
    (p) => p.scopes.push({ id: 'other', parent: null }),
    (p) => p.scopes.push({ id: 'loop', parent: 'loop' }),
    (p) =>
      p.providerPins.push({
        capabilityId: echo.id,
        providerId: 'org.missing.provider',
      }),
  ]) {
    const x = copy(p);
    change(x);
    assert.throws(() => validateProfile(canonical(x)));
  }
});
test('conformance fails an incorrect provider instead of just validating descriptor', async () => {
  const result = await runConformance(
    echo,
    { echo: async () => ({ text: 'wrong' }) },
    [
      {
        name: 'echo',
        operation: 'echo',
        input: { text: 'correct' },
        expected: { text: 'correct' },
      },
    ],
  );
  assert.equal(result.passed, false);
  assert.equal(result.checks[0].passed, false);
});
test('Kernel dispatch supports stream and revocation without Kernel imports in provider', async (t) => {
  const e = environment(t);
  const d = streamD();
  const p = e.load({
    provides: [d],
    code: `export async function activate(ctx){ctx.provide(${JSON.stringify(d)},{echo:async function*(x){yield x;await new Promise(r=>setTimeout(r,10));yield x}})}`,
  });
  const c = e.load({
    id: 'org.test.consumer',
    provides: [],
    requires: [requirement],
    code: 'export async function activate(){}',
  });
  const grant = e.grant(c);
  await e.host.activate(c);
  const h = await e.host.context(c).require(requirement);
  const it = h
    .stream('echo', { text: 'x' }, { deadlineMs: e.now() + 1000 })
    [Symbol.asyncIterator]();
  assert.equal((await it.next()).value.text, 'x');
  e.host.revokeGrant(grant.grantId);
  await assert.rejects(it.next(), is('PERMISSION_DENIED'));
  await e.host.shutdown();
  assert.equal(e.host.inspect().resources.pendingCalls, 0);
});
test('Kernel instance-idempotency cache is shared across consumer handles', async (t) => {
  const e = environment(t);
  const d = idemD();
  e.load({
    provides: [d],
    code: `let calls=0;export async function activate(ctx){ctx.provide(${JSON.stringify(d)},{echo:async()=>({text:String(++calls)})})}`,
  });
  const c = e.load({
    id: 'org.test.consumer',
    provides: [],
    requires: [requirement],
    code: 'export async function activate(){}',
  });
  e.grant(c);
  await e.host.activate(c);
  const h1 = await e.host.context(c).require(requirement);
  const h2 = await e.host.context(c).require(requirement);
  const options = { deadlineMs: e.now() + 1000, idempotencyKey: 'key' };
  assert.equal((await h1.call('echo', { text: 'x' }, options)).text, '1');
  assert.equal((await h2.call('echo', { text: 'x' }, options)).text, '1');
});

test('monotonic budget prevents late success when wall clock does not advance', async (t) => {
  const now = Date.now();
  const { session, q } = setup(t, {
    now: () => now,
    maxCallMs: 5,
    handlers: {
      echo: async (x) => {
        const until = performance.now() + 12;
        while (performance.now() < until) {}
        return x;
      },
    },
  });
  assert.equal(
    (await session.invoke(q())).result.error.code,
    'DEADLINE_EXCEEDED',
  );
  assert.equal(session.outstanding, 0);
});
test('terminal release callback runs once on both success and cancellation', async (t) => {
  for (const cancel of [false, true]) {
    let releases = 0;
    const { session, q } = setup(t, {
      admit: () => () => {
        releases++;
      },
      handlers: {
        echo: async (x) => {
          await delay(5);
          return x;
        },
      },
    });
    const pending = session.invoke(q());
    if (cancel) session.cancel('r1');
    await pending;
    await delay(10);
    assert.equal(releases, 1);
  }
});
test('wire diagnostic correlation is preserved without exception identity', () => {
  const r = {
    requestId: 'q1',
    result: {
      kind: 'error',
      error: {
        code: 'CONFLICT',
        message: 'CONFLICT',
        retryable: false,
        correlationId: 'trace-123',
      },
    },
  };
  assert.throws(
    () => decodeResponse(canonical(r), 'q1'),
    (e) => e.code === 'CONFLICT' && e.correlationId === 'trace-123',
  );
});
test('closed provider refuses both unary and streaming execution', async (t) => {
  for (const d of [echo, streamD()]) {
    const { provider, session, q } = setup(t, { d });
    provider.close();
    if (d.operations[0].kind === 'unary')
      assert.equal(
        (await session.invoke(q())).result.error.code,
        'UNAVAILABLE',
      );
    else await assert.rejects(session.stream(q()).next(), is('UNAVAILABLE'));
  }
});
test('conformance does not confuse its own oracle mismatch with a provider error', async () => {
  const result = await runConformance(echo, { echo: async (x) => x }, [
    {
      name: 'positive',
      operation: 'echo',
      input: { text: 'a' },
      expected: { text: 'a' },
    },
    {
      name: 'false-error',
      operation: 'echo',
      input: { text: 'a' },
      errorCode: 'CONTRACT_MISMATCH',
    },
  ]);
  assert.equal(result.passed, false);
  assert.equal(
    result.checks.find((x) => x.name === 'fixture:false-error').passed,
    false,
  );
});

test('credit starts at zero, bounds grants, and cancellation releases waiting producer', async () => {
  const c = new CreditWindow(2);
  let released = false;
  const pending = c.take().then(() => {
    released = true;
  });
  await delay(1);
  assert.equal(released, false);
  assert.equal(c.outstanding, 0);
  c.grant(1);
  await pending;
  assert.equal(c.outstanding, 0);
  assert.throws(() => c.grant(3), is('RESOURCE_EXHAUSTED'));
  const waiting = c.take();
  c.close();
  await assert.rejects(waiting, is('CANCELLED'));
  assert.equal(c.outstanding, 0);
});
test('slow stream reader applies backpressure rather than consuming unseen items', async (t) => {
  let produced = 0;
  const { session, q } = setup(t, {
    d: streamD(),
    streamCapacity: 1,
    handlers: {
      echo: async function* () {
        for (let i = 0; i < 5; i++) {
          produced++;
          yield { text: String(i) };
        }
      },
    },
  });
  const it = session.stream(q());
  await delay(5);
  assert.equal(produced, 0);
  assert.equal((await it.next()).value.text, '0');
  await delay(5);
  assert.equal(produced, 1);
  await it.return();
  assert.equal(session.outstanding, 0);
});
test('stream values and terminal errors cross JSON without local exception identity', async (t) => {
  const { session, q } = setup(t, {
    d: streamD(),
    handlers: {
      echo: async function* (x) {
        yield x;
        throw { code: 'CONFLICT', message: 'secret-value' };
      },
    },
  });
  const request = q();
  const frames = [];
  for await (const f of streamOutcomes(
    request.requestId,
    session.stream(request),
  ))
    frames.push(JSON.parse(canonical(f)));
  assert.equal(frames.length, 2);
  assert.equal(frames[1].result.error.code, 'CONFLICT');
  assert(!JSON.stringify(frames).includes('secret-value'));
  const remote = (async function* () {
    yield* frames;
  })();
  const it = readStreamOutcomes(request.requestId, remote)[
    Symbol.asyncIterator
  ]();
  assert.equal((await it.next()).value.text, 'a');
  await assert.rejects(it.next(), is('CONFLICT'));
  assert.equal((await it.next()).done, true);
});
test('stream decoder rejects missing terminal, bad sequence, and unknown fields', async () => {
  for (const frames of [
    [],
    [{ requestId: 'q', sequence: 2, result: { kind: 'complete' } }],
    [
      {
        requestId: 'q',
        sequence: 1,
        result: { kind: 'complete' },
        unknown: true,
      },
    ],
  ]) {
    const source = (async function* () {
      yield* frames;
    })();
    await assert.rejects(
      readStreamOutcomes('q', source)[Symbol.asyncIterator]().next(),
    );
  }
});

test('prototype-named JSON properties remain data through descriptor and invocation', async (t) => {
  const d = copy(echo);
  const shape = {
    type: 'object',
    properties: JSON.parse(
      '{"__proto__":{"type":"string"},"constructor":{"type":"string"}}',
    ),
    required: ['__proto__', 'constructor'],
    additionalProperties: false,
  };
  d.operations[0].input = shape;
  d.operations[0].output = copy(shape);
  const { session, q } = setup(t, { d });
  const input = JSON.parse('{"__proto__":"value","constructor":"data"}');
  const result = await session.invoke(q(input));
  assert.equal(result.result.kind, 'success');
  assert(Object.hasOwn(result.result.value, '__proto__'));
  assert.equal(result.result.value.__proto__, 'value');
  const bad = copy(d);
  bad.operations[0].input.properties.__proto__.maxLength = '5';
  assert.throws(() => descriptor(canonical(bad)));
});
test('finite payload interpreter enforces all G1 type constraints without coercion', () => {
  const cases = [
    [{ type: 'null' }, null, false],
    [{ type: 'boolean' }, false, 0],
    [{ type: 'integer', minimum: 1, maximum: 3 }, 2, 4],
    [{ type: 'string', minLength: 1, maxLength: 1 }, '💫', 'ab'],
    [
      { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 2 },
      [1],
      [1, 2, 3],
    ],
    [{ type: 'string', enum: ['a', 'b'], const: 'a' }, 'a', 'b'],
    [
      {
        type: 'object',
        properties: { x: { type: 'integer' } },
        required: ['x'],
        additionalProperties: false,
      },
      { x: 1 },
      { x: 1, y: 2 },
    ],
  ];
  for (const [s, valid, invalid] of cases) {
    payload(s, valid);
    assert.throws(() => payload(s, invalid), is('INVALID_ARGUMENT'));
  }
});
