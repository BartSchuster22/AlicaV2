// Identical package strings and consumer assertions for both production factories.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  environment,
  fixture,
  trustMaterial,
} from '../../tools/g3-fixtures.mjs';
const descriptor = (id) => ({
  schemaVersion: 'acap.capability/v1',
  id,
  version: '1.0.0',
  features: [],
  operations: [
    {
      name: 'run',
      kind: 'unary',
      input: { type: 'string', maxLength: 64 },
      output: { type: 'string', maxLength: 128 },
      idempotency: 'none',
    },
  ],
});
const a = descriptor('org.alica.matrixa'),
  b = descriptor('org.alica.matrixb');
const requirement = (d) => ({
  capabilityId: d.id,
  major: 1,
  minMinor: 0,
  operations: ['run'],
  features: [],
});
const ra = requirement(a),
  rb = requirement(b);
function source(own, other) {
  return `import {AcapError} from '@alica/acap-contracts';
  export async function activate(ctx) {
    let entered=0, cancelled=0, mutations=0;
    ctx.provide(${JSON.stringify(own)}, {run:async(command, op)=>{
      if(command==='counts') return entered+':'+cancelled+':'+mutations;
      if(command==='leaf') return 'leaf';
      if(command==='mutate') return String(++mutations);
      if(command==='deny') {const bound=await ctx.optional(${JSON.stringify(other)});return bound.call('run','leaf',{deadlineMs:op.deadlineMs,signal:op.signal})}
      if(command.startsWith('nest:')) {
        const n=Number(command.slice(5)); if(n===0)return 'leaf';
        const bound=await ctx.optional(${JSON.stringify(other)});
        return bound.call('run','nest:'+(n-1),{deadlineMs:op.deadlineMs,signal:op.signal});
      }
      if(command==='descendant') {
        const bound=await ctx.optional(${JSON.stringify(other)});
        return bound.call('run','wait',{deadlineMs:op.deadlineMs,signal:op.signal});
      }
      if(command==='wait') {
        entered++;
        return new Promise((resolve,reject)=>{
          const abort=()=>{cancelled++;reject(new AcapError('CANCELLED'))};
          if(op.signal.aborted)abort();else op.signal.addEventListener('abort',abort,{once:true});
        });
      }
      if(command==='slow') {await new Promise(resolve=>setTimeout(resolve,150));return 'slow'}
      throw new AcapError('NOT_FOUND');
    }})
  }`;
}
const sourceA = source(a, rb),
  sourceB = source(b, ra);
async function factory(t, mode) {
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
  const load = (id, provides, optionalRequires, code) =>
    e.host.discover(
      fixture(e.publisher, {
        id,
        provides,
        optionalRequires,
        code,
        manifest: { execution: mode },
      }),
    );
  const A = load('org.alica.matrixprovidera', [a], [rb], sourceA);
  const B = load('org.alica.matrixproviderb', [b], [ra], sourceB);
  const client = e.load({
    id: 'org.alica.matrixconsumer',
    provides: [],
    optionalRequires: [ra, rb],
    code: 'export async function activate(){}',
  });
  e.grant(client, a.id, ['run']);
  e.grant(client, b.id, ['run']);
  await e.host.activate(A);
  await e.host.activate(B);
  await e.host.activate(client);
  const ca = await e.host.context(client).optional(ra),
    cb = await e.host.context(client).optional(rb);
  return { ...e, A, B, ca, cb };
}
async function consumer(e) {
  const call = (bound, text, options = {}) =>
    bound.call('run', text, { deadlineMs: Date.now() + 4500, ...options });
  // The upstream consumer is granted B; A is not. Its outbound must be denied.
  await assert.rejects(call(e.ca, 'deny'), { code: 'PERMISSION_DENIED' });
  const grantA = e.grant(e.A, b.id, ['run']);
  e.grant(e.B, a.id, ['run']);
  assert.equal(await call(e.ca, 'nest:2'), 'leaf', 'actual A -> B -> A');
  assert.equal(
    await call(e.ca, 'nest:4'),
    'leaf',
    'deeper real repeated provider visits',
  );
  await assert.rejects(call(e.ca, 'nest:24'), { code: 'RESOURCE_EXHAUSTED' });
  assert.equal(
    await call(e.cb, 'leaf'),
    'leaf',
    'depth exhaustion does not poison unrelated calls',
  );
  const controller = new AbortController();
  const parent = call(e.ca, 'descendant', { signal: controller.signal });
  const rejected = assert.rejects(parent, { code: 'CANCELLED' });
  const end = Date.now() + 4000;
  while ((await call(e.cb, 'counts')).split(':')[0] === '0') {
    assert.ok(Date.now() < end);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const healthy = call(e.cb, 'slow');
  controller.abort();
  await rejected;
  assert.equal(
    await healthy,
    'slow',
    'unrelated live context survives ancestor cancellation',
  );
  while ((await call(e.cb, 'counts')).split(':')[1] === '0') {
    assert.ok(Date.now() < end);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const expired = assert.rejects(
    call(e.ca, 'descendant', { deadlineMs: Date.now() + 80 }),
    { code: 'DEADLINE_EXCEEDED' },
  );
  assert.equal(
    await call(e.cb, 'slow'),
    'slow',
    'unrelated live context survives sibling deadline',
  );
  await expired;
  // A deadline may expire before downstream admission. Observe the actual
  // baseline instead of assuming the expired invocation entered provider B.
  const beforeRevocation = Number((await call(e.cb, 'counts')).split(':')[0]);
  const pending = call(e.ca, 'descendant');
  const revoked = assert.rejects(pending, { code: 'PERMISSION_DENIED' });
  const revocationEnd = Date.now() + 4000;
  while (
    Number((await call(e.cb, 'counts')).split(':')[0]) <= beforeRevocation
  ) {
    assert.ok(Date.now() < revocationEnd);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const independent = call(e.cb, 'slow');
  e.host.revokeGrant(grantA.grantId);
  await revoked;
  assert.equal(
    await independent,
    'slow',
    'unrelated live context survives sibling grant revocation',
  );
  assert.equal(await call(e.ca, 'mutate'), '1');
  await e.host.dispose(e.A);
  await assert.rejects(call(e.ca, 'mutate'), { code: 'UNAVAILABLE' });
  assert.equal(
    await call(e.cb, 'leaf'),
    'leaf',
    'optional provider loss does not quiesce independent consumer',
  );
}
for (const mode of ['inproc', 'ipc'])
  test(
    `same-source matrix consumer ${mode}: ancestry, authority and live sibling independence`,
    { timeout: 30000 },
    async (t) => {
      t.diagnostic(
        JSON.stringify({
          consumerSHA256: createHash('sha256')
            .update(consumer.toString())
            .digest('hex'),
          providerASHA256: createHash('sha256').update(sourceA).digest('hex'),
          providerBSHA256: createHash('sha256').update(sourceB).digest('hex'),
        }),
      );
      await consumer(await factory(t, mode));
    },
  );
