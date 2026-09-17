// Active minor-2 codec acceptance. Native/Host tests are separate exit gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonical } from '@alica/acap-contracts';
import { encodeFrame, decodeBody } from '../../packages/kernel/dist/g6/wire.js';
const examples = JSON.parse(
  readFileSync(new URL('../../docs/g6/draft/examples.json', import.meta.url)),
);
const frame = (body) => ({ ...structuredClone(examples.request), body });
function assertSafePrototypes(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(
    Object.getPrototypeOf(value),
    Array.isArray(value) ? Array.prototype : null,
  );
  for (const child of Object.values(value)) assertSafePrototypes(child);
}
for (const kind of ['log', 'scope-check']) {
  test(`minor2 closed scoped ${kind}: exact fields, integers, directions`, () => {
    const body = {
      kind,
      wireId: 2,
      scopeId: 'child1',
      scopeGeneration: 1,
      ...(kind === 'log'
        ? { record: { level: 'info', event: 'checkpoint' } }
        : {}),
    };
    const good = frame(body);
    const decoded = decodeBody(
      encodeFrame(good, 'workToBroker').subarray(4),
      'workToBroker',
    );
    // Hardened parse intentionally discards ordinary object prototypes.
    assertSafePrototypes(decoded);
    assert.equal(canonical(decoded), canonical(good));
    for (const key of Object.keys(body)) {
      const bad = structuredClone(good);
      delete bad.body[key];
      assert.throws(() => encodeFrame(bad, 'workToBroker'), {
        code: 'INVALID_ARGUMENT',
      });
    }
    for (const [key, value] of [
      ['scopeId', ''],
      ['scopeId', 'x'.repeat(129)],
      ['scopeGeneration', 0],
      ['scopeGeneration', 1.5],
      ['scopeGeneration', 9007199254740992],
      ['wireId', 0],
      ['parentId', 'c1'],
      ['caller', {}],
    ]) {
      assert.throws(
        () => encodeFrame(frame({ ...body, [key]: value }), 'workToBroker'),
        { code: 'INVALID_ARGUMENT' },
      );
    }
    for (const lane of [
      'workToProvider',
      'controlToBroker',
      'controlToProvider',
    ]) {
      const bad = structuredClone(good);
      if (lane.startsWith('control')) bad.contextId = 'control';
      assert.throws(() => encodeFrame(bad, lane), { code: 'INVALID_ARGUMENT' });
    }
  });
}
for (const tag of ['hello', 'accepted']) {
  test(`minor2 mandatory negotiation in ${tag}`, () => {
    const good = structuredClone(examples[tag]);
    const lane = tag === 'hello' ? 'controlToBroker' : 'controlToProvider';
    const field = tag === 'hello' ? 'requiredFeatures' : 'negotiatedFeatures';
    assert.equal(good.body.protocolMinor, 2);
    encodeFrame(good, lane);
    for (const feature of [
      'wire.contexts',
      'wire.sdkresults',
      'wire.scopedeffects',
      'wire.scopevalidation',
    ]) {
      assert.ok(good.body[field].includes(feature));
      const bad = structuredClone(good);
      bad.body[field] = bad.body[field].filter((x) => x !== feature);
      assert.throws(() => encodeFrame(bad, lane), { code: 'INVALID_ARGUMENT' });
    }
    for (const minor of [0, 1, 3]) {
      const bad = structuredClone(good);
      bad.body.protocolMinor = minor;
      assert.throws(() => encodeFrame(bad, lane), { code: 'INVALID_ARGUMENT' });
    }
  });
}
