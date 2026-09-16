import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonical, digest } from '@alica/kernel';
import { environment, echo, requirement } from '../../tools/g3-fixtures.mjs';
const vectors = JSON.parse(
  readFileSync('specs/vectors/canonical.json', 'utf8'),
).vectors;
for (const vector of vectors)
  test(`runtime matches frozen Python/OpenSSL vector ${vector.id}`, () => {
    assert.equal(
      Buffer.from(canonical(vector.value)).toString('hex'),
      vector.canonicalHex,
    );
    assert.equal(digest(vector.value), vector.digest);
  });
test('mandatory activation binding cannot silently switch after catalog changes', async (t) => {
  const e = environment(t);
  const p = e.load();
  const c = e.load({
    id: 'org.alica.consumer',
    provides: [],
    requires: [requirement],
    code: 'export async function activate(){}',
  });
  e.grant(c);
  await e.host.activate(c);
  const first = await e.host.context(c).require(requirement);
  const newer = structuredClone(echo);
  newer.version = '1.1.0';
  const p2 = e.load({
    id: 'org.alica.alternative',
    provides: [newer],
    code: `export async function activate(ctx){ctx.provide(${JSON.stringify(newer)},{echo:async()=>({text:'replacement'})})}`,
  });
  await e.host.activate(p2);
  const again = await e.host.context(c).require(requirement);
  assert.equal(again.descriptorDigest, first.descriptorDigest);
  assert.equal(
    (
      await again.call(
        'echo',
        { text: 'original' },
        { deadlineMs: e.now() + 1000 },
      )
    ).text,
    'original',
  );
  await e.host.dispose(p);
  assert.equal(
    e.host.inspect().instances.find((i) => i.id === c).state,
    'DISPOSED',
  );
});
test('plugin log admits only fixed safe metadata and quiesce is idempotent', async (t) => {
  const e = environment(t);
  const id = e.load({
    provides: [],
    code: 'export async function activate(){}',
  });
  await e.host.activate(id);
  const ctx = e.host.context(id);
  ctx.log({ level: 'info', event: 'checkpoint' });
  assert.throws(
    () => ctx.log({ level: 'info', event: 'synthetic-local-value' }),
    (e) => e.code === 'INVALID_ARGUMENT',
  );
  assert.equal(
    JSON.stringify(e.host.inspect()).includes('synthetic-local-value'),
    false,
  );
  assert.equal((await e.host.quiesce(id)).state, 'DISPOSED');
  assert.deepEqual(await e.host.quiesce(id), await e.host.dispose(id));
});
