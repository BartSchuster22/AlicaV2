import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonical, parse, descriptor as validateDescriptor, digest } from '@alica/acap-contracts';
import { validateProposal, transition } from '@alica/catalog/governance';
import { validateDefinition, localReader } from '@alica/catalog';
import { createTestCell } from '@alica/testkit';
import { definePlugin, clientEndpoint } from '@alica/plugin-sdk';
import { decimal, fromLexical, wireJSON, parseNumericJSON, structured } from '../../provider/decimal.mjs';
import { validateRequest, validateResponse, encodeDocument, decodeDocument, ID, requirement } from '../../provider/contract.mjs';
import { neutralProvider } from '../../provider/neutral.mjs';
import { decisionService } from '../../service/index.mjs';
const root = new URL('../../../../catalog/proposals/decision-evaluate/', import.meta.url);
const json = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const descriptor = json('descriptor.json');
export const request = {
  state: encodeDocument({ text: 'A disposable blue tile.', weight: { $decisionDecimal: '0.125' }, literal: '0.125' }),
  questions: [
    { name: 'blue', kind: 'boolean', instructions: encodeDocument({ text: 'Is the tile blue?' }) },
    { name: 'color', kind: 'choice', instructions: encodeDocument({ text: 'Pick a color.' }), options: [
      { id: 'blue', description: encodeDocument({ text: 'Blue tile' }) }, { id: 'red', description: encodeDocument({ text: 'Red tile' }) },
    ] },
    { name: 'rating', kind: 'score', instructions: encodeDocument({ text: 'Rate blueness.' }), levels: [
      { id: 'low', value: '0', description: encodeDocument({ text: 'Not blue', threshold: { $decisionDecimal: '0.1' } }) },
      { id: 'high', value: '2.625', description: encodeDocument({ text: 'Very blue' }) },
    ] },
  ],
};
const clone = v => structuredClone(v);
const code = c => error => { assert.equal(error.code, c); return true; };
async function response() { return neutralProvider().evaluate(request, { signal: new AbortController().signal }); }
async function setup(provider = neutralProvider(), options = {}) {
  const cell = createTestCell();
  const p = cell.instance({ id: 'org.decision.service' });
  const c = cell.instance({ id: 'org.decision.consumer', permissions: { capabilities: { [ID]: ['evaluate'] } } });
  await p.activate(decisionService(descriptor, provider, options));
  let endpoint;
  await c.activate(definePlugin({ async activate(context) { endpoint = clientEndpoint(await context.require(requirement), descriptor); } }));
  return { cell, p, c, endpoint, call: (r = request, ms = 1000) => endpoint.call('evaluate', r, { deadlineMs: Date.now() + ms }) };
}
async function cleanup(cell) {
  const reports = await cell.close();
  for (const report of reports) {
    assert.equal(report.state, 'DISPOSED'); assert.deepEqual(report.failedDisposers, []);
    assert.equal(report.timedOutResources, 0); assert.equal(report.restartRequired, false);
  }
  assert.equal(cell.inspect().providers, 0); assert.equal(cell.inspect().pending, 0);
}
test('J3 exact decimal lexical rules and frozen ACAP compatibility', () => {
  for (const v of ['0','0.5','-0.5','1','2.625','0.000000000000000001','123456789012345678.123456789012345678']) assert.equal(decimal(v), v);
  for (const v of ['-0','+1','01','1.0','.1','1.','1e-1','NaN','Infinity',' 1','0.0000000000000000001',0.1,'9'.repeat(37)]) assert.throws(() => decimal(v), code('INVALID_ARGUMENT'));
  assert.equal(fromLexical('7.34928e-1'), '0.734928');
  assert.equal(fromLexical('1.2300e2'), '123');
  assert.equal(fromLexical('-0.0'), '0');
  assert.throws(() => fromLexical('1e-19'));
  assert.throws(() => fromLexical('1e101'));
  assert.throws(() => canonical({ p: 0.5 }));
  assert.equal(canonical(parse(canonical(request))), canonical(request));
  assert.equal(wireJSON(decodeDocument(request.state)), '{"literal":"0.125","text":"A disposable blue tile.","weight":0.125}');
  assert.throws(() => decodeDocument({ json: '{"x":0.1}' }));
  assert.throws(() => decodeDocument({ json: '{"x":1,"x":2}' }));
});
test('J3 structured fractions are exact numeric wire literals, never ambiguous strings', () => {
  const input = { n: { $decisionDecimal: '0.123456789012345678' }, s: '0.123456789012345678', nested: [2, null] };
  const text = wireJSON(input);
  assert.equal(text, '{"n":0.123456789012345678,"s":"0.123456789012345678","nested":[2,null]}');
  const parsed = parseNumericJSON('{"n":1.23456789012345678e-1,"s":"0.123456789012345678"}');
  assert.deepEqual(parsed, { n: { $decisionDecimal: '0.123456789012345678' }, s: '0.123456789012345678' });
  assert.throws(() => structured({ $decisionDecimal: '0.5', ordinary: true }));
  assert.throws(() => structured({ fraction: 0.5 }));
  assert.throws(() => structured({ number: Number.MAX_SAFE_INTEGER + 1 }));
  assert.throws(() => structured({ content: 'x'.repeat(32769) }));
  let deep = {}; for (let i = 0; i < 18; i++) deep = { child: deep };
  assert.throws(() => structured(deep));
});
test('J4 actual Catalog proposal/definition validation without admission or self-review', () => {
  const proposal = validateProposal(json('proposal.json'));
  assert.equal(proposal.draft, 'acap://alica.io/decision/evaluate@1');
  const policy = json('namespace-policy.json');
  assert.deepEqual(policy.release, []);
  const entry = validateDefinition(json('definition.json'), localReader(root.pathname), policy, { release: false });
  assert.equal(entry.definition.metadata.maturity, 'proposed');
  assert.equal(digest(validateDescriptor(canonical(descriptor))), entry.definition.contract.digest);
  assert.throws(() => validateDefinition(json('definition.json'), localReader(root.pathname), policy), code('NOT_INCLUDED'));
  assert.throws(() => transition(null, entry, { maintainer: 'ALICA maintainers', reference: 'pending-independent-review' }), code('UNACCEPTED_PROPOSAL'));
});
test('J5/J6 neutral mixed semantics and exact round-trip', async () => {
  validateRequest(request);
  const result = validateResponse(request, await response());
  assert.equal(result.answers[0].probability, '0.5');
  assert.equal(result.answers[1].selected, 'blue');
  assert.deepEqual(result.answers[2].legend, request.questions[2].levels);
  const reversed = clone(result); reversed.answers.reverse(); validateResponse(request, reversed);
});
test('J3/J6 malformed inputs, criteria, fractional state and limits rejected', () => {
  const edits = [r => r.questions = [], r => r.questions.push(clone(r.questions[0])),
    r => r.state.weight = 0.1, r => r.questions[1].options[1].id = 'blue',
    r => r.questions[2].levels[1].value = '2.0', r => r.questions[0].kind = 'noul',
    r => r.questions[0].options = [], r => r.questions[1].options = [],
    r => r.questions[2].levels[1].value = '0', r => r.extra = 'not allowed'];
  for (const edit of edits) { const r = clone(request); edit(r); assert.throws(() => validateRequest(r), code('INVALID_ARGUMENT')); }
});
test('J6 exact correspondence, totals, confidence, range and legend defenses', async () => {
  const good = await response();
  const edits = [r => r.answers.pop(), r => r.answers[0].name = 'missing',
    r => r.answers[0].kind = 'choice', r => r.answers[0].probability = '1.1',
    r => r.answers[1].confidence = '-0.1', r => r.answers[1].selected = 'red',
    r => r.answers[1].distribution[1].id = 'alien', r => r.answers[1].distribution[0].probability = '0.9',
    r => r.answers[2].legend[0].description.text = 'changed', r => r.answers[2].expectedScore = '3',
    r => r.answers[2].expectedScore = '1', r => r.usage.inputTokens = -1];
  for (const edit of edits) { const r = clone(good); edit(r); assert.throws(() => validateResponse(request, r), code('CONTRACT_MISMATCH')); }
  const tolerated = clone(good); tolerated.answers[1].distribution[0].probability = '0.999999';
  validateResponse(request, tolerated); assert.equal(tolerated.answers[1].distribution[0].probability, '0.999999');
  tolerated.answers[1].distribution[0].probability = '0.999998';
  assert.throws(() => validateResponse(request, tolerated), code('CONTRACT_MISMATCH'));
  const fractional = clone(good);
  fractional.answers[2].distribution = [{ id: 'low', probability: '0.5' },{ id: 'high', probability: '0.5' }];
  fractional.answers[2].expectedScore = '1.3125'; validateResponse(request, fractional);
});
test('J7 public SDK testkit vertical substitutes neutral providers, clean disposal', async () => {
  const outputs = [];
  for (const select of ['first','last']) {
    const s = await setup(neutralProvider({ select }));
    try { outputs.push(parse(canonical(await s.call()))); } finally { await cleanup(s.cell); }
  }
  assert.equal(outputs[0].answers[1].selected, 'blue');
  assert.equal(outputs[1].answers[1].selected, 'red');
  assert.equal(outputs[1].answers[2].expectedScore, '2.625');
});
test('J7 Host permissions/revocation remain authoritative; no provider dispatch on denied calls', async () => {
  let calls = 0; const n = neutralProvider();
  const s = await setup({ id: n.id, async evaluate(...args) { calls++; return n.evaluate(...args); } });
  try {
    const denied = s.cell.instance({ id: 'org.decision.denied' });
    await denied.activate(definePlugin({ activate() {} }));
    await assert.rejects(denied.context.require(requirement), code('PERMISSION_DENIED'));
    assert.equal(calls, 0);
    await s.call(); assert.equal(calls, 1);
    s.cell.revoke(s.c);
    await assert.rejects(s.call(), code('PERMISSION_DENIED')); assert.equal(calls, 1);
  } finally { await cleanup(s.cell); }
});
test('J7 unload makes handles stale; incompatible major and descriptor mismatches fail', async () => {
  const s = await setup();
  try {
    await assert.rejects(s.c.context.require({ ...requirement, major: 2 }), code('INCOMPATIBLE_VERSION'));
    const handle = await s.c.context.require(requirement);
    assert.throws(() => clientEndpoint(handle, { ...descriptor, version: '1.0.1' }), code('CONTRACT_MISMATCH'));
    await s.p.dispose();
    await assert.rejects(s.call(), code('UNAVAILABLE'));
  } finally { await cleanup(s.cell); }
});
test('J7 disable switch prevents invocation', async () => {
  let calls = 0;
  const s = await setup({ id: 'disabled', async evaluate() { calls++; } }, { enabled: false });
  try { await assert.rejects(s.call(), code('FAILED_PRECONDITION')); assert.equal(calls, 0); }
  finally { await cleanup(s.cell); }
});
test('J7 unknown model and provider errors normalized without echoed state', async () => {
  const n = await setup();
  try { await assert.rejects(n.call({ ...request, model: 'unknown' }), code('NOT_FOUND')); }
  finally { await cleanup(n.cell); }
  const s = await setup({ id: 'failing', async evaluate() { throw new Error('SENSITIVE_STATE_CANARY'); } });
  try {
    await assert.rejects(s.call(), e => { assert.equal(e.code, 'UNAVAILABLE'); assert(!String(e.stack).includes('SENSITIVE_STATE_CANARY')); return true; });
    assert(!JSON.stringify(s.cell.inspect()).includes('SENSITIVE_STATE_CANARY'));
  } finally { await cleanup(s.cell); }
});
test('J7 deadline and cancellation forwarded once, no retry', async () => {
  let calls = 0, cancelled = false;
  const s = await setup({ id: 'waiting', async evaluate(_r, { signal }) {
    calls++; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { cancelled = true; reject(new Error('no body')); }, { once: true }));
  } });
  try {
    await assert.rejects(s.call(request, 30), code('DEADLINE_EXCEEDED'));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(calls, 1); assert.equal(cancelled, true);
  } finally { await cleanup(s.cell); }
});
