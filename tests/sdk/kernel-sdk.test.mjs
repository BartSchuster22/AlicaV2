import test from 'node:test';
import assert from 'node:assert/strict';
import {
  environment,
  fixture,
  echo,
  requirement,
  eventDescriptor,
} from '../../tools/g3-fixtures.mjs';
const sdkProvider = `import {definePlugin} from '@alica/plugin-sdk';import {handlers} from './handlers.js';const descriptor=JSON.parse(${JSON.stringify(JSON.stringify({ schemaVersion: 'acap.capability/v1', ...echo }))});export const activate=definePlugin({activate(ctx){ctx.provide(descriptor,handlers)}}).activate;`;
const extraFiles = {
  'dist/handlers.js':
    'export const handlers={echo:async input=>({text:input.text})};',
};
test('real Kernel verifies and activates SDK-only signed relative module graph', async (t) => {
  const e = environment(t);
  const pkg = fixture(e.publisher, { code: sdkProvider, extraFiles });
  const provider = e.host.discover(pkg);
  pkg.files['dist/handlers.js'].fill(0);
  const caller = e.load({
    id: 'org.alica.sdkcaller',
    provides: [],
    requires: [requirement],
    code: "import {definePlugin} from '@alica/plugin-sdk';export const activate=definePlugin({activate(){}}).activate;",
  });
  e.grant(caller);
  await e.host.activate(caller);
  const h = await e.host.context(caller).require(requirement);
  assert.equal(
    (await h.call('echo', { text: 'SDK' }, { deadlineMs: Date.now() + 1000 }))
      .text,
    'SDK',
  );
  const report = await e.host.dispose(provider);
  assert.equal(report.restartRequired, false);
  await assert.rejects(
    h.call('echo', { text: 'closed' }, { deadlineMs: Date.now() + 1000 }),
    (x) => x.code === 'UNAVAILABLE',
  );
});
test('real Kernel rejects tampered dependent module before evaluation', (t) => {
  const e = environment(t),
    pkg = fixture(e.publisher, { code: sdkProvider, extraFiles });
  pkg.files['dist/handlers.js'] = Buffer.from(
    'globalThis.g5Tampered=true;export const handlers={};',
  );
  assert.throws(
    () => e.host.discover(pkg),
    (x) => x.code === 'CONTRACT_MISMATCH',
  );
  assert.equal(globalThis.g5Tampered, undefined);
});
for (const specifier of [
  '@alica/kernel',
  '@alica/testkit',
  'node:fs',
  '../../escape.js',
  './missing.js',
  '@alica/plugin-sdk/dist/index.js',
])
  test(`production linker rejects ${specifier} before evaluation`, async (t) => {
    const e = environment(t);
    const id = e.load({
      code: `import ${JSON.stringify(specifier)};globalThis.g5Unexpected=true;export async function activate(){}`,
    });
    await assert.rejects(
      e.host.activate(id),
      (x) => x.code === 'FAILED_PRECONDITION',
    );
    assert.equal(globalThis.g5Unexpected, undefined);
  });
test('real SDK optional cannot turn a denied capability into absence', async (t) => {
  const e = environment(t);
  const provider = e.load({ code: sdkProvider, extraFiles });
  await e.host.activate(provider);
  const id = e.load({
    id: 'org.alica.deniedsdk',
    provides: [],
    optionalRequires: [requirement],
    code: `import {definePlugin} from '@alica/plugin-sdk';export const activate=definePlugin({activate(ctx){globalThis.g5SdkContext=ctx}}).activate;`,
  });
  t.after(() => {
    delete globalThis.g5SdkContext;
  });
  await e.host.activate(id);
  await assert.rejects(
    globalThis.g5SdkContext.optional(requirement),
    (x) => x.code === 'PERMISSION_DENIED',
  );
});
