import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { bootstrap, parse, canonical, digest } from '@alica/kernel';
import {
  environment,
  fixture,
  echo,
  requirement,
  consumerRequirement,
  consumerDescriptor,
  eventDescriptor,
  config,
  keyPair,
  signature,
  trustMaterial,
  stack,
  consumerSuite,
} from '../../tools/g3-fixtures.mjs';
const err = (code) => (e) => e.code === code;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ctxCode = 'export async function activate() {}';
const provideCode = (d, handler = 'async input=>input') =>
  `const d=${JSON.stringify(d)};export async function activate(ctx){ctx.provide(d,{echo:${handler}});}`;
const optionalClient = (e) =>
  e.load({
    id: 'org.alica.client',
    provides: [],
    optionalRequires: [requirement],
    code: ctxCode,
  });
for (const provider of ['a', 'b'])
  test(`independent Echo ${provider.toUpperCase()} passes unchanged consumer suite`, async (t) => {
    const e = await stack(t, [provider]);
    assert.equal((await consumerSuite(e.handle)).length, 5);
    assert.equal(
      e.host.inspect().instances.every((i) => i.state === 'ACTIVE'),
      true,
    );
    await e.host.shutdown();
    assert.deepEqual(
      { ...e.host.inspect().resources },
      { registrations: 0, listeners: 0, pendingCalls: 0, effects: 0 },
    );
    assert.equal(
      e.host.inspect().instances.every((i) => i.state === 'DISPOSED'),
      true,
    );
  });
for (const providers of [
  ['a', 'b'],
  ['b', 'a'],
])
  test(`selection invariant under order ${providers}`, async (t) => {
    const e = await stack(t, providers);
    const x = e.host.explain(e.consumer, requirement);
    assert.equal(x.selected.providerId, 'org.alica.echoa');
    assert.equal(x.candidates.length, 2);
    assert.match(x.tieBreak, /ASCII/);
    assert.equal(
      e.host.explain(e.consumer, requirement, 'org.alica.echob').selected
        .providerId,
      'org.alica.echob',
    );
    assert.throws(
      () => e.host.explain(e.consumer, requirement, 'org.alica.missing'),
      err('NOT_FOUND'),
    );
  });
for (const text of [
  '{"a":1,"a":2}',
  '{"a":1e0}',
  '{"a":1.0}',
  '{"a":9007199254740992}',
  '{"a":"\\ud800"}',
  '{"é":1}',
  '[1,]',
  '{"a":true}x',
])
  test(`strict parser rejects ${text}`, () => assert.throws(() => parse(text)));
test('bounded parsing/canonicalization rejects deep, cyclic, accessor, sparse and oversized values', () => {
  assert.throws(
    () => parse('['.repeat(34) + '0' + ']'.repeat(34)),
    err('RESOURCE_EXHAUSTED'),
  );
  assert.throws(() => parse(' '.repeat(1048577)), err('RESOURCE_EXHAUSTED'));
  const x = {};
  x.x = x;
  assert.throws(() => canonical(x));
  const accessor = {
    get x() {
      throw Error('must not run');
    },
  };
  assert.throws(() => canonical(accessor), err('INVALID_ARGUMENT'));
  assert.throws(() => canonical(new Array(2)));
  assert.equal(canonical({ 2: 2, 10: 10 }), '{"10":10,"2":2}');
  assert.equal(canonical(parse('{"x":-0}')), '{"x":0}');
  assert.throws(() => canonical({ x: undefined }));
  assert.throws(() => canonical({ x: 1.5 }));
  assert.throws(() => canonical({ x: Infinity }));
});
test('runtime canonical digest matches G1 descriptor and Unicode/control rules', () => {
  assert.equal(
    digest(echo),
    JSON.parse(readFileSync('specs/examples/plugin.valid.json', 'utf8'))
      .provides[0].descriptorDigest,
  );
  assert.equal(
    canonical({ z: '\u007f\u2028😀', a: [1, true, null] }),
    '{"a":[1,true,null],"z":"\u007f\u2028😀"}',
  );
});
test('configuration is closed and secrets cannot be placed in config', (t) => {
  const e = environment(t);
  assert.throws(
    () =>
      bootstrap(
        canonical({ ...config, secret: 'not-a-real-secret' }),
        e.options,
      ),
    err('INVALID_ARGUMENT'),
  );
  assert.throws(
    () => bootstrap(canonical({ ...config, timeTrusted: false }), e.options),
    err('FAILED_PRECONDITION'),
  );
});
for (const mutation of [
  'signature',
  'file',
  'unknown-manifest',
  'duplicate-json',
  'untrusted-key',
  'unsupported-stream',
])
  test(`verification rejects ${mutation} before evaluation`, async (t) => {
    const e = environment(t);
    delete globalThis.__alicaProof;
    let p = fixture(e.publisher, {
      code: 'globalThis.__alicaProof=true;export async function activate(){}',
    });
    if (mutation === 'signature') p.signature.signature = 'A'.repeat(86) + '==';
    if (mutation === 'file')
      p.files['dist/index.js'] = Buffer.from('globalThis.__alicaProof=true;');
    if (mutation === 'unknown-manifest')
      p = fixture(e.publisher, { manifest: { overrideTrust: true } });
    if (mutation === 'duplicate-json') {
      const m = p.files['plugin.json'].toString();
      p = fixture(e.publisher, {
        manifestText: m.replace('"id":', '"id":"org.alica.other","id":'),
      });
    }
    if (mutation === 'untrusted-key') p = fixture(keyPair());
    if (mutation === 'unsupported-stream') {
      const d = structuredClone(echo);
      d.operations[0].kind = 'stream';
      p = fixture(e.publisher, { provides: [d] });
    }
    assert.throws(() => e.host.discover(p));
    assert.equal(globalThis.__alicaProof, undefined);
  });
test('loaded bytes are immutable after verification', async (t) => {
  const e = environment(t);
  const p = fixture(e.publisher);
  const id = e.host.discover(p);
  p.files['dist/index.js'].fill(0);
  await e.host.activate(id);
  assert.equal(e.host.inspect().instances[0].state, 'ACTIVE');
});
test('unverified module imports cannot be linked or evaluated', async (t) => {
  const e = environment(t);
  const id = e.load({
    code: "import 'node:fs';globalThis.__alicaProof=true;export async function activate(){}",
  });
  await assert.rejects(e.host.activate(id), err('FAILED_PRECONDITION'));
  assert.equal(globalThis.__alicaProof, undefined);
  assert.equal(e.host.inspect().instances[0].state, 'FAILED');
});
for (const kind of ['missing', 'incompatible', 'denied'])
  test(`${kind} mandatory dependency blocks ACTIVE`, async (t) => {
    const e = environment(t);
    if (kind !== 'missing') {
      const d = structuredClone(echo);
      if (kind === 'incompatible') d.version = '2.0.0';
      e.load({ provides: [d], code: provideCode(d) });
    }
    const c = e.load({
      id: 'org.alica.consumer',
      provides: [],
      requires: [requirement],
      code: ctxCode,
    });
    if (kind !== 'denied') e.grant(c);
    await assert.rejects(e.host.activate(c));
    const i = e.host.inspect().instances.find((i) => i.id === c);
    assert.equal(i.state, 'FAILED');
    assert.equal(i.history.includes('ACTIVE'), false);
  });
test('mandatory cycles rejected; no participant becomes ACTIVE', async (t) => {
  const e = environment(t);
  const da = { ...structuredClone(echo), id: 'org.alica.a' },
    db = { ...structuredClone(echo), id: 'org.alica.b' };
  const a = e.load({
      id: 'org.alica.a',
      provides: [da],
      requires: [{ ...requirement, capabilityId: db.id }],
      code: provideCode(da),
    }),
    b = e.load({
      id: 'org.alica.b',
      provides: [db],
      requires: [{ ...requirement, capabilityId: da.id }],
      code: provideCode(db),
    });
  e.grant(a, db.id);
  e.grant(b, da.id);
  await assert.rejects(e.host.activate(a), err('CONFLICT'));
  assert.equal(
    e.host.inspect().instances.some((i) => i.history.includes('ACTIVE')),
    false,
  );
});
test('partial activation never publishes; effects clean in reverse order; disposal idempotent', async (t) => {
  const e = environment(t);
  globalThis.__cleanup = [];
  t.after(() => delete globalThis.__cleanup);
  const id = e.load({
    code: `export async function activate(ctx){ctx.provide(${JSON.stringify(echo)},{echo:async x=>x});await ctx.effect(async own=>{own(async()=>{globalThis.__cleanup.push('first')});own(async()=>{globalThis.__cleanup.push('second')});throw Error('synthetic-local-value')});}`,
  });
  await assert.rejects(e.host.activate(id), err('INTERNAL'));
  assert.deepEqual(globalThis.__cleanup, ['second', 'first']);
  const first = await e.host.dispose(id);
  assert.equal(first.state, 'FAILED');
  assert.deepEqual(await e.host.dispose(id), first);
  assert.equal(e.host.inspect().resources.registrations, 0);
  assert.equal(
    JSON.stringify(e.host.inspect()).includes('synthetic-local-value'),
    false,
  );
});
test('staged registration invisible while activation awaits', async (t) => {
  const e = environment(t);
  let release;
  globalThis.__activationGate = new Promise((resolve) => {
    release = resolve;
  });
  t.after(() => delete globalThis.__activationGate);
  const id = e.load({
    code: `export async function activate(ctx){ctx.provide(${JSON.stringify(echo)},{echo:async x=>x});await globalThis.__activationGate;}`,
  });
  const activation = e.host.activate(id);
  await delay(10);
  assert.equal(e.host.inspect().resources.registrations, 0);
  release();
  await activation;
  assert.equal(e.host.inspect().resources.registrations, 1);
});
test('cleanup failures remain FAILED, remaining disposers still execute', async (t) => {
  const e = environment(t);
  globalThis.__cleanup = [];
  t.after(() => delete globalThis.__cleanup);
  const id = e.load({
    provides: [],
    code: `export async function activate(ctx){await ctx.effect(async own=>{own(async()=>globalThis.__cleanup.push('continued'));own(async()=>{throw Error('private failure')});});}`,
  });
  await e.host.activate(id);
  const report = await e.host.dispose(id);
  assert.equal(report.state, 'FAILED');
  assert.equal(report.restartRequired, true);
  assert.deepEqual(globalThis.__cleanup, ['continued']);
  assert.deepEqual(await e.host.dispose(id), report);
  assert.equal(JSON.stringify(report).includes('private failure'), false);
});
test('uncooperative disposer times out and requires restart', async (t) => {
  const e = environment(t, { cleanupMs: 10 });
  const id = e.load({
    provides: [],
    code: 'export async function activate(ctx){await ctx.effect(async own=>{own(async()=>new Promise(()=>{}))})}',
  });
  await e.host.activate(id);
  const report = await e.host.dispose(id);
  assert.equal(report.state, 'FAILED');
  assert.equal(report.timedOutResources, 1);
  assert.equal(report.restartRequired, true);
});
test('capability denial and optional absence are distinct', async (t) => {
  const e = environment(t);
  const c = optionalClient(e);
  await e.host.activate(c);
  await assert.rejects(
    e.host.context(c).optional(requirement),
    err('PERMISSION_DENIED'),
  );
  e.grant(c);
  assert.equal(await e.host.context(c).optional(requirement), null);
});
for (const reason of ['revoked', 'expired'])
  test(`${reason} grant invalidates retained handle`, async (t) => {
    const e = environment(t);
    const p = e.load();
    const c = optionalClient(e);
    const g = e.grant(c);
    await e.host.activate(p);
    await e.host.activate(c);
    const h = await e.host.context(c).optional(requirement);
    if (reason === 'revoked') e.host.revokeGrant(g.grantId);
    else e.clock.offset = 31000;
    await assert.rejects(
      h.call('echo', { text: 'x' }, { deadlineMs: e.now() + 1000 }),
      err('PERMISSION_DENIED'),
    );
  });
test('wrong principal/instance/scope generation and widened child grants rejected', async (t) => {
  const e = environment(t);
  const c = optionalClient(e);
  await e.host.activate(c);
  const identity = e.host.identity(c);
  for (const extra of [
    { principal: 'org.alica.other' },
    { scopeGeneration: 2 },
  ])
    assert.throws(
      () => e.grant(c, echo.id, ['echo'], extra),
      err('PERMISSION_DENIED'),
    );
  const child = e.host.context(c).createScope();
  assert.throws(
    () =>
      e.grant(c, echo.id, ['echo'], {
        scope: child.scope,
        scopeGeneration: child.scopeGeneration,
      }),
    err('PERMISSION_DENIED'),
  );
  const parent = e.grant(c);
  const childGrant = e.grant(c, echo.id, ['echo'], {
    scope: child.scope,
    scopeGeneration: child.scopeGeneration,
    expiresAtMs: parent.expiresAtMs,
  });
  assert.equal(await child.optional(requirement), null);
  e.host.revokeGrant(parent.grantId);
  await assert.rejects(child.optional(requirement), err('PERMISSION_DENIED'));
});
test('child scope teardown invalidates handles and removes only owned resources', async (t) => {
  const e = environment(t);
  const p = e.load();
  const c = optionalClient(e);
  const parent = e.grant(c);
  await e.host.activate(p);
  await e.host.activate(c);
  const child = e.host.context(c).createScope();
  e.grant(c, echo.id, ['echo'], {
    scope: child.scope,
    scopeGeneration: child.scopeGeneration,
    expiresAtMs: parent.expiresAtMs,
  });
  const h = await child.optional(requirement);
  assert.equal(
    (await h.call('echo', { text: 'x' }, { deadlineMs: e.now() + 1000 })).text,
    'x',
  );
  await e.host.destroyScope(child.scope);
  await assert.rejects(
    h.call('echo', { text: 'x' }, { deadlineMs: e.now() + 1000 }),
    err('FAILED_PRECONDITION'),
  );
  assert.equal(
    e.host.inspect().instances.every((i) => i.state === 'ACTIVE'),
    true,
  );
  const newScope = e.host.createScope('root', undefined, child.scope);
  assert.equal(
    e.host.inspect().scopes.find((x) => x.id === newScope).generation,
    2,
  );
  await assert.rejects(child.optional(requirement), err('FAILED_PRECONDITION'));
});
test('parent cannot see child registrations', async (t) => {
  const e = environment(t);
  const s = e.host.createScope('root');
  const p = e.load({}, s);
  await e.host.activate(p);
  const c = optionalClient(e);
  e.grant(c);
  await e.host.activate(c);
  assert.equal(await e.host.context(c).optional(requirement), null);
  assert.equal(e.host.explain(c, requirement).candidates.length, 0);
});
test('mandatory provider loss quiesces consumer transitively without rebinding', async (t) => {
  const e = await stack(t, ['a', 'b']);
  await e.host.dispose(e.pids[0]);
  assert.equal(
    e.host.inspect().instances.find((i) => i.id === e.consumer).state,
    'DISPOSED',
  );
  assert.equal(
    e.host.inspect().instances.find((i) => i.id === e.client).state,
    'DISPOSED',
  );
  await assert.rejects(
    e.handle.call('echo', { text: 'x' }, { deadlineMs: e.now() + 1000 }),
  );
  assert.equal(
    e.host.inspect().instances.find((i) => i.id === e.pids[1]).state,
    'ACTIVE',
  );
});
test('revocation during call prevents result delivery', async (t) => {
  const e = environment(t);
  const p = e.load({
    code: provideCode(
      echo,
      'async x=>{await new Promise(r=>setTimeout(r,30));return x}',
    ),
  });
  const c = optionalClient(e),
    g = e.grant(c);
  await e.host.activate(p);
  await e.host.activate(c);
  const h = await e.host.context(c).optional(requirement);
  const result = h.call('echo', { text: 'x' }, { deadlineMs: e.now() + 1000 });
  await delay(5);
  e.host.revokeGrant(g.grantId);
  await assert.rejects(result, err('PERMISSION_DENIED'));
});
test('unload during call cancels delivery and cleans call tracking', async (t) => {
  const e = environment(t);
  const p = e.load({
    code: provideCode(
      echo,
      'async(x,op)=>new Promise((resolve,reject)=>{op.signal.addEventListener("abort",()=>reject(Error("stopped")),{once:true})})',
    ),
  });
  const c = optionalClient(e);
  e.grant(c);
  await e.host.activate(p);
  await e.host.activate(c);
  const h = await e.host.context(c).optional(requirement);
  const promise = h.call('echo', { text: 'x' }, { deadlineMs: e.now() + 1000 });
  const rejected = assert.rejects(promise, err('UNAVAILABLE'));
  await e.host.dispose(p);
  await rejected;
  assert.equal(e.host.inspect().resources.pendingCalls, 0);
});
test('deadline, cancellation, input/output validation and no idempotent replay', async (t) => {
  const e = environment(t);
  const p = e.load({
    code: provideCode(
      echo,
      'async x=>{await new Promise(r=>setTimeout(r,30));return x}',
    ),
  });
  const c = optionalClient(e);
  e.grant(c);
  await e.host.activate(p);
  await e.host.activate(c);
  const h = await e.host.context(c).optional(requirement);
  await assert.rejects(
    h.call('echo', { text: 'x' }, { deadlineMs: e.now() - 1 }),
    err('DEADLINE_EXCEEDED'),
  );
  await assert.rejects(
    h.call('echo', { text: 1 }, { deadlineMs: e.now() + 1000 }),
    err('INVALID_ARGUMENT'),
  );
  await assert.rejects(
    h.call(
      'echo',
      { text: 'x' },
      { deadlineMs: e.now() + 1000, idempotencyKey: 'key' },
    ),
    err('INVALID_ARGUMENT'),
  );
  await assert.rejects(
    h.call('echo', { text: 'x' }, { deadlineMs: e.now() + 5 }),
    err('DEADLINE_EXCEEDED'),
  );
  const controller = new AbortController();
  const promise = h.call(
    'echo',
    { text: 'x' },
    { deadlineMs: e.now() + 1000, signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(promise, err('CANCELLED'));
});
test('provider errors and invalid output normalized without value leakage', async (t) => {
  const e = environment(t);
  const p = e.load({ code: provideCode(echo, 'async()=>({text:123})') });
  const c = optionalClient(e);
  e.grant(c);
  await e.host.activate(p);
  await e.host.activate(c);
  const h = await e.host.context(c).optional(requirement);
  await assert.rejects(
    h.call('echo', { text: 'x' }, { deadlineMs: e.now() + 1000 }),
    err('INVALID_ARGUMENT'),
  );
});
test('secret access requires declaration and separate grant; inspection redacts values', async (t) => {
  const e = environment(t);
  const c = e.load({
    provides: [],
    secretReferences: ['synthetic-test'],
    code: ctxCode,
  });
  await e.host.activate(c);
  const context = e.host.context(c);
  await assert.rejects(
    context.secret('synthetic-test'),
    err('PERMISSION_DENIED'),
  );
  const g = e.grant(c, undefined, ['read'], {
    schemaVersion: 'acap.secret-grant/v1',
    secretRef: 'synthetic-test',
  });
  assert.equal(await context.secret('synthetic-test'), 'synthetic-local-value');
  assert.equal(
    JSON.stringify(e.host.inspect()).includes('synthetic-local-value'),
    false,
  );
  await assert.rejects(context.secret('undeclared'), err('PERMISSION_DENIED'));
  e.host.revokeGrant(g.grantId);
  await assert.rejects(
    context.secret('synthetic-test'),
    err('PERMISSION_DENIED'),
  );
});
async function eventPair(t, overrides = {}) {
  const e = environment(t, overrides);
  const opts = { provides: [], events: [eventDescriptor], code: ctxCode };
  const p = e.load({ ...opts, id: 'org.alica.publisher', publish: true }),
    s = e.load({ ...opts, id: 'org.alica.subscriber', subscribe: true });
  const pg = e.grant(p, undefined, ['publish'], {
      schemaVersion: 'acap.event-grant/v1',
      eventType: eventDescriptor.id,
    }),
    sg = e.grant(s, undefined, ['subscribe'], {
      schemaVersion: 'acap.event-grant/v1',
      eventType: eventDescriptor.id,
    });
  await e.host.activate(p);
  await e.host.activate(s);
  return { ...e, p, s, pg, sg, pub: e.host.context(p), sub: e.host.context(s) };
}
test('events deliver FIFO broker identity; disposer removes listener', async (t) => {
  const e = await eventPair(t);
  const got = [];
  const dispose = e.sub.on(eventDescriptor.id, async (event) => {
    got.push(event);
  });
  await e.pub.emit(eventDescriptor.id, 'first');
  await e.pub.emit(eventDescriptor.id, 'second');
  await delay(10);
  assert.deepEqual(
    got.map((x) => x.data),
    ['first', 'second'],
  );
  assert.deepEqual(
    got.map((x) => x.sequence),
    [1, 2],
  );
  assert.equal(got[0].sourceInstanceId, e.p);
  await dispose();
  await dispose();
  assert.equal(e.host.inspect().resources.listeners, 0);
});
test('event rechecks revoked subscription and publisher; handler failures isolated', async (t) => {
  const e = await eventPair(t);
  const got = [];
  e.sub.on(eventDescriptor.id, async (event) => {
    got.push(event);
  });
  e.host.revokeGrant(e.sg.grantId);
  await e.pub.emit(eventDescriptor.id, 'hidden');
  await delay(5);
  assert.equal(got.length, 0);
  await assert.rejects(
    e.sub.emit(eventDescriptor.id, 'not publisher'),
    err('PERMISSION_DENIED'),
  );
});
test('bounded event overflow terminates affected subscription and cleanup reclaims listener', async (t) => {
  const e = await eventPair(t, { eventQueue: 1, maxCallMs: 20 });
  e.sub.on(eventDescriptor.id, async () => new Promise(() => {}));
  for (let n = 0; n < 5; n++) await e.pub.emit(eventDescriptor.id, 'x');
  await delay(30);
  assert.equal(e.host.inspect().resources.listeners, 0);
  assert(e.host.inspect().audit.some((a) => a.reason === 'RESOURCE_EXHAUSTED'));
  await e.host.dispose(e.s);
  assert.equal(e.host.inspect().resources.listeners, 0);
});
test('audit exhaustion blocks mutation but never emergency revocation', async (t) => {
  const e = environment(t, { auditCapacity: 8 });
  const c = optionalClient(e);
  const g = e.grant(c);
  while (true) {
    try {
      e.host.createScope('root');
    } catch (error) {
      assert.equal(error.code, 'RESOURCE_EXHAUSTED');
      break;
    }
  }
  assert.throws(
    () => e.host.issueGrant({ ...g, grantId: 'new-grant' }),
    err('RESOURCE_EXHAUSTED'),
  );
  e.host.revokeGrant(g.grantId);
  assert.equal(
    e.host.inspect().grants.find((x) => x.id === g.grantId).revoked,
    true,
  );
  assert.equal(e.host.inspect().auditUnavailable, true);
});
test('expired trust and backward clock fail closed', async (t) => {
  const e = environment(t);
  const c = optionalClient(e);
  await e.host.activate(c);
  e.clock.offset = -10000;
  assert.throws(() => e.host.context(c));
  e.clock.offset = 0;
  assert.throws(
    () => e.host.discover(fixture(e.publisher)),
    err('FAILED_PRECONDITION'),
  );
});
test('trust revocation quiesces running providers', async (t) => {
  const e = await stack(t);
  const pkg = e.host
    .inspect()
    .instances.find((i) => i.id === e.pids[0]).packageDigest;
  const next = trustMaterial(e.root, e.publisher, e.now(), {
    revocation: { version: 2, revokedArtifactDigests: [pkg] },
  }); // unchanged policy version must retain exactly its earlier bytes
  next.policy = e.options.trust.policy;
  next.policySignature = e.options.trust.policySignature;
  e.host.updateTrust(next);
  await delay(10);
  assert.equal(
    e.host.inspect().instances.find((i) => i.id === e.pids[0]).state,
    'DISPOSED',
  );
});
test('persistent trust state rejects rollback and missing-state recovery', async (t) => {
  const e = environment(t);
  const next = trustMaterial(e.root, e.publisher, e.now(), {
    policy: { version: 2 },
    revocation: { version: 2 },
  });
  e.host.updateTrust(next);
  assert.throws(
    () => bootstrap(canonical(config), e.options),
    err('PERMISSION_DENIED'),
  );
  assert.throws(
    () =>
      bootstrap(canonical(config), {
        ...e.options,
        statePath: e.dir + '/missing',
        initialize: false,
      }),
    err('FAILED_PRECONDITION'),
  );
});
test('root rotation requires both old and new signatures plus exact next policy', async (t) => {
  const e = environment(t);
  const nextRoot = keyPair();
  const next = trustMaterial(nextRoot, e.publisher, e.now(), {
    policy: { version: 2 },
    revocation: { version: 2 },
  });
  const record = {
    schemaVersion: 'alica.root-rotation/v1',
    priorVersion: 1,
    nextVersion: 2,
    priorPolicyDigest: digest(e.options.trust.policy),
    nextPolicyDigest: digest(next.policy),
    priorKeyId: e.root.id,
    nextKeyId: nextRoot.id,
  };
  const rotation = {
    record,
    oldSignature: signature(record, 'ALICA-ROOT-ROTATION-v1', e.root),
    newSignature: signature(record, 'ALICA-ROOT-ROTATION-v1', nextRoot),
  };
  assert.throws(
    () =>
      e.host.updateTrust(next, {
        ...rotation,
        newSignature: rotation.oldSignature,
      }),
    err('PERMISSION_DENIED'),
  );
  e.host.updateTrust(next, rotation);
  const id = e.load();
  await e.host.activate(id);
  assert.equal(e.host.inspect().instances[0].state, 'ACTIVE');
});
