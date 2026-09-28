import test from 'node:test';
import assert from 'node:assert/strict';
import { requestBody, responseBody, modelBody } from '../../providers/typesafe-jev/mapping.mjs';
import { parseWire, wireDecimal, wireInteger } from '../../providers/typesafe-jev/wire.mjs';
const doc = x => ({ json: JSON.stringify(x) });
const request = { state: doc({ text: 'Fresh blue tile', weight: { $decisionDecimal: '0.123456789012345678' }, literal: '0.123456789012345678' }), questions: [
  { name: 'yes', kind: 'boolean', instructions: doc({ text: 'Is the tile blue?' }) },
  { name: 'color', kind: 'choice', instructions: doc({ text: 'Pick color' }), options: [{ id: 'blue', description: doc({ text: 'Blue' }) },{ id: 'red', description: doc({ text: 'Red' }) }] },
  { name: 'rating', kind: 'score', instructions: doc({ text: 'Rate color' }), levels: [{ id: 'low', value: '0', description: doc({ text: 'Low', threshold: { $decisionDecimal: '0.125' } }) },{ id: 'high', value: '1', description: doc({ text: 'High' }) }] },
] };
const fixture = () => ({ model: 'fixture-resolved', answers: {
  yes: { type: 'noul', noul: 0.734928 },
  color: { type: 'choice', choice: 'blue', confidence: 0.9, probabilities: { blue: 0.8, red: 0.2 } },
  rating: { type: 'score', score: 0.75, confidence: 0.8, probabilities: { '0': 0.25, '1': 0.75 }, legend: { '0': { text: 'Low', threshold: 0.125 }, '1': { text: 'High' } } },
}, usage: { input_tokens: 123, output_tokens: 17 } });
const rejected = text => assert.throws(() => responseBody(request, text), { code: 'CONTRACT_MISMATCH' });
test('J8 public request mapping: shared state, mixed named questions, exact fractional documents', () => {
  const body = requestBody(request, 'fixture-alias');
  assert(body.includes('"weight":0.123456789012345678'));
  assert(body.includes('"literal":"0.123456789012345678"'));
  const p = JSON.parse(body);
  assert.equal(p.questions.yes.type, 'noul');
  assert.deepEqual(Object.keys(p.questions.color.criteria), ['blue','red']);
  assert.equal(p.questions.rating.criteria.length, 2);
  assert.equal(p.model, 'fixture-alias');
  const bad = structuredClone(request); bad.questions[2].levels[1].value = '2.625';
  assert.throws(() => requestBody(bad, 'fixture-alias'), { code: 'INVALID_ARGUMENT' });
});
test('J9/J10/J11/J12/J17 documented response fields preserved across mixed batch', () => {
  const r = responseBody(request, JSON.stringify(fixture()));
  assert.equal(r.answers[0].probability, '0.734928');
  assert.equal(r.answers[1].selected, 'blue'); assert.equal(r.answers[1].confidence, '0.9');
  assert.deepEqual(r.answers[1].distribution, [{ id: 'blue', probability: '0.8' },{ id: 'red', probability: '0.2' }]);
  assert.equal(r.answers[2].expectedScore, '0.75'); assert.deepEqual(r.answers[2].legend, request.questions[2].levels);
  assert.deepEqual(r.usage, { inputTokens: 123, outputTokens: 17 });
  assert.equal(r.model, 'fixture-resolved');
  assert.equal(responseBody(request, JSON.stringify(fixture()).replace('0.734928','7.34928e-1')).answers[0].probability, '0.734928');
});
test('J21 numeric strings and literal reserved marker objects cannot masquerade as wire numbers', () => {
  for (const value of ['0.734928', { $decisionDecimal: '0.734928' }, null, true]) {
    const f = fixture(); f.answers.yes.noul = value; rejected(JSON.stringify(f));
  }
  for (const field of ['score','confidence']) { const f = fixture(); f.answers.rating[field] = '0.75'; rejected(JSON.stringify(f)); }
  const f = fixture(); f.answers.color.probabilities.blue = { $decisionDecimal: '0.8' }; rejected(JSON.stringify(f));
  const u = fixture(); u.usage.input_tokens = '123'; rejected(JSON.stringify(u));
  const l = fixture(); l.answers.rating.legend['0'].threshold = { $decisionDecimal: '0.125' }; rejected(JSON.stringify(l));
});
test('J21 duplicate question/candidate/escaped keys and malformed tokens rejected before overwrite', () => {
  const text = JSON.stringify(fixture());
  rejected(text.replace('"noul":0.734928', '"noul":0.734928,"noul":0.5'));
  rejected(text.replace('"blue":0.8', '"blue":0.8,"bl\\u0075e":0.8'));
  rejected(text.replace('"yes":{', '"yes":{},"yes":{'));
  for (const s of ['{"x":01}','{"x":NaN}','{"x":1e-19}','{"x":1e999}','{"x":1,}','{"x":1} trailing']) assert.throws(() => parseWire(s), { code: 'CONTRACT_MISMATCH' });
  assert.equal(wireDecimal(parseWire('0.123456789012345678')), '0.123456789012345678');
  assert.equal(wireInteger(parseWire('123')), 123);
  assert.throws(() => wireInteger(parseWire('9007199254740992')));
});
test('J10/J11/J12 exact names/types/candidates/levels/legend and rational probability defenses', () => {
  const mutations = [f => delete f.answers.yes, f => f.answers.extra = f.answers.yes,
    f => f.answers.yes.type = 'choice', f => f.answers.yes.noul = 1.01,
    f => f.answers.color.choice = 'red', f => f.answers.color.confidence = -0.1,
    f => f.answers.color.probabilities.green = 0, f => delete f.answers.color.probabilities.red,
    f => f.answers.color.probabilities.blue = 0.7, f => f.answers.rating.score = 0.5,
    f => f.answers.rating.probabilities['2'] = 0, f => f.answers.rating.legend['0'].text = 'altered',
    f => f.usage.output_tokens = -1, f => f.model = 'unsupported/slash'];
  for (const edit of mutations) { const f = fixture(); edit(f); rejected(JSON.stringify(f)); }
  const f = fixture(); f.answers.color.probabilities.blue = 0.799999;
  assert.equal(responseBody(request, JSON.stringify(f)).answers[1].distribution[0].probability, '0.799999');
});
test('J13 model discovery maps public schema, not hard-coded aliases; malformed/duplicate IDs fail', () => {
  const m = { models: [{ name: 'new-model-2026', description: 'Fixture model', release_date: '2026-09-15' }] };
  assert.deepEqual(modelBody(JSON.stringify(m)), [{ id: 'new-model-2026', description: 'Fixture model', releaseDate: '2026-09-15' }]);
  m.models.push(m.models[0]); assert.throws(() => modelBody(JSON.stringify(m)), { code: 'CONTRACT_MISMATCH' });
  assert.throws(() => modelBody('{"models":[]}'), { code: 'CONTRACT_MISMATCH' });
});
