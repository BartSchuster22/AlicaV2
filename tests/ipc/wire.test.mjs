// Private codec component tests. These do NOT authenticate a worker or qualify G6.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { canonical, schemas } from '@alica/acap-contracts';
import { lanes, validateFrame } from '../../packages/kernel/dist/g6/schema.js';
import { frameSchema } from '../../packages/kernel/dist/g6/wire-schema.js';
import {
  encodeFrame,
  decodeBody,
  encodeOffer,
  decodeOffer,
  FrameReader,
  WireBudget,
  EndpointFence,
  MAX_FRAME,
} from '../../packages/kernel/dist/g6/wire.js';
const examples = JSON.parse(
  readFileSync(new URL('../../docs/g6/draft/examples.json', import.meta.url)),
);
const offer = JSON.parse(
  readFileSync(
    new URL('../../docs/g6/draft/context-offer.example.json', import.meta.url),
  ),
);
const copy = structuredClone;
const error = (code) => (e) => e.code === code;
const zero = { bytes: 0, frames: 0, control: 0 };
const ajv = new Ajv2020({ strict: false, allErrors: false });
for (const schema of Object.values(schemas)) ajv.addSchema(schema);
ajv.addSchema(frameSchema);
const reference = new Map(
  lanes.map((lane) => [
    lane,
    ajv.compile({ $ref: frameSchema.$id + '#/$defs/' + lane }),
  ]),
);

for (const [tag, example] of Object.entries(examples)) {
  test('wire reference agreement and closed envelope/body: ' + tag, () => {
    const variants = [example];
    for (const where of ['envelope', 'body']) {
      const v = copy(example);
      (where === 'body' ? v.body : v).unexpectedAuthority = true;
      variants.push(v);
    }
    for (const key of Object.keys(example)) {
      const v = copy(example);
      delete v[key];
      variants.push(v);
    }
    for (const lane of lanes)
      for (const v of variants) {
        const expected = reference.get(lane)(v);
        if (expected) {
          validateFrame(v, lane);
          const bytes = encodeFrame(v, lane);
          assert.equal(bytes.readUInt32BE(), bytes.length - 4);
          assert.equal(
            canonical(decodeBody(bytes.subarray(4), lane)),
            canonical(v),
          );
        } else
          assert.throws(() => encodeFrame(v, lane), error('INVALID_ARGUMENT'));
      }
  });
}

test('wire malformed and noncanonical encodings are rejected', () => {
  const good = canonical(examples.ping);
  for (const text of [
    good + '\n',
    ' ' + good,
    good.replace('"generation":1', '"generation":1,"generation":1'),
    good.replace('"generation":1', '"generation":1.0'),
    good.replace('"generation":1', '"generation":1e0'),
    good.replace('"generation":1', '"generation":9007199254740992'),
  ]) {
    assert.notEqual(text, good);
    assert.throws(() => decodeBody(Buffer.from(text), 'controlToBroker'));
  }
  assert.throws(() => decodeBody(Buffer.from([0xff]), 'controlToBroker'));
  assert.throws(() => decodeBody(Buffer.alloc(0), 'controlToBroker'));
  assert.throws(() =>
    decodeBody(Buffer.alloc(MAX_FRAME + 1), 'controlToBroker'),
  );
});

test('wire rejects duplicate logical handshake vectors and obsolete feature spelling', () => {
  for (const tag of ['hello', 'accepted']) {
    const lane = tag === 'hello' ? 'controlToBroker' : 'controlToProvider';
    for (const field of ['contracts', 'events']) {
      const v = copy(examples[tag]);
      if (field === 'events' && v.body.events.length === 0) {
        v.body.events.push({
          eventType: 'demo.event',
          descriptorDigest: 'sha256:' + 'e'.repeat(64),
        });
      }
      assert.ok(v.body[field].length);
      const duplicate = copy(v.body[field][0]);
      duplicate.descriptorDigest = 'sha256:' + 'f'.repeat(64);
      v.body[field].push(duplicate);
      assert.throws(() => encodeFrame(v, lane));
    }
    const v = copy(examples[tag]);
    const field = tag === 'hello' ? 'requiredFeatures' : 'negotiatedFeatures';
    v.body[field] = v.body[field].map((x) =>
      x === 'wire.contexts' ? 'wire.context-channels' : x,
    );
    assert.throws(() => encodeFrame(v, lane));
  }
  const v = copy(examples.hello);
  v.body.optionalFeatures.push(v.body.requiredFeatures[0]);
  assert.throws(() => encodeFrame(v, 'controlToBroker'));
});

test('carrier codec accepts only an exact complete bounded canonical packet', () => {
  const encoded = encodeOffer(offer);
  assert.equal(canonical(decodeOffer(encoded)), canonical(offer));
  assert.ok(Object.isFrozen(decodeOffer(encoded)));
  for (const packet of [
    encoded.subarray(0, 3),
    encoded.subarray(0, -1),
    Buffer.concat([encoded, Buffer.from('x')]),
    Buffer.alloc(4097),
  ])
    assert.throws(() => decodeOffer(packet));
  for (const [key, value] of [
    ['descriptorCount', 2],
    ['fd', 6],
    ['parentWireId', 1],
    ['offerId', 'guess'],
    ['remainingMs', 0],
  ])
    assert.throws(() => encodeOffer({ ...offer, [key]: value }));
  for (const key of Object.keys(offer)) {
    const v = copy(offer);
    delete v[key];
    assert.throws(() => encodeOffer(v));
  }
});

test('pull reader supports every two-part body split and preserves lease ownership', () => {
  const packet = encodeFrame(examples.request, 'workToProvider');
  for (let split = 1; split < packet.length - 4; split++) {
    const budget = new WireBudget(),
      reader = new FrameReader(budget, 'workToProvider');
    for (const byte of packet.subarray(0, 4))
      assert.equal(reader.feed(Buffer.from([byte])), undefined);
    assert.deepEqual(budget.usage, {
      bytes: packet.length,
      frames: 1,
      control: 0,
    });
    assert.equal(reader.feed(packet.subarray(4, 4 + split)), undefined);
    const result = reader.feed(packet.subarray(4 + split));
    assert.equal(canonical(result.frame), canonical(examples.request));
    assert.ok(Object.isFrozen(result.frame.body));
    reader.close(); // Dispatcher owns completed frames, not the reader.
    assert.equal(budget.usage.frames, 1);
    result.release();
    result.release();
    assert.deepEqual(budget.usage, zero);
  }
});

test('reader closes and releases partial assemblies on all framing failures', () => {
  for (const length of [0, MAX_FRAME + 1, 0xffffffff]) {
    const budget = new WireBudget(),
      reader = new FrameReader(budget, 'workToProvider');
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(length);
    assert.throws(() => reader.feed(prefix), error('RESOURCE_EXHAUSTED'));
    assert.deepEqual(budget.usage, zero);
    assert.equal(reader.readSize, 0);
  }
  const budget = new WireBudget(),
    reader = new FrameReader(budget, 'workToProvider');
  assert.throws(() => reader.feed(Buffer.alloc(5)));
  assert.deepEqual(budget.usage, zero);
  const bad = new FrameReader(budget, 'workToProvider');
  bad.feed(Buffer.from([0, 0, 0, 1]));
  assert.throws(() => bad.feed(Buffer.from('!')));
  assert.deepEqual(budget.usage, zero);
});

test('partial deadline is monotonic and applies without new input', () => {
  let now = 0;
  for (const prefix of [Buffer.from([0]), Buffer.from([0, 0, 0, 20])]) {
    const budget = new WireBudget(),
      reader = new FrameReader(budget, 'workToProvider', () => now);
    reader.feed(prefix);
    now += 1999;
    reader.checkDeadline();
    now++;
    assert.throws(() => reader.checkDeadline(), error('DEADLINE_EXCEEDED'));
    assert.deepEqual(budget.usage, zero);
    assert.throws(() => reader.feed(Buffer.from('x')), error('UNAVAILABLE'));
  }
});

test('shared budget enforces frame/byte bounds and independent control reserve', () => {
  const budget = new WireBudget(),
    releases = [];
  for (let i = 0; i < 64; i++) releases.push(budget.reserve(1));
  assert.throws(() => budget.reserve(1), error('RESOURCE_EXHAUSTED'));
  const control = budget.reserve(65536, true);
  assert.throws(() => budget.reserve(1, true), error('RESOURCE_EXHAUSTED'));
  for (const release of releases) {
    release();
    release();
  }
  const bytes = budget.reserve(8388608);
  assert.throws(() => budget.reserve(1), error('RESOURCE_EXHAUSTED'));
  bytes();
  control();
  assert.deepEqual(budget.usage, zero);
  const full = budget.reserve(8388608 - 4);
  const reader = new FrameReader(budget, 'workToProvider');
  assert.throws(
    () => reader.feed(Buffer.from([0, 0, 0, 20])),
    error('RESOURCE_EXHAUSTED'),
  );
  assert.deepEqual(budget.usage, { bytes: 8388608 - 4, frames: 1, control: 0 });
  full();
  assert.deepEqual(budget.usage, zero);
});

test('endpoint fence rejects retargeting, replay, closed endpoint and sequence wrap', () => {
  const v = copy(examples.request);
  const fence = new EndpointFence(
    v.sessionId,
    v.generation,
    v.contextId,
    v.sequence,
  );
  for (const [key, value] of [
    ['sessionId', 'f'.repeat(64)],
    ['generation', v.generation + 1],
    ['contextId', 'other'],
    ['sequence', v.sequence + 1],
  ])
    assert.throws(
      () => fence.accept({ ...v, [key]: value }),
      error('UNAUTHENTICATED'),
    );
  fence.accept(v);
  assert.throws(() => fence.accept(v), error('UNAUTHENTICATED'));
  fence.accept({ ...v, sequence: v.sequence + 1 });
  fence.close();
  assert.throws(
    () => fence.accept({ ...v, sequence: v.sequence + 2 }),
    error('UNAUTHENTICATED'),
  );
  const last = new EndpointFence(
    v.sessionId,
    v.generation,
    v.contextId,
    Number.MAX_SAFE_INTEGER,
  );
  last.accept({ ...v, sequence: Number.MAX_SAFE_INTEGER });
  assert.throws(
    () => last.accept({ ...v, sequence: Number.MAX_SAFE_INTEGER }),
    error('UNAUTHENTICATED'),
  );
});
