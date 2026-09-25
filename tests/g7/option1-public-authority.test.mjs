import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { bootstrap, canonical } from '@alica/kernel';
import {
  fixture,
  config,
  keyPair,
  trustMaterial,
  echo,
  requirement,
} from '../../tools/g3-fixtures.mjs';

const code = `export async function activate(ctx) {
  let calls = 0;
  ctx.provide(${JSON.stringify(echo)}, {echo: async input => {
    calls++;
    return {text: String(calls) + ':' + input.text};
  }});
}`;
const denied = (code) => (error) => error.code === code;
async function setup(t) {
  // Deterministic injected clock isolates authority mutation from the normal
  // monotonic clock-floor writes. This is NOT a real-time expiry test.
  const epoch = Date.now();
  const now = () => epoch;
  const dir = mkdtempSync(join(tmpdir(), 'g7-option1-'));
  const root = keyPair();
  const publisher = keyPair();
  const options = {
    trust: trustMaterial(root, publisher, epoch),
    statePath: join(dir, 'trust-state.json'),
    initialize: true,
    now,
  };
  const host = bootstrap(canonical(config), options);
  t.after(async () => {
    await host.shutdown();
    rmSync(dir, { recursive: true, force: true });
  });
  const e = {
    host,
    options,
    now,
    load: (input) => host.discover(fixture(publisher, input)),
    grant: (id, capabilityId = echo.id, operations = ['echo'], extra = {}) => {
      const record = {
        schemaVersion: 'acap.grant/v1',
        grantId: randomUUID(),
        ...host.identity(id),
        capabilityId,
        operations,
        issuedAtMs: epoch - 1,
        expiresAtMs: epoch + 30000,
        revision: 0,
        ...extra,
      };
      host.issueGrant(record);
      return record;
    },
  };
  const provider = e.load({ code });
  const consumer = e.load({
    id: 'org.alica.client',
    provides: [],
    optionalRequires: [requirement],
    code: 'export async function activate() {}',
  });
  const publicGrant = e.grant(consumer);
  await e.host.activate(provider);
  await e.host.activate(consumer);
  const handle = await e.host.context(consumer).optional(requirement);
  return { ...e, provider, consumer, publicGrant, handle };
}
const call = (e, handle, text) =>
  handle.call('echo', { text }, { deadlineMs: e.now() + 1000 });
function protectedState(e) {
  return {
    persisted: readFileSync(e.options.statePath, 'utf8'),
    resources: { ...e.host.inspect().resources },
    instances: e.host.inspect().instances,
    scopes: e.host.inspect().scopes,
    grants: e.host.inspect().grants,
    registry: e.host.inspect().registry,
  };
}

test('Option1 stale public grant record rejected by fresh Kernel without execution or protected mutation', async (t) => {
  const old = await setup(t);
  assert.equal(
    (await call(old, old.handle, 'old-control')).text,
    '1:old-control',
  );
  const staleRecord = structuredClone(old.publicGrant);
  await old.host.shutdown();
  const fresh = await setup(t);
  assert.notEqual(old.consumer, fresh.consumer);
  assert.notDeepEqual(
    old.host.identity(old.consumer),
    fresh.host.identity(fresh.consumer),
  );
  assert.equal((await call(fresh, fresh.handle, 'before')).text, '1:before');
  const before = protectedState(fresh);
  assert.throws(() => fresh.host.issueGrant(staleRecord), denied('NOT_FOUND'));
  assert.deepEqual(protectedState(fresh), before);
  assert.equal((await call(fresh, fresh.handle, 'after')).text, '2:after');
  const retiredBefore = protectedState(old);
  const freshBeforeRetiredCall = protectedState(fresh);
  // ContractSession.prepare rejects a closed session/provider with UNAVAILABLE
  // before authorization or dispatch (packages/acap-contracts/src/runtime.ts).
  // Scope retirement with a live provider is a separate FAILED_PRECONDITION case.
  await assert.rejects(call(old, old.handle, 'stale'), denied('UNAVAILABLE'));
  assert.deepEqual(protectedState(old), retiredBefore);
  assert.deepEqual(protectedState(fresh), freshBeforeRetiredCall);
  assert.equal(
    (await call(fresh, fresh.handle, 'still-fresh')).text,
    '3:still-fresh',
  );
});

test('Option1 revoked public grant cannot be reissued and retained handle stays invalid with fresh authority', async (t) => {
  const e = await setup(t);
  assert.equal((await call(e, e.handle, 'before')).text, '1:before');
  e.host.revokeGrant(e.publicGrant.grantId);
  e.grant(e.consumer);
  const fresh = await e.host.context(e.consumer).optional(requirement);
  assert.equal((await call(e, fresh, 'fresh')).text, '2:fresh');
  const before = protectedState(e);
  assert.throws(() => e.host.issueGrant(e.publicGrant), denied('CONFLICT'));
  await assert.rejects(call(e, e.handle, 'stale'), denied('PERMISSION_DENIED'));
  assert.deepEqual(protectedState(e), before);
  assert.equal((await call(e, fresh, 'after')).text, '3:after');
});

test('Option1 retired scope handle stays invalid after same scope name is recreated', async (t) => {
  const e = await setup(t);
  const child = e.host.context(e.consumer).createScope();
  const staleRecord = e.grant(e.consumer, echo.id, ['echo'], {
    scope: child.scope,
    scopeGeneration: child.scopeGeneration,
    expiresAtMs: e.publicGrant.expiresAtMs,
  });
  const stale = await child.optional(requirement);
  assert.equal((await call(e, stale, 'before')).text, '1:before');
  await e.host.destroyScope(child.scope);
  const recreated = e.host.createScope('root', undefined, child.scope);
  assert.equal(recreated, child.scope);
  assert.equal(
    e.host.inspect().scopes.find((s) => s.id === recreated).generation,
    child.scopeGeneration + 1,
  );
  assert.equal((await call(e, e.handle, 'fresh')).text, '2:fresh');
  const before = protectedState(e);
  assert.throws(() => e.host.issueGrant(staleRecord), denied('CONFLICT'));
  await assert.rejects(call(e, stale, 'stale'), denied('FAILED_PRECONDITION'));
  assert.deepEqual(protectedState(e), before);
  assert.equal((await call(e, e.handle, 'after')).text, '3:after');
});
