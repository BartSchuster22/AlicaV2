// Exit-gate regressions: same signed source and assertions in both factories.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  environment,
  fixture,
  trustMaterial,
} from '../../tools/g3-fixtures.mjs';
const descriptor = {
  schemaVersion: 'acap.capability/v1',
  id: 'org.alica.scopeedge',
  version: '1.0.0',
  features: [],
  operations: [
    {
      name: 'run',
      kind: 'unary',
      input: { type: 'string', maxLength: 64 },
      output: { type: 'string', maxLength: 256 },
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
  const child = ctx.createScope();
  let release, started = false;
  ctx.provide(${JSON.stringify(descriptor)}, { run: async (command) => {
    if (command === 'scope') return child.scope;
    if (command === 'overlap') {
      let result = 'not-run';
      const first = ctx.effect(async register => {
        register(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
        throw new AcapError('CONFLICT');
      });
      const second = ctx.effect(async register => {
        register(async () => {
          await new Promise(resolve => setTimeout(resolve, 120));
          try {
            const own = await ctx.optional(${JSON.stringify(requirement)});
            result = await own.call('run', 'healthy', {deadlineMs:Date.now()+4000});
          } catch (error) { result = error.code; throw error; }
        });
        throw new AcapError('CONFLICT');
      });
      await Promise.allSettled([first, second]);
      return result;
    }
    if (command === 'log') { child.log({level:'info',event:'checkpoint'}); return child.scope; }
    if (command === 'acquire') return child.effect(async () => {
      started = true;
      return new Promise(resolve => { release = resolve; });
    });
    if (command === 'started') return String(started);
    if (command === 'release') { release('acquired'); return 'released'; }
    return 'healthy';
  }});
}
`;
async function factory(t, mode) {
  const e = environment(t, {
    activationMs: 5000,
    maxCallMs: 10000,
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
  const provider = e.host.discover(
    fixture(e.publisher, {
      id: 'org.alica.scopeprovider',
      provides: [descriptor],
      optionalRequires: [requirement],
      code: source,
      manifest: { execution: mode },
    }),
  );
  const client = e.load({
    id: 'org.alica.scopeclient',
    provides: [],
    requires: [requirement],
    code: 'export async function activate() {}',
  });
  e.grant(client, descriptor.id, ['run']);
  e.grant(provider, descriptor.id, ['run']);
  await e.host.activate(client);
  const bound = await e.host.context(client).require(requirement);
  const call = (command) =>
    bound.call('run', command, { deadlineMs: Date.now() + 8000 });
  return { ...e, provider, call };
}
for (const mode of ['inproc', 'ipc']) {
  test(
    `overlapping inline cleanup preserves sibling causality: ${mode}`,
    { timeout: 15000 },
    async (t) => {
      const e = await factory(t, mode);
      assert.equal(await e.call('overlap'), 'healthy');
      const report = await e.host.dispose(e.provider);
      assert.deepEqual(report.failedDisposers, []);
      assert.equal(report.restartRequired, false);
    },
  );
  test(
    `child-context log retains child scope: ${mode}`,
    { timeout: 15000 },
    async (t) => {
      const e = await factory(t, mode);
      const scope = await e.call('log');
      const records = e.host
        .drainAudit()
        .filter((x) => x.reason === 'PLUGIN_CHECKPOINT');
      assert.equal(records.length, 1);
      assert.equal(
        records[0].scope,
        scope,
        'log must not be silently attributed to its root invocation scope',
      );
      await e.host.destroyScope(scope);
      await assert.rejects(e.call('log'), { code: 'FAILED_PRECONDITION' });
    },
  );
  test(
    `zero-cleanup acquisition rechecks closed child scope: ${mode}`,
    { timeout: 15000 },
    async (t) => {
      const e = await factory(t, mode);
      const scope = await e.call('scope');
      const acquisition = e.call('acquire').then(
        (value) => ({ kind: 'success', value }),
        (error) => ({ kind: 'error', code: error.code }),
      );
      const until = Date.now() + 4000;
      while ((await e.call('started')) !== 'true') {
        assert.ok(Date.now() < until, 'acquisition must start');
        await new Promise(setImmediate);
      }
      await e.host.destroyScope(scope);
      assert.equal(await e.call('release'), 'released');
      assert.deepEqual(await acquisition, {
        kind: 'error',
        code: 'FAILED_PRECONDITION',
      });
      assert.equal(await e.call('healthy'), 'healthy');
    },
  );
}
