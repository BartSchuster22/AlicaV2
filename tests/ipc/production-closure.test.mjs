// Same signed provider source and consumer assertions in both production factories.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  environment,
  fixture,
  trustMaterial,
  eventDescriptor,
} from '../../tools/g3-fixtures.mjs';
const descriptor = {
  schemaVersion: 'acap.capability/v1',
  id: 'org.alica.closure',
  version: '1.0.0',
  features: [],
  operations: [
    {
      name: 'run',
      kind: 'unary',
      input: { type: 'string', maxLength: 128 },
      output: { type: 'string', maxLength: 4096 },
      idempotency: 'none',
    },
    {
      name: 'items',
      kind: 'stream',
      input: { type: 'string', maxLength: 128 },
      output: { type: 'string', maxLength: 128 },
      idempotency: 'none',
    },
  ],
};
const requirement = {
  capabilityId: descriptor.id,
  major: 1,
  minMinor: 0,
  operations: ['run', 'items'],
  features: [],
};
const source = `import {AcapError} from '@alica/acap-contracts';
export async function activate(ctx) {
  let pulls=0, closed=0, events=0, active=0, peak=0, cleaned=0, entered=false, releaseAcquire;
  const child=ctx.createScope();
  const eventChild=ctx.createScope();
  let releaseEvents; const eventGate=new Promise(resolve=>releaseEvents=resolve);
  const handler=async event=>{events++;active++;peak=Math.max(peak,active);try{await eventGate}finally{active--}};
  const rootStop=ctx.on('${eventDescriptor.id}',handler);
  ctx.provide(${JSON.stringify(descriptor)}, {
    run:async(command, op)=>{
      if(command==='metadata')return JSON.stringify({caller:op.caller,requestId:op.requestId,deadlineMs:op.deadlineMs});
      if(command==='stats')return JSON.stringify({pulls,closed,events,active,peak,cleaned,entered});
      if(command==='scope')return child.scope;
      if(command==='event-scope')return eventChild.scope;
      if(command==='child-subscribe'){await rootStop();eventChild.on('${eventDescriptor.id}',handler);return 'ready'}
      if(command==='emit')return String((await ctx.emit('${eventDescriptor.id}','synthetic-event')).admitted);
      if(command==='acquire')return child.effect(async register=>{register(async()=>{cleaned++});entered=true;return new Promise(resolve=>releaseAcquire=resolve)});
      if(command==='release-acquire'){releaseAcquire('acquired');return 'released'}
      if(command==='acquire-timeout')return child.effect(async register=>{register(async()=>{cleaned++});await new Promise(resolve=>setTimeout(resolve,1500));return 'late'});
      if(command==='release-events'){releaseEvents();return 'released'}
      if(command==='flood'){let admitted=0;for(let n=0;n<20;n++)admitted+=(await ctx.emit('${eventDescriptor.id}','synthetic-event')).admitted;return String(admitted)}
      return 'healthy';
    },
    items:async function*(mode, op){try{
      if(mode==='stall')await new Promise((resolve,reject)=>{const stop=()=>reject(new AcapError('CANCELLED'));if(op.signal.aborted)stop();else op.signal.addEventListener('abort',stop,{once:true})});
      if(mode==='bad'){yield 7;return}
      for(let n=0;n<24;n++){pulls++;yield String(n)}
    }finally{closed++}},
  });
}`;
async function factory(t, mode) {
  const e = environment(t, {
    activationMs: 1000,
    maxCallMs: 5000,
    cleanupMs: 1000,
    eventQueue: 4,
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
      id: 'org.alica.closureprovider',
      provides: [descriptor],
      events: [eventDescriptor],
      publish: true,
      subscribe: true,
      optionalRequires: [requirement],
      code: source,
      manifest: { execution: mode },
    }),
  );
  const client = e.load({
    id: 'org.alica.closureclient',
    provides: [],
    optionalRequires: [requirement],
    code: 'export async function activate(){}',
  });
  const grant = e.grant(client, descriptor.id, ['run', 'items']);
  e.grant(provider, descriptor.id, ['run', 'items']);
  const eventGrant = e.grant(
    provider,
    eventDescriptor.id,
    ['publish', 'subscribe'],
    {
      schemaVersion: 'acap.event-grant/v1',
      eventType: eventDescriptor.id,
    },
  );
  await e.host.activate(provider);
  await e.host.activate(client);
  const bound = await e.host.context(client).optional(requirement);
  const monitor = await e.host.context(provider).optional(requirement);
  const call = (command) =>
    monitor.call('run', command, { deadlineMs: Date.now() + 4000 });
  return {
    ...e,
    provider,
    client,
    bound,
    grant,
    eventGrant,
    issueTestGrant: e.grant,
    call,
    stats: async () => JSON.parse(await call('stats')),
  };
}
async function until(check) {
  const end = performance.now() + 3000;
  while (!(await check())) {
    assert.ok(performance.now() < end);
    await new Promise((r) => setTimeout(r, 5));
  }
}
async function streamConsumer(e) {
  const deadlineMs = Date.now() + 4000;
  const metadata = JSON.parse(
    await e.bound.call('run', 'metadata', { deadlineMs }),
  );
  assert.equal(metadata.caller.instanceId, e.client);
  assert.equal(metadata.caller.principal, 'org.alica.closureclient');
  assert.equal(metadata.caller.scope, 'root');
  assert.match(metadata.requestId, /^[0-9a-f-]{36}$/);
  assert.ok(
    metadata.deadlineMs <= deadlineMs && metadata.deadlineMs > Date.now(),
  );
  const stream = e.bound
    .stream('items', 'normal', { deadlineMs: Date.now() + 4000 })
    [Symbol.asyncIterator]();
  assert.deepEqual(await stream.next(), { done: false, value: '0' });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(
    (await e.stats()).pulls <= 6,
    'production credit/prefetch stays bounded while consumer stops',
  );
  e.host.revokeGrant(e.grant.grantId);
  await assert.rejects(stream.next(), { code: 'PERMISSION_DENIED' });
  // The unchanged ContractSession channel reports its first terminal once,
  // then permanently ends; it must never release buffered values afterward.
  assert.deepEqual(await stream.next(), { done: true, value: undefined });
  assert.deepEqual(await stream.next(), { done: true, value: undefined });
  assert.equal(await e.call('healthy'), 'healthy');
}
async function bufferedEventConsumer(e, invalidation) {
  if (invalidation === 'scope') {
    const scope = await e.call('event-scope');
    e.issueTestGrant(e.provider, eventDescriptor.id, ['subscribe'], {
      schemaVersion: 'acap.event-grant/v1',
      eventType: eventDescriptor.id,
      scope,
      scopeGeneration: 1,
      expiresAtMs: e.eventGrant.expiresAtMs,
    });
    assert.equal(await e.call('child-subscribe'), 'ready');
  }
  assert.equal(await e.call('emit'), '1');
  await until(async () => (await e.stats()).active === 1);
  assert.equal(await e.call('emit'), '1');
  assert.equal(
    (await e.stats()).events,
    1,
    'second event is buffered, not delivered',
  );
  let closing;
  if (invalidation === 'grant') e.host.revokeGrant(e.eventGrant.grantId);
  else closing = e.host.destroyScope(await e.call('event-scope'));
  assert.equal(await e.call('release-events'), 'released');
  await closing;
  await until(async () => (await e.stats()).active === 0);
  assert.equal(
    (await e.stats()).events,
    1,
    'invalidated buffered event never reaches the handler',
  );
  if (invalidation === 'grant')
    await assert.rejects(e.call('emit'), { code: 'PERMISSION_DENIED' });
  else
    assert.equal(
      await e.call('emit'),
      '0',
      'closed subscription cannot be revived',
    );
  assert.equal((await e.stats()).events, 1);
  assert.equal(await e.call('healthy'), 'healthy');
}
for (const mode of ['inproc', 'ipc']) {
  for (const invalidation of ['grant', 'scope']) {
    test(
      `buffered event ${invalidation} invalidation preserves healthy siblings: ${mode}`,
      { timeout: 15000 },
      async (t) => {
        await bufferedEventConsumer(await factory(t, mode), invalidation);
      },
    );
  }
}

async function overloadConsumer(e) {
  const admitted = Number(await e.call('flood'));
  assert.ok(
    admitted > 0 && admitted <= 5,
    'one active callback plus four queued events',
  );
  const stats = await e.stats();
  assert.equal(stats.peak, 1);
  assert.equal(stats.active, 1);
  assert.equal(stats.events, 1);
  assert.equal(await e.call('release-events'), 'released');
  await until(async () => (await e.stats()).active === 0);
  assert.equal(
    (await e.stats()).events,
    1,
    'overload drops queued callbacks, not unbounded detached work',
  );
}
for (const mode of ['inproc', 'ipc']) {
  test(
    `production streams metadata credit and buffered grant revocation: ${mode}`,
    { timeout: 15000 },
    async (t) => {
      const e = await factory(t, mode);
      await streamConsumer(e);
      t.diagnostic(
        'sameSourceSHA256=' +
          createHash('sha256')
            .update(source + streamConsumer.toString())
            .digest('hex'),
      );
    },
  );
  test(
    `production stream stall and schema error retain first terminal: ${mode}`,
    { timeout: 15000 },
    async (t) => {
      const e = await factory(t, mode);
      const stalled = e.bound
        .stream('items', 'stall', { deadlineMs: Date.now() + 150 })
        [Symbol.asyncIterator]();
      await assert.rejects(stalled.next(), { code: 'DEADLINE_EXCEEDED' });
      assert.deepEqual(await stalled.next(), { done: true, value: undefined });
      assert.deepEqual(await stalled.next(), { done: true, value: undefined });
      const bad = e.bound
        .stream('items', 'bad', { deadlineMs: Date.now() + 3000 })
        [Symbol.asyncIterator]();
      await assert.rejects(bad.next(), { code: 'CONTRACT_MISMATCH' });
      assert.equal(await e.call('healthy'), 'healthy');
    },
  );
  test(
    `production overload bounds active and queued callbacks: ${mode}`,
    { timeout: 15000 },
    async (t) => {
      const e = await factory(t, mode);
      await overloadConsumer(e);
      t.diagnostic(
        'sameSourceSHA256=' +
          createHash('sha256')
            .update(source + overloadConsumer.toString())
            .digest('hex'),
      );
    },
  );
  test(
    `registered acquisition rollback races scope closure without duplicate cleanup: ${mode}`,
    { timeout: 15000 },
    async (t) => {
      const e = await factory(t, mode);
      const scope = await e.call('scope');
      const acquisition = e.call('acquire');
      const rejected = assert.rejects(acquisition, {
        code: 'FAILED_PRECONDITION',
      });
      await until(async () => (await e.stats()).entered);
      await Promise.all([
        e.host.destroyScope(scope),
        e.host.destroyScope(scope),
      ]);
      await e.call('release-acquire');
      await rejected;
      assert.equal((await e.stats()).cleaned, 1);
      await assert.rejects(e.call('acquire'), { code: 'FAILED_PRECONDITION' });
    },
  );
  test(
    `registered acquisition timeout rolls back exactly once: ${mode}`,
    { timeout: 15000 },
    async (t) => {
      const e = await factory(t, mode);
      await assert.rejects(e.call('acquire-timeout'), {
        code: 'DEADLINE_EXCEEDED',
      });
      await new Promise((r) => setTimeout(r, 600));
      assert.equal((await e.stats()).cleaned, 1);
      assert.equal(await e.call('healthy'), 'healthy');
    },
  );
}
