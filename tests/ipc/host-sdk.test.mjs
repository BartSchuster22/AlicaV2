// The exact same signed package source and consumer body run through both
// factories. IPC is Host's production PhysicalSession path, never a mock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  environment,
  fixture,
  trustMaterial,
  eventDescriptor,
} from '../../tools/g3-fixtures.mjs';
const descriptor = {
  schemaVersion: 'acap.capability/v1',
  id: 'org.alica.ipcsdk',
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
      input: { type: 'null' },
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
const proxyDescriptor = { ...descriptor, id: 'org.alica.ipcproxy' };
const proxyRequirement = { ...requirement, capabilityId: proxyDescriptor.id };
const absent = { ...requirement, capabilityId: 'org.alica.absent' };
const providerSource = `
import { AcapError } from '@alica/acap-contracts';
const descriptor = ${JSON.stringify(descriptor)};
const requirement = ${JSON.stringify(requirement)};
const absent = ${JSON.stringify(absent)};
export async function activate(ctx) {
  let held=0, release, cleaned=0, events=0, child, pulls=0, late='pending';
  const barrier=new Promise(resolve=>release=resolve);
  const off=ctx.on('${eventDescriptor.id}', async () => {
    const self=await ctx.optional(requirement);
    if(await self.call('run','leaf',{deadlineMs:Date.now()+4000}) !== 'leaf') throw Error('callback');
    events++;
  });
  ctx.log({level:'info',event:'checkpoint'});
  ctx.provide(descriptor, {
    run: async (text, op) => {
      if(text==='hold') { held++; if(held===4) release(); await barrier; return String(held); }
      if(text==='leaf') return 'leaf';
      if(text==='late') { setTimeout(async()=>{try{await ctx.secret('synthetic-test');late='BAD'}catch(error){late=error.code}},40); return 'armed'; }
      if(text==='late-state') return late;
      if(text==='reenter') { const self=await ctx.optional(requirement); return self.call('run','leaf',{deadlineMs:op.deadlineMs,signal:op.signal}); }
      if(text==='missing') return String(await ctx.optional(absent));
      if(text==='secret') return ctx.secret('synthetic-test');
      if(text==='event') return String((await ctx.emit('${eventDescriptor.id}','same-consumer')).admitted);
      if(text==='events') return String(events);
      if(text==='off') { await off(); await off(); return 'off'; }
      if(text==='rollback') {
        try { await ctx.effect(async register => { register(async()=>{cleaned++}); throw new AcapError('CONFLICT'); }); }
        catch(error) { if(error.code!=='CONFLICT') throw error; }
        return String(cleaned);
      }
      if(text==='child') {
        child=ctx.createScope();
        await child.effect(async register=>{register(async()=>{cleaned++}); return 'owned'});
        child.provide(descriptor,{run:async()=> 'child',items:async function*(){yield 'child'}});
        return child.scope;
      }
      if(text==='stale') { try { await child.secret('synthetic-test'); return 'BAD'; } catch(error) {return error.code;} }
      if(text==='cleaned') return String(cleaned);
      if(text==='pulls') return String(pulls);
      if(text==='wait') return new Promise((resolve,reject)=>op.signal.addEventListener('abort',()=>reject(new AcapError('CANCELLED')),{once:true}));
      if(text==='bad') return 7;
      throw new AcapError('NOT_FOUND');
    },
    items: async function*() { for(const value of ['a','b','c']) {pulls++; yield value;} },
  });
}
`;
const proxySource = `
const descriptor=${JSON.stringify(proxyDescriptor)};
const requirement=${JSON.stringify(requirement)};
export async function activate(ctx) {
  const bound=await ctx.require(requirement);
  ctx.provide(descriptor, {
    run: async (input,op)=>bound.call('run',input,{deadlineMs:op.deadlineMs,signal:op.signal}),
    items: (input,op)=>bound.stream('items',input,{deadlineMs:op.deadlineMs,signal:op.signal}),
  });
}
`;
function factory(t, mode) {
  const e = environment(t, {
    activationMs: 5000,
    cleanupMs: 1000,
    maxCallMs: 5000,
  });
  const material = trustMaterial(e.root, e.publisher, e.now(), {
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
  });
  e.host.updateTrust(material);
  const load = (options) =>
    e.host.discover(
      fixture(e.publisher, { ...options, manifest: { execution: mode } }),
    );
  const provider = load({
    id: 'org.alica.sdkprovider',
    provides: [descriptor],
    optionalRequires: [requirement, absent],
    events: [eventDescriptor],
    publish: true,
    subscribe: true,
    secretReferences: ['synthetic-test'],
    code: providerSource,
  });
  const proxy = load({
    id: 'org.alica.sdkproxy',
    provides: [proxyDescriptor],
    requires: [requirement],
    code: proxySource,
  });
  const client = e.load({
    id: 'org.alica.sdkclient',
    provides: [],
    requires: [proxyRequirement],
    code: 'export async function activate() {}',
  });
  e.grant(provider, descriptor.id, requirement.operations);
  e.grant(provider, absent.capabilityId, absent.operations);
  e.grant(provider, eventDescriptor.id, ['publish', 'subscribe'], {
    schemaVersion: 'acap.event-grant/v1',
    eventType: eventDescriptor.id,
  });
  const secret = e.grant(provider, 'synthetic-test', ['read'], {
    schemaVersion: 'acap.secret-grant/v1',
    secretRef: 'synthetic-test',
  });
  const outbound = e.grant(proxy, descriptor.id, requirement.operations);
  e.grant(client, proxyDescriptor.id, proxyRequirement.operations);
  return { ...e, provider, proxy, client, secret, outbound };
}
async function consumer(e) {
  await e.host.activate(e.client);
  const bound = await e.host.context(e.client).require(proxyRequirement);
  const call = (text, options = {}) =>
    bound.call('run', text, { deadlineMs: Date.now() + 4500, ...options });
  assert.equal(await call('leaf'), 'leaf');
  // Four simultaneously suspended calls must share one mutable provider state.
  assert.deepEqual(
    await Promise.all(Array.from({ length: 4 }, () => call('hold'))),
    ['4', '4', '4', '4'],
  );
  assert.equal(await call('reenter'), 'leaf');
  assert.equal(await call('missing'), 'null');
  assert.equal(await call('secret'), 'synthetic-local-value');
  assert.equal(await call('rollback'), '1');
  const child = await call('child');
  await Promise.all([e.host.destroyScope(child), e.host.destroyScope(child)]);
  assert.equal(await call('cleaned'), '2');
  assert.equal(await call('stale'), 'FAILED_PRECONDITION');
  assert.equal(await call('pulls'), '0');
  const source = bound.stream('items', null, { deadlineMs: Date.now() + 4500 });
  const values = [];
  for await (const value of source) values.push(value);
  assert.deepEqual(values, ['a', 'b', 'c']);
  assert.equal(await call('pulls'), '3');
  assert.equal(await call('event'), '1');
  const end = Date.now() + 4000;
  while ((await call('events')) !== '1') {
    assert.ok(Date.now() < end, 'event delivery/reentrant ACK must complete');
    await new Promise(setImmediate);
  }
  assert.equal(await call('off'), 'off');
  assert.equal(await call('event'), '0');
  await assert.rejects(call('bad'), { code: 'CONTRACT_MISMATCH' });
  e.host.revokeGrant(e.secret.grantId);
  await assert.rejects(call('secret'), { code: 'PERMISSION_DENIED' });
  const controller = new AbortController();
  const pending = call('wait', { signal: controller.signal });
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(pending, { code: 'CANCELLED' });
  assert.equal(await call('leaf'), 'leaf');
  e.host.revokeGrant(e.outbound.grantId);
  await assert.rejects(call('leaf'), { code: 'PERMISSION_DENIED' });
  const report = await e.host.dispose(e.provider);
  assert.equal(report.restartRequired, false);
  assert.deepEqual(report.failedDisposers, []);
}
for (const mode of ['inproc', 'ipc'])
  test(
    `unchanged public KernelContext consumer: ${mode} signed factory`,
    { timeout: 30000 },
    async (t) => {
      await consumer(factory(t, mode));
    },
  );

test('IPC execution requires explicit signed publisher execution-mode authorization', async (t) => {
  const e = environment(t);
  assert.throws(
    () =>
      e.host.discover(fixture(e.publisher, { manifest: { execution: 'ipc' } })),
    { code: 'PERMISSION_DENIED' },
  );
});

test(
  'real Host IPC rejects delayed continuations rather than opening replacement tasks',
  { timeout: 15000 },
  async (t) => {
    const e = factory(t, 'ipc');
    await e.host.activate(e.client);
    const bound = await e.host.context(e.client).require(proxyRequirement);
    const call = (x) => bound.call('run', x, { deadlineMs: Date.now() + 4500 });
    assert.equal(await call('late'), 'armed');
    const end = Date.now() + 4000;
    let state;
    do {
      state = await call('late-state');
      assert.ok(Date.now() < end);
      await new Promise(setImmediate);
    } while (state === 'pending');
    assert.ok(
      ['FAILED_PRECONDITION', 'DEADLINE_EXCEEDED'].includes(state),
      state,
    );
    assert.equal(await call('leaf'), 'leaf');
  },
);

test(
  'signed real Host IPC package cannot read operator files, write or spawn',
  { timeout: 15000 },
  async (t) => {
    const e = environment(t, { activationMs: 5000, maxCallMs: 5000 });
    const { writeFileSync } = await import('node:fs');
    const probe = e.dir + '/operator-secret';
    writeFileSync(probe, 'operator-only');
    e.host.updateTrust(
      trustMaterial(e.root, e.publisher, e.now(), {
        policy: {
          version: 2,
          publishers: [
            {
              id: 'org.alica.synthetic',
              keyIds: [e.publisher.id],
              executionModes: ['ipc', 'inproc'],
            },
          ],
        },
        revocation: { version: 2 },
      }),
    );
    const code = `export async function activate(ctx){ctx.provide(${JSON.stringify(descriptor)},{
    run:async()=>{
      const fs=process.getBuiltinModule('fs'),cp=process.getBuiltinModule('child_process'),result=[];
      for(const action of [()=>fs.readFileSync(${JSON.stringify(probe)}),()=>fs.writeFileSync(${JSON.stringify(probe + '.write')},'denied'),()=>cp.execFileSync('/bin/true')]){
        try{action();result.push('BAD')}catch(error){result.push(error.code)}
      }
      return JSON.stringify(result);
    },items:async function*(){}})}`;
    const provider = e.host.discover(
      fixture(e.publisher, {
        id: 'org.alica.hostile',
        provides: [descriptor],
        code,
        manifest: { execution: 'ipc' },
      }),
    );
    const client = e.load({
      id: 'org.alica.confinementclient',
      provides: [],
      requires: [requirement],
      code: 'export async function activate(){}',
    });
    e.grant(client, descriptor.id, requirement.operations);
    await e.host.activate(client);
    const bound = await e.host.context(client).require(requirement);
    const errors = JSON.parse(
      await bound.call('run', 'probe', { deadlineMs: Date.now() + 4500 }),
    );
    assert.equal(errors.length, 3);
    for (const code of errors)
      assert.ok(['EACCES', 'EPERM'].includes(code), code);
    assert.equal((await e.host.dispose(provider)).restartRequired, false);
  },
);
