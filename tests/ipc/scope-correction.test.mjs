// Real signed Host/PhysicalSession/worker path. Observers retain actual adapter
// descriptors; they never synthesize replies, replace transport, or mock Host.
// Direct hostile calls below are explicitly dispatcher/authority-boundary tests,
// not evidence for native sender authentication (covered by the original matrix).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  environment,
  fixture,
  trustMaterial,
} from '../../tools/g3-fixtures.mjs';
import { HostIPC } from '../../packages/kernel/dist/g6/host-adapter.js';
import { native } from '../../packages/kernel/dist/g6/native.js';
const descriptor = {
  schemaVersion: 'acap.capability/v1',
  id: 'org.alica.correction',
  version: '1.0.0',
  features: [],
  operations: [
    {
      name: 'run',
      kind: 'unary',
      input: { type: 'string', maxLength: 64 },
      output: { type: 'string', maxLength: 4096 },
      idempotency: 'none',
    },
  ],
};
const requirement = {
  capabilityId: descriptor.id,
  major: 1,
  minMinor: 0,
  operations: ['run'],
  features: [],
};
const source = `
import { AcapError } from '@alica/acap-contracts';
export async function activate(ctx) {
  const child=ctx.createScope();
  let started=false, resume, cleanupStarted=false, cleanupResume, entered=0, capacityResume, cleaned=0, waiting=false;
  const capacityGate=new Promise(resolve=>capacityResume=resolve);
  ctx.provide(${JSON.stringify(descriptor)}, {run:async (command, operation)=>{
    if(command==='scope') return child.scope;
    if(command==='healthy') return 'healthy';
    if(command==='wait-started') return String(waiting);
    if(command==='wait') {
      waiting=true;
      return new Promise((resolve,reject)=>{
        const abort=()=>reject(new AcapError('CANCELLED'));
        if(operation.signal.aborted)abort();
        else operation.signal.addEventListener('abort',abort,{once:true});
      });
    }
    if(command==='zero') { for(let n=0;n<12;n++) await child.effect(async()=> 'zero'); return 'zero'; }
    if(command==='hold' || command==='hold-owned') return child.effect(async register=> {if(command==='hold-owned')register(async()=>{cleaned++});started=true;return new Promise(resolve=>resume=resolve)});
    if(command==='cleaned') return String(cleaned);
    if(command==='started') return String(started);
    if(command==='resume') {resume('resumed');return 'resumed'}
    if(command==='cleanup-started') return String(cleanupStarted);
    if(command==='cleanup-go') {cleanupResume();return 'released'}
    if(command==='cleanup-hold') {
      try { await ctx.effect(async register=>{
        register(async()=>{cleanupStarted=true;await new Promise(resolve=>cleanupResume=resolve)});
        throw new AcapError('CONFLICT');
      }) } catch(error) {if(error.code!=='CONFLICT')throw error}
      return 'cleaned';
    }
    if(command==='siblings' || command==='nested') {
      let count=0, go, result='not-run';
      const gate=new Promise(resolve=>go=resolve);
      const rollback=async(slow)=>{
        try { await ctx.effect(async register=>{
          register(async()=>{
            count++;if(count===2)go();await gate;
            if(slow) {
              await new Promise(resolve=>setTimeout(resolve,80));
              const leaf=async()=>{const own=await ctx.optional(${JSON.stringify(requirement)});result=await own.call('run','healthy',{deadlineMs:Date.now()+4000})};
              if(command==='nested') {
                try {await ctx.effect(async inner=>{inner(leaf);throw new AcapError('CONFLICT')})}
                catch(error){if(error.code!=='CONFLICT')throw error}
              } else await leaf();
            }
          });throw new AcapError('CONFLICT');
        }) } catch(error) {if(error.code!=='CONFLICT')throw error}
      };
      await Promise.all([rollback(false),rollback(true)]);
      return count+':'+result;
    }
    if(command==='capacity') {
      try {await ctx.effect(async register=>{
        register(async()=>{
          const first=++entered===1;
          if(entered===4)capacityResume();
          await capacityGate;
          if(first) {
            try {await ctx.effect(async inner=>{inner(async()=>{throw Error('must not dispatch')});throw new AcapError('CONFLICT')})}
            catch(error){if(error.code!=='CONFLICT')throw error}
            cleanupResume();
          } else await new Promise(resolve=>{
            const prior=cleanupResume;cleanupResume=()=>{prior?.();resolve()};
          });
        });throw new AcapError('CONFLICT');
      })} catch(error){if(error.code!=='CONFLICT')throw error}
      return 'capacity';
    }
    return 'unknown';
  }});
}
`;
const pause = () => new Promise((resolve) => setTimeout(resolve, 2));
async function until(fn, timeoutMs = 4000) {
  const end = Date.now() + timeoutMs;
  while (!(await fn())) {
    assert.ok(Date.now() < end, 'real worker must make progress');
    await pause();
  }
}
async function setup(t, config = {}) {
  const beforeFD = native.managed();
  const observations = { checks: [], sent: [], received: [] };
  const originals = {
    send: HostIPC.prototype.send,
    receive: HostIPC.prototype.receive,
    scoped: HostIPC.prototype.scoped,
  };
  let e;
  HostIPC.prototype.send = function (endpoint, message) {
    observations.sent.push({
      adapter: this,
      endpoint,
      message,
      parent: endpoint.context.parent,
      live: !endpoint.context.terminal,
    });
    return originals.send.call(this, endpoint, message);
  };
  HostIPC.prototype.receive = function (endpoint, frame) {
    observations.received.push({ adapter: this, endpoint, frame });
    return originals.receive.call(this, endpoint, frame);
  };
  HostIPC.prototype.scoped = function (endpoint, body) {
    if (body.kind !== 'scope-check')
      return originals.scoped.call(this, endpoint, body);
    const snapshot = () => ({
      host: e.host.inspect(),
      effects: this.effects.size,
      scheduler: this.session.scheduler.usage,
      fd: native.managed(),
    });
    const before = snapshot();
    const result = originals.scoped.call(this, endpoint, body);
    const after = snapshot();
    observations.checks.push({ adapter: this, endpoint, body, before, after });
    return result;
  };
  t.after(() => Object.assign(HostIPC.prototype, originals));
  e = environment(t, {
    activationMs: 5000,
    maxCallMs: 10000,
    cleanupMs: 2000,
    ...config,
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
  const provider = e.host.discover(
    fixture(e.publisher, {
      id: 'org.alica.correctionprovider',
      provides: [descriptor],
      optionalRequires: [requirement],
      code: source,
      manifest: { execution: 'ipc' },
    }),
  );
  const client = e.load({
    id: 'org.alica.correctionclient',
    provides: [],
    requires: [requirement],
    code: 'export async function activate(){}',
  });
  e.grant(client, descriptor.id, ['run']);
  e.grant(provider, descriptor.id, ['run']);
  await e.host.activate(client);
  const bound = await e.host.context(client).require(requirement);
  const call = (command, options = {}) =>
    bound.call('run', command, { deadlineMs: Date.now() + 8000, ...options });
  assert.equal(await call('healthy'), 'healthy');
  return { ...e, ...observations, provider, client, call, beforeFD };
}
function cleanups(e) {
  return e.sent.filter(
    (x) =>
      x.message.tag === 'request' && x.message.body.kind === 'effect-cleanup',
  );
}
async function dispose(e, failed = []) {
  const report = await e.host.dispose(e.provider);
  assert.deepEqual(report.failedDisposers, failed);
  assert.equal(report.restartRequired, failed.length > 0);
  assert.equal(
    native.managed(),
    e.beforeFD,
    'all real broker-owned descriptors reaped/closed',
  );
}

test(
  'scope-check is read-only even with the real Host effect budget exhausted',
  { timeout: 20000 },
  async (t) => {
    const e = await setup(t, { maxEffects: 1 }); // provide consumes the only effect slot
    const before = e.host.inspect();
    assert.equal(await e.call('zero'), 'zero');
    assert.equal(
      e.checks.length,
      24,
      'preflight and completion, including zero-cleanup acquisitions',
    );
    for (const c of e.checks)
      assert.deepEqual(
        c.after,
        c.before,
        'no scope/grant/effect/endpoint/FD/audit mutation',
      );
    assert.deepEqual(e.host.inspect().resources, before.resources);
    assert.equal(cleanups(e).length, 0);
    await dispose(e);
  },
);

test(
  'live Host authority rejects stale/foreign scopes and replay without changing the held endpoint',
  { timeout: 20000 },
  async (t) => {
    const e = await setup(t);
    const held = e.call('hold');
    await until(async () => (await e.call('started')) === 'true');
    const { adapter, endpoint, body } = e.checks.at(-1);
    const foreign = e.host.context(e.client).createScope();
    const foreignGeneration = e.host
      .inspect()
      .scopes.find((s) => s.id === foreign.scope).generation;
    for (const change of [
      { scopeId: foreign.scope, scopeGeneration: foreignGeneration },
      { scopeGeneration: body.scopeGeneration + 1 },
      { scopeId: 'unknown' },
    ]) {
      await assert.rejects(adapter.scoped(endpoint, { ...body, ...change }), {
        code: 'PERMISSION_DENIED',
      });
    }
    const original = e.received.find(
      (x) => x.endpoint === endpoint && x.frame.body.kind === 'scope-check',
    );
    assert.ok(original);
    assert.throws(() => adapter.receive(endpoint, original.frame), {
      code: 'UNAUTHENTICATED',
    });
    // Wire generation/header replay is independently covered by EndpointFence;
    // this is the actual broker request-watermark and live Host boundary.
    assert.equal(await e.call('resume'), 'resumed');
    assert.equal(await held, 'resumed');
    await until(() => endpoint.context.terminal !== undefined);
    await assert.rejects(adapter.scoped(endpoint, body), {
      code: 'FAILED_PRECONDITION',
    });
    assert.equal(await e.call('healthy'), 'healthy');
    await dispose(e);
  },
);

test(
  'closed-child preflight prevents acquisition without creating a resource',
  { timeout: 20000 },
  async (t) => {
    const e = await setup(t);
    const scope = await e.call('scope');
    await e.host.destroyScope(scope);
    await assert.rejects(e.call('hold'), { code: 'FAILED_PRECONDITION' });
    assert.equal(await e.call('started'), 'false');
    assert.equal(cleanups(e).length, 0);
    for (const c of e.checks) assert.deepEqual(c.after, c.before);
    await dispose(e);
  },
);

test(
  'completion rejection rolls back already scope-selected cleanup without redispatch',
  { timeout: 20000 },
  async (t) => {
    const e = await setup(t);
    const scope = await e.call('scope');
    const held = e.call('hold-owned');
    const rejected = assert.rejects(held, { code: 'FAILED_PRECONDITION' });
    await until(async () => (await e.call('started')) === 'true');
    await e.host.destroyScope(scope);
    assert.equal(await e.call('cleaned'), '1');
    assert.equal(await e.call('resume'), 'resumed');
    await rejected;
    const dispatched = cleanups(e);
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].endpoint.context.purpose, 'lifecycle');
    assert.equal(dispatched[0].parent, undefined);
    assert.ok(
      e.sent.some(
        (x) =>
          x.message.body.kind === 'control' &&
          x.message.body.value.kind === 'effect-released',
      ),
    );
    assert.equal(await e.call('cleaned'), '1');
    await dispose(e);
  },
);

for (const command of ['siblings', 'nested']) {
  test(
    `real simultaneous ${command} cleanup uses distinct authenticated descriptors`,
    { timeout: 20000 },
    async (t) => {
      const e = await setup(t);
      assert.equal(
        await e.call(command),
        '2:healthy',
        'barrier requires actual overlap, not serialization',
      );
      const dispatched = cleanups(e);
      assert.equal(dispatched.length, command === 'nested' ? 3 : 2);
      const [a, b, nested] = dispatched;
      assert.notEqual(a.endpoint, b.endpoint);
      assert.notEqual(a.endpoint.stream, b.endpoint.stream);
      assert.notEqual(a.endpoint.context.id, b.endpoint.context.id);
      assert.equal(a.parent, b.parent);
      assert.notEqual(a.parent, a.endpoint.context);
      assert.equal(a.endpoint.context.purpose, 'invoke');
      assert.equal(b.endpoint.context.purpose, 'invoke');
      if (nested) assert.equal(nested.parent, b.endpoint.context);
      const last = nested ?? b;
      const reentry = e.sent.find(
        (x) =>
          x.message.body.kind === 'invoke' &&
          x.parent === last.endpoint.context,
      );
      assert.ok(reentry, 'self-call inherits its actual cleanup descriptor');
      for (const d of dispatched) {
        assert.equal(d.live, true);
        assert.ok(d.endpoint.context.end <= d.parent.end);
        assert.equal(d.endpoint.context.terminal, 'complete');
        assert.ok(d.endpoint.stream.closed);
        const released = e.sent.find(
          (x) =>
            x.message.body.kind === 'control' &&
            x.message.body.value.kind === 'effect-released' &&
            x.message.body.value.effectId === d.message.body.effectId,
        );
        assert.ok(released);
        assert.ok(
          e.received.some(
            (x) =>
              x.endpoint === d.endpoint &&
              x.frame.body.kind === 'effect-cleaned' &&
              x.frame.body.effectId === d.message.body.effectId,
          ),
        );
        assert.equal(
          released.endpoint.context,
          d.parent,
          'release reply stays on the origin, cleanup reply on its own descriptor',
        );
      }
      await dispose(e);
    },
  );
}

test(
  'first-selected cleanup coalesces releases from another actual live endpoint',
  { timeout: 20000 },
  async (t) => {
    const e = await setup(t);
    const cleanup = e.call('cleanup-hold');
    await until(async () => (await e.call('cleanup-started')) === 'true');
    const held = e.call('hold');
    await until(async () => (await e.call('started')) === 'true');
    const d = cleanups(e)[0];
    const other = e.checks.at(-1).endpoint;
    const first = d.adapter.effects.release(other, d.message.body.effectId);
    const repeated = d.adapter.effects.release(other, d.message.body.effectId);
    assert.equal(first, repeated);
    assert.equal(await e.call('cleanup-go'), 'released');
    await Promise.all([first, repeated]);
    assert.equal(await cleanup, 'cleaned');
    assert.equal(cleanups(e).length, 1);
    assert.notEqual(
      d.parent,
      other.context,
      'a later releaser cannot retarget selected ancestry',
    );
    assert.equal(await e.call('resume'), 'resumed');
    assert.equal(await held, 'resumed');
    await dispose(e);
  },
);

test(
  'bounded cleanup capacity fails before descriptor dispatch and leaves no reservation',
  { timeout: 25000 },
  async (t) => {
    const e = await setup(t);
    assert.deepEqual(
      await Promise.all(Array.from({ length: 4 }, () => e.call('capacity'))),
      ['capacity', 'capacity', 'capacity', 'capacity'],
    );
    const dispatched = cleanups(e);
    assert.equal(
      dispatched.length,
      4,
      'inner exhausted cleanup must never be offered/dispatched',
    );
    const session = dispatched[0].adapter.session;
    await until(() => session.scheduler.usage.records === 0);
    assert.deepEqual(session.scheduler.usage, {
      ordinary: 0,
      nested: 0,
      lifecycle: 0,
      queued: 0,
      records: 0,
      offers: 0,
      failed: false,
    });
    assert.equal(await e.call('healthy'), 'healthy');
    await dispose(e, ['RESOURCE_EXHAUSTED']);
  },
);

for (const attack of ['duplicate-cleanup', 'wrong-dispatch-role']) {
  test(
    `real native worker rejects ${attack} on an already claimed cleanup descriptor`,
    { timeout: 20000 },
    async (t) => {
      const e = await setup(t);
      const pending = e.call('cleanup-hold');
      const rejected = assert.rejects(pending, { code: 'UNAVAILABLE' });
      await until(async () => (await e.call('cleanup-started')) === 'true');
      const d = cleanups(e)[0];
      // Deliberate broker-side fault injection through the actual NativeStream.
      // A new valid sequence must not permit a second dispatch or a role change.
      const body =
        attack === 'duplicate-cleanup'
          ? { ...d.message.body, wireId: d.message.body.wireId + 1 }
          : {
              kind: 'lifecycle',
              wireId: d.message.body.wireId + 1,
              action: 'quiesce',
              remainingMs: 500,
            };
      d.adapter.send(d.endpoint, { tag: 'request', body });
      await until(() => !d.adapter.session.active, 1000); // before 2000ms cleanup timeout
      await rejected;
      await e.host.dispose(e.provider);
      assert.equal(
        native.managed(),
        e.beforeFD,
        'faulted worker must be actually reaped',
      );
    },
  );
}

test(
  'cancelling an unanswered effect-release closes descendants and fails the shared session',
  { timeout: 20000 },
  async (t) => {
    const e = await setup(t);
    const controller = new AbortController();
    const pending = e.call('cleanup-hold', { signal: controller.signal });
    const rejected = assert.rejects(pending, { code: 'CANCELLED' });
    await until(async () => (await e.call('cleanup-started')) === 'true');
    const d = cleanups(e)[0];
    const release = e.received.find(
      (x) =>
        x.frame.body.kind === 'effect-release' &&
        x.frame.body.effectId === d.message.body.effectId,
    );
    assert.ok(
      release,
      'cancellation must interrupt an actual sent release RPC',
    );
    assert.equal(release.endpoint.context, d.parent);
    assert.ok(
      !e.sent.some(
        (x) =>
          x.endpoint === release.endpoint &&
          x.message.body.wireId === release.frame.body.wireId &&
          ['control', 'control-error'].includes(x.message.body.kind),
      ),
      'release outcome is still unanswered when cancelled',
    );
    // An unrelated live invocation is genuinely affected by the shared failure.
    const sibling = e.call('wait');
    const siblingRejected = assert.rejects(sibling, { code: 'UNAVAILABLE' });
    await until(async () => (await e.call('wait-started')) === 'true');
    controller.abort();
    await rejected;
    await until(() => d.endpoint.context.terminal !== undefined);
    assert.equal(d.endpoint.context.terminal, 'CANCELLED');
    assert.ok(d.endpoint.stream.closed);
    // SDKPending aborts the unanswered mutating RPC with unknown commit status.
    // Preserve fail-closed/no-replay policy: this is NOT per-invocation isolation.
    await until(() => !d.adapter.session.active, 1000);
    await siblingRejected;
    await assert.rejects(e.call('cleanup-go'), { code: 'UNAVAILABLE' });
    const report = await e.host.dispose(e.provider);
    assert.equal(report.restartRequired, true);
    assert.deepEqual(report.failedDisposers, ['CANCELLED']);
    assert.equal(native.managed(), e.beforeFD);
  },
);

test(
  'ordinary cancellation without an unanswered SDK mutation preserves unrelated work',
  { timeout: 20000 },
  async (t) => {
    const e = await setup(t);
    const controller = new AbortController();
    const pending = e.call('wait', { signal: controller.signal });
    const rejected = assert.rejects(pending, { code: 'CANCELLED' });
    await until(async () => (await e.call('wait-started')) === 'true');
    const invocation = e.sent.find(
      (x) =>
        x.message.body.kind === 'invoke' &&
        x.message.body.call.payload === 'wait',
    );
    assert.ok(invocation);
    assert.ok(
      !e.received.some(
        (x) => x.endpoint === invocation.endpoint && x.frame.tag === 'request',
      ),
      'ordinary handler issued no SDK mutation',
    );
    // Keep an independent endpoint live across cancellation, rather than merely
    // checking that a replacement call happens to succeed before the next pump.
    const held = e.call('hold');
    await until(async () => (await e.call('started')) === 'true');
    controller.abort();
    await rejected;
    await until(() => invocation.endpoint.context.terminal !== undefined);
    assert.equal(invocation.endpoint.context.terminal, 'CANCELLED');
    assert.equal(await e.call('healthy'), 'healthy');
    assert.equal(await e.call('resume'), 'resumed');
    assert.equal(await held, 'resumed');
    assert.equal(invocation.adapter.session.active, true);
    await dispose(e);
  },
);
