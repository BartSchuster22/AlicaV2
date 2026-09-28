import { invalid, wireJSON, units, probability, SCALE, near } from '../../provider/decimal.mjs';
import { parseWire, wireDecimal, wireInteger, wireCanonical } from './wire.mjs';
const mismatch = () => invalid('CONTRACT_MISMATCH');
function object(v) { if (!v || typeof v !== 'object' || Array.isArray(v)) mismatch(); return v; }
function exact(v, names) { object(v); if (Object.keys(v).sort().join('\0') !== [...names].sort().join('\0')) mismatch(); }
export function identifier(v, code = 'CONTRACT_MISMATCH') {
  if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(v)) invalid(code);
  return v;
}
// Caller validates the generic contract first. Numeric markers are decoded ONLY
// when serializing structured documents; semantic numeric response fields require wire tokens.
export function requestBody(request, model) {
  identifier(model, 'INVALID_ARGUMENT');
  const questions = Object.create(null);
  for (const q of request.questions) {
    const out = { type: q.kind === 'boolean' ? 'noul' : q.kind, instructions: JSON.parse(q.instructions.json) };
    if (q.kind === 'boolean' && q.criteria) out.criteria = Object.fromEntries(Object.entries(q.criteria).map(([k,v]) => [k, JSON.parse(v.json)]));
    if (q.kind === 'choice') out.criteria = Object.fromEntries(q.options.map(o => [o.id, JSON.parse(o.description.json)]));
    if (q.kind === 'score') {
      if (q.levels.some((l,i) => l.value !== String(i))) invalid('INVALID_ARGUMENT');
      out.criteria = q.levels.map(l => JSON.parse(l.description.json));
    }
    questions[q.name] = out;
  }
  return wireJSON({ state: JSON.parse(request.state.json), model, questions });
}
function distribution(probabilities, ids, wireIds = ids) {
  exact(probabilities, wireIds);
  const rows = ids.map((id,i) => ({ id, probability: wireDecimal(probabilities[wireIds[i]]) }));
  try { if (!near(rows.reduce((n,p) => n + probability(p.probability), 0n), SCALE)) mismatch(); }
  catch { mismatch(); }
  return rows;
}
export function responseBody(request, text) {
  try {
    const response = parseWire(text);
    exact(response, ['model','answers','usage']); identifier(response.model);
    exact(response.answers, request.questions.map(q => q.name));
    exact(response.usage, ['input_tokens','output_tokens']);
    const answers = request.questions.map(q => {
      const a = response.answers[q.name];
      const common = { name: q.name, kind: q.kind };
      if (q.kind === 'boolean') {
        exact(a, ['type','noul']); if (a.type !== 'noul') mismatch();
        const p = wireDecimal(a.noul); probability(p);
        return { ...common, probability: p };
      }
      if (a?.type !== q.kind) mismatch();
      const confidence = wireDecimal(a.confidence); probability(confidence);
      if (q.kind === 'choice') {
        exact(a, ['type','choice','confidence','probabilities']); identifier(a.choice);
        const rows = distribution(a.probabilities, q.options.map(o => o.id));
        const selected = rows.find(p => p.id === a.choice);
        if (!selected || rows.some(p => units(p.probability) > units(selected.probability))) mismatch();
        return { ...common, selected: a.choice, confidence, distribution: rows };
      }
      exact(a, ['type','score','confidence','legend','probabilities']);
      const indices = q.levels.map((_l,i) => String(i)); exact(a.legend, indices);
      for (const [i,l] of q.levels.entries()) {
        // Compare typed wire trees, not generic marker trees: a forged literal
        // marker in provider legend cannot stand in for a requested numeric value.
        if (wireCanonical(a.legend[String(i)]) !== wireCanonical(parseWire(wireJSON(JSON.parse(l.description.json))))) mismatch();
      }
      const rows = distribution(a.probabilities, q.levels.map(l => l.id), indices);
      const score = wireDecimal(a.score), n = units(score);
      if (n < 0n || n > BigInt(q.levels.length - 1) * SCALE) mismatch();
      const weighted = rows.reduce((sum,p,i) => sum + probability(p.probability) * BigInt(i), 0n);
      if (!near(n, weighted)) mismatch();
      return { ...common, expectedScore: score, confidence, distribution: rows, legend: structuredClone(q.levels) };
    });
    return { provider: 'typesafe-jev', model: response.model, answers,
      usage: { inputTokens: wireInteger(response.usage.input_tokens), outputTokens: wireInteger(response.usage.output_tokens) } };
  } catch { mismatch(); }
}
// Bounded provider metadata policy: prose date or observed ISO timestamp.
// Preserve the original string (including subsecond precision/offset); no Date
// parsing, truncation or normalization. Other discovery validators unchanged.
function releaseDate(value) {
  if (typeof value !== 'string' || value.length > 128) return false;
  const match = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?/.exec(value);
  return match?.[0] === value;
}
export function modelBody(text) {
  try {
    const response = parseWire(text); exact(response, ['models']);
    if (!Array.isArray(response.models) || response.models.length < 1 || response.models.length > 128) mismatch();
    const models = response.models.map(m => {
      exact(m, ['name','description','release_date']); identifier(m.name);
      if (typeof m.description !== 'string' || m.description.length > 4096 || !releaseDate(m.release_date)) mismatch();
      return { id: m.name, description: m.description, releaseDate: m.release_date };
    });
    if (new Set(models.map(m => m.id)).size !== models.length) mismatch();
    return models;
  } catch { mismatch(); }
}
