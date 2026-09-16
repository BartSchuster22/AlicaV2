import assert from 'node:assert/strict';
import { stack, consumerSuite, requirement } from './g3-fixtures.mjs';
const evidence = {
  schemaVersion: 'alica.g3-evidence/v1',
  kind: 'synthetic-local-execution',
  providers: [],
};
for (const provider of ['a', 'b']) {
  const e = await stack(undefined, [provider]);
  try {
    const consumerResults = await consumerSuite(e.handle);
    const resolution = e.host.explain(e.consumer, requirement);
    const active = e.host.inspect();
    await e.host.shutdown();
    const disposed = e.host.inspect();
    assert.equal(
      Object.values(disposed.resources).every((n) => n === 0),
      true,
    );
    assert.equal(disposed.unsettledWork, 0);
    assert.equal(disposed.scopes.length, 0);
    assert.equal(
      disposed.instances.every(
        (i) => i.state === 'DISPOSED' && !i.cleanup.restartRequired,
      ),
      true,
    );
    evidence.providers.push({
      provider,
      consumerResults,
      resolution,
      registry: active.registry,
      grants: active.grants,
      lifecycle: disposed.instances.map((i) => ({
        principal: i.principal,
        history: i.history,
        cleanup: i.cleanup,
      })),
      afterShutdown: {
        resources: disposed.resources,
        scopes: disposed.scopes,
        unsettledWork: disposed.unsettledWork,
      },
      audit: disposed.audit,
    });
  } finally {
    await e.stop();
  }
}
const serialized = JSON.stringify(evidence, null, 2);
assert.equal(serialized.includes('synthetic-local-value'), false);
console.log(serialized);
