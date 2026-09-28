import { validateRequest, validateResponse } from '../../provider/contract.mjs';
import { invalid } from '../../provider/decimal.mjs';
import { requestBody, responseBody, modelBody, identifier } from './mapping.mjs';
const safe = new Set(['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','CONTRACT_MISMATCH','DEADLINE_EXCEEDED','CANCELLED','UNAVAILABLE','RESOURCE_EXHAUSTED','FAILED_PRECONDITION']);
export async function discoverModels(transport, context) {
  try { return modelBody(await transport.send({ kind: 'discovery', ...context })); }
  catch (e) { invalid(safe.has(e?.code) ? e.code : 'UNAVAILABLE'); }
}
export function jevProvider({ transport, models, model }) {
  if (!transport || typeof transport.send !== 'function' || !Array.isArray(models) || !models.length) invalid('INVALID_ARGUMENT');
  const available = structuredClone(models);
  for (const m of available) identifier(m.id, 'INVALID_ARGUMENT');
  identifier(model, 'INVALID_ARGUMENT');
  if (!available.some(m => m.id === model)) invalid('NOT_FOUND');
  return Object.freeze({
    id: 'typesafe-jev',
    async listModels() { return available.map(m => ({ id: m.id, description: m.description })); },
    async evaluate(input, { signal, deadlineMs }) {
      try {
        const request = structuredClone(validateRequest(input));
        if (signal?.aborted) invalid('CANCELLED');
        if (!Number.isFinite(deadlineMs) || deadlineMs <= Date.now()) invalid('DEADLINE_EXCEEDED');
        const selected = request.model ?? model;
        if (!available.some(m => m.id === selected)) invalid('NOT_FOUND');
        const body = requestBody(request, selected); // Unsupported rubric fails BEFORE reservation.
        const kind = request.questions.length === 1 ? ({ boolean: 'noul', choice: 'choice', score: 'score' }[request.questions[0].kind]) : 'mixed';
        const text = await transport.send({ kind, body, signal, deadlineMs: Math.min(deadlineMs, Date.now() + 30000) });
        return validateResponse(request, responseBody(request, text));
      } catch (e) { invalid(safe.has(e?.code) ? e.code : 'UNAVAILABLE'); }
    },
  });
}
