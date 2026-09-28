import { canonical, parse } from '@alica/acap-contracts';
import { decimal, units, probability, structured, SCALE, near, invalid } from './decimal.mjs';

export const ID = 'io.alica.decision.evaluate';
export const URI = 'acap://alica.io/decision/evaluate@1';
export const requirement = Object.freeze({ capabilityId: ID, major: 1, minMinor: 0, operations: ['evaluate'], features: [] });
function object(v) { if (!v || typeof v !== 'object' || Array.isArray(v)) invalid(); }
function keys(v, required, optional = []) {
  object(v);
  if (required.some(k => !Object.hasOwn(v, k)) || Object.keys(v).some(k => ![...required, ...optional].includes(k))) invalid();
}
function name(v) { if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(v)) invalid(); }
function list(v, min = 1) { if (!Array.isArray(v) || v.length < min || v.length > 32) invalid(); }
function unique(values) { if (new Set(values).size !== values.length) invalid(); }
export function decodeDocument(v) {
  keys(v, ['json']);
  if (typeof v.json !== 'string' || Buffer.byteLength(v.json) > 32768) invalid();
  const decoded = parse(v.json, 32768);
  object(decoded);
  if (Object.hasOwn(decoded, '$decisionDecimal') || canonical(decoded) !== v.json) invalid();
  structured(decoded);
  return decoded;
}
export function encodeDocument(v) {
  const document = { json: canonical(v, 32768) };
  decodeDocument(document);
  return document;
}
const document = decodeDocument;
export function validateRequest(request) {
  structured(request);
  if (Buffer.byteLength(canonical(request)) > 65536) invalid();
  keys(request, ['state', 'questions'], ['model']);
  document(request.state);
  if (request.model !== undefined) name(request.model);
  list(request.questions);
  unique(request.questions.map(q => q?.name));
  for (const q of request.questions) {
    keys(q, ['name', 'kind', 'instructions'], ['options', 'levels', 'criteria']);
    name(q.name); document(q.instructions);
    if (q.kind === 'boolean') {
      if (q.options !== undefined || q.levels !== undefined) invalid();
      if (q.criteria !== undefined) {
        keys(q.criteria, [], ['true', 'false']);
        for (const description of Object.values(q.criteria)) document(description);
      }
    } else if (q.kind === 'choice') {
      if (q.levels !== undefined || q.criteria !== undefined) invalid();
      list(q.options); unique(q.options.map(o => o?.id));
      for (const o of q.options) { keys(o, ['id', 'description']); name(o.id); document(o.description); }
    } else if (q.kind === 'score') {
      if (q.options !== undefined || q.criteria !== undefined) invalid();
      list(q.levels); unique(q.levels.map(o => o?.id)); unique(q.levels.map(o => o?.value));
      for (const o of q.levels) { keys(o, ['id', 'value', 'description']); name(o.id); decimal(o.value); document(o.description); }
    } else invalid();
  }
  return request;
}
export function validateResponse(request, response) {
  try {
    structured(response);
    if (Buffer.byteLength(canonical(response)) > 65536) invalid();
    keys(response, ['provider', 'model', 'answers', 'usage']);
    name(response.provider); name(response.model);
    keys(response.usage, ['inputTokens', 'outputTokens']);
    for (const count of Object.values(response.usage)) if (!Number.isSafeInteger(count) || count < 0) invalid();
    list(response.answers);
    unique(response.answers.map(a => a?.name));
    if (response.answers.length !== request.questions.length) invalid();
    for (const q of request.questions) {
      const a = response.answers.find(x => x.name === q.name);
      if (!a || a.kind !== q.kind) invalid();
      if (q.kind === 'boolean') {
        keys(a, ['name', 'kind', 'probability']); probability(a.probability);
      } else {
        keys(a, q.kind === 'choice' ? ['name','kind','selected','confidence','distribution'] :
          ['name','kind','expectedScore','confidence','distribution','legend']);
        probability(a.confidence);
        const items = q.kind === 'choice' ? q.options : q.levels;
        list(a.distribution); unique(a.distribution.map(p => p?.id));
        if (a.distribution.length !== items.length) invalid();
        let sum = 0n;
        for (const p of a.distribution) {
          keys(p, ['id', 'probability']);
          if (!items.some(x => x.id === p.id)) invalid();
          sum += probability(p.probability);
        }
        if (!near(sum, SCALE)) invalid();
        if (q.kind === 'choice') {
          const selected = a.distribution.find(p => p.id === a.selected);
          if (!selected || a.distribution.some(p => probability(p.probability) > probability(selected.probability))) invalid();
        } else {
          if (canonical(a.legend) !== canonical(q.levels)) invalid();
          const expected = units(a.expectedScore);
          const values = q.levels.map(l => units(l.value));
          if (expected < values.reduce((a,b) => a < b ? a : b) || expected > values.reduce((a,b) => a > b ? a : b)) invalid();
          const weighted = a.distribution.reduce((n,p) => n + probability(p.probability) * units(q.levels.find(l => l.id === p.id).value), 0n);
          // Compare the full product before division: no intermediate rounding.
          if (!near(expected * SCALE, weighted, (SCALE / 1000000n) * SCALE)) invalid();
        }
      }
    }
    return response;
  } catch { invalid('CONTRACT_MISMATCH'); }
}
