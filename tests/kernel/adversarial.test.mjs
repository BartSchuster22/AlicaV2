import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { bootstrap, canonical, parse, digest } from '@alica/kernel';
import {
  environment,
  fixture,
  echo,
  requirement,
  consumerRequirement,
  consumerDescriptor,
  config,
  stack,
  consumerSuite,
} from '../../tools/g3-fixtures.mjs';
const err = (code) => (e) => e.code === code;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const code = (d, handler = 'async x=>x') =>
  `export async function activate(ctx){ctx.provide(${JSON.stringify(d)},{echo:${handler}})}`;
const client = (e, req = requirement) =>
  e.load({
    id: 'org.alica.client',
    provides: [],
    optionalRequires: [req],
    code: 'export async function activate(){}',
  });
test('same capability/version with different digest is rejected before activation', async (t) => {
  const e = environment(t);
  e.load();
  const changed = structuredClone(echo);
  changed.operations[0].input.properties.text.maxLength = 12;
  assert.throws(
    () =>
      e.load({
        id: 'org.alica.alternative',
        provides: [changed],
        code: code(changed),
      }),
    err('CONTRACT_MISMATCH'),
  );
  assert.equal(e.host.inspect().instances.length, 1);
});
test('duplicate visible provider identity is conflict, not load-order selection', async (t) => {
  const e = environment(t);
  e.load();
  assert.throws(() => e.load(), err('CONFLICT'));
  const child = e.host.createScope('root');
  assert.throws(() => e.load({}, child), err('CONFLICT'));
});
test('version/feature exclusions explain deterministic ranking and optional negotiation', async (t) => {
  const e = environment(t);
  const older = structuredClone(echo),
    newer = structuredClone(echo);
  older.version = '1.1.0';
  newer.version = '1.2.3';
  newer.features = ['fast'];
  const a = e.load({
      id: 'org.alica.older',
      provides: [older],
      code: code(older),
    }),
    b = e.load({ id: 'org.alica.newer', provides: [newer], code: code(newer) });
  const req = { ...requirement, optionalFeatures: ['fast'] };
  const c = client(e, req);
  e.grant(c);
  await e.host.activate(a);
  await e.host.activate(b);
  await e.host.activate(c);
  const explanation = e.host.explain(c, req);
  assert.equal(explanation.selected.providerId, 'org.alica.newer');
  const bound = await e.host.context(c).optional(req);
  assert.deepEqual([...bound.negotiatedFeatures], ['fast']);
  req.operations = [];
  assert.equal(
    (
      await bound.call(
        'echo',
        { text: 'immutable handle requirement' },
        { deadlineMs: e.now() + 1000 },
      )
    ).text,
    'immutable handle requirement',
  );
  assert.equal(
    e.host
      .explain(c, { ...requirement, maxMinor: 1 })
      .candidates.find((x) => x.providerId === 'org.alica.newer').exclusion,
    'INCOMPATIBLE_VERSION',
  );
});
test('planning is registry/lifecycle read-only; profile pin controls real calls and lock', async (t) => {
  const e = environment(t);
  const a = e.load(),
    b = e.load({
      id: 'org.alica.echob',
      code: readFileSync('packages/echo-b/dist/index.js', 'utf8'),
    });
  const consumer = e.load({
    id: 'org.alica.consumer',
    provides: [consumerDescriptor],
    requires: [requirement],
    code: readFileSync('packages/echo-consumer/dist/index.js', 'utf8'),
  });
  const caller = e.load({
    id: 'org.alica.client',
    provides: [],
    requires: [consumerRequirement],
    code: 'export async function activate(){}',
  });
  e.grant(consumer);
  e.grant(caller, consumerDescriptor.id);
  const before = e.host.inspect();
  const profile = {
    schemaVersion: 'alica.profile/v1',
    profileId: 'org.alica.synthetic',
    version: '1.0.0',
    plugins: before.instances.map((i) => ({
      id: i.principal,
      version: '1.0.0',
      packageDigest: i.packageDigest,
    })),
    providerPins: [{ capabilityId: echo.id, providerId: 'org.alica.echob' }],
    scopes: [
      { id: 'root', parent: null },
      { id: 'child', parent: 'root' },
    ],
  };
  const text = canonical(profile);
  const plan = e.host.plan(text);
  assert.equal(canonical(e.host.inspect()), canonical(before));
  assert.equal(
    plan.lock.bindings.find((b) => b.consumerId === 'org.alica.consumer')
      .providerId,
    'org.alica.echob',
  );
  assert.equal(canonical(plan.lock).includes('synthetic-cell'), false);
  const actual = await e.host.startProfile(text);
  assert.equal(digest(actual.lock), digest(plan.lock));
  const h = await e.host.context(caller).require(consumerRequirement);
  await consumerSuite(h);
  assert.equal(
    e.host.explain(consumer, requirement).selected.providerId,
    'org.alica.echob',
  );
  assert.equal(
    e.host.inspect().scopes.some((s) => s.id === 'child'),
    true,
  );
  await e.host.dispose(a);
  assert.equal(
    e.host.inspect().instances.find((i) => i.id === consumer).state,
    'ACTIVE',
  );
  await e.host.dispose(b);
  assert.equal(
    e.host.inspect().instances.find((i) => i.id === consumer).state,
    'DISPOSED',
  );
});
test('invalid profile pin fails before evaluating any module', async (t) => {
  const e = environment(t);
  const p = fixture(e.publisher);
  e.host.discover(p);
  const profile = JSON.parse(p.profileText);
  profile.providerPins = [
    { capabilityId: echo.id, providerId: 'org.alica.absent' },
  ];
  await assert.rejects(
    e.host.startProfile(canonical(profile)),
    err('NOT_FOUND'),
  );
  assert.equal(e.host.inspect().instances[0].state, 'VERIFIED');
});
test('cancellation first terminal outcome wins over immediate provider success', async (t) => {
  const e = environment(t);
  const p = e.load(),
    c = client(e);
  e.grant(c);
  await e.host.activate(p);
  await e.host.activate(c);
  const h = await e.host.context(c).optional(requirement);
  const abort = new AbortController();
  const result = h.call(
    'echo',
    { text: 'late' },
    { deadlineMs: e.now() + 1000, signal: abort.signal },
  );
  abort.abort();
  abort.abort();
  await assert.rejects(result, err('CANCELLED'));
  assert.equal(e.host.inspect().resources.pendingCalls, 0);
});
test('call values are detached in both directions, not live objects', async (t) => {
  const e = environment(t);
  globalThis.__out = null;
  t.after(() => delete globalThis.__out);
  const p = e.load({
      code: code(
        echo,
        'async x=>{x.text="provider";globalThis.__out=x;return x}',
      ),
    }),
    c = client(e);
  e.grant(c);
  await e.host.activate(p);
  await e.host.activate(c);
  const h = await e.host.context(c).optional(requirement);
  const input = { text: 'caller' };
  const result = await h.call('echo', input, { deadlineMs: e.now() + 1000 });
  assert.equal(input.text, 'caller');
  result.text = 'changed after delivery';
  assert.equal(globalThis.__out.text, 'provider');
});
test('pending uncooperative call is reported instead of falsely clean disposal', async (t) => {
  const e = environment(t, { cleanupMs: 10 });
  const p = e.load({ code: code(echo, 'async()=>new Promise(()=>{})') }),
    c = client(e);
  e.grant(c);
  await e.host.activate(p);
  await e.host.activate(c);
  const h = await e.host.context(c).optional(requirement);
  const failed = assert.rejects(
    h.call('echo', { text: 'x' }, { deadlineMs: e.now() + 1000 }),
    err('UNAVAILABLE'),
  );
  const report = await e.host.dispose(p);
  await failed;
  assert.equal(report.state, 'FAILED');
  assert.equal(report.restartRequired, true);
  assert.equal(report.timedOutResources, 1);
  assert.equal(e.host.inspect().resources.pendingCalls, 0);
});
test('expired trust stops new calls and quiesces all live instances', async (t) => {
  const e = await stack(t);
  e.clock.offset = 61000;
  await assert.rejects(
    e.handle.call('echo', { text: 'x' }, { deadlineMs: e.now() + 1000 }),
    err('PERMISSION_DENIED'),
  );
  await delay(10);
  assert.equal(
    e.host.inspect().instances.every((i) => i.state === 'DISPOSED'),
    true,
  );
});
test('secret grant rechecked immediately before result delivery', async (t) => {
  const e = environment(t);
  const id = e.load({
    provides: [],
    secretReferences: ['synthetic-test'],
    code: 'export async function activate(){}',
  });
  const g = e.grant(id, undefined, ['read'], {
    schemaVersion: 'acap.secret-grant/v1',
    secretRef: 'synthetic-test',
  });
  await e.host.activate(id);
  const secret = e.host.context(id).secret('synthetic-test');
  e.host.revokeGrant(g.grantId);
  await assert.rejects(secret, err('PERMISSION_DENIED'));
});
test('nested scopes destroyed before parent owner and stale contexts never revive', async (t) => {
  const e = environment(t);
  const id = e.load({
    provides: [],
    code: 'export async function activate(){}',
  });
  await e.host.activate(id);
  const child = e.host.context(id).createScope(),
    grandchild = child.createScope();
  await e.host.dispose(id);
  assert.equal(e.host.inspect().scopes.length, 1);
  assert.throws(() => child.createScope(), err('FAILED_PRECONDITION'));
  assert.throws(() => grandchild.createScope(), err('FAILED_PRECONDITION'));
});
test('nested calls cannot extend inherited deadline', async (t) => {
  const e = environment(t);
  const p = e.load({
    code: code(
      echo,
      'async x=>{await new Promise(resolve=>setTimeout(resolve,40));return x}',
    ),
  });
  const consumer = e.load({
    id: 'org.alica.consumer',
    provides: [consumerDescriptor],
    requires: [requirement],
    code: `export async function activate(ctx){const h=await ctx.require(${JSON.stringify(requirement)});ctx.provide(${JSON.stringify(consumerDescriptor)},{echo:async x=>h.call('echo',x,{deadlineMs:Date.now()+10000})})}`,
  });
  const caller = client(e, consumerRequirement);
  e.grant(consumer);
  e.grant(caller, consumerDescriptor.id);
  await e.host.activate(p);
  await e.host.activate(consumer);
  await e.host.activate(caller);
  const h = await e.host.context(caller).optional(consumerRequirement);
  await assert.rejects(
    h.call('echo', { text: 'x' }, { deadlineMs: e.now() + 10 }),
    err('DEADLINE_EXCEEDED'),
  );
  await delay(50);
  assert.equal(e.host.inspect().resources.pendingCalls, 0);
});
test('same-version altered trust metadata and corrupted durable state are rejected', async (t) => {
  const e = environment(t);
  const policy = structuredClone(e.options.trust.policy);
  policy.maxOfflineAgeMs--;
  assert.throws(
    () => e.host.updateTrust({ ...e.options.trust, policy }),
    err('PERMISSION_DENIED'),
  );
  writeFileSync(e.options.statePath, '{}');
  assert.throws(
    () => bootstrap(canonical(config), e.options),
    err('FAILED_PRECONDITION'),
  );
});
