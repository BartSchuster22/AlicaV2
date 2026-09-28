import { validateRequest } from './contract.mjs';
import { invalid } from './decimal.mjs';

// A deterministic reference, not a claim of model inference or calibration.
export function neutralProvider({ select = 'first' } = {}) {
  if (!['first', 'last'].includes(select)) invalid();
  return Object.freeze({
    id: 'neutral-reference',
    async listModels() { return [{ id: 'neutral-v1', description: 'Deterministic contract fixture' }]; },
    async evaluate(request, { signal }) {
      if (signal.aborted) invalid('CANCELLED');
      validateRequest(request);
      if (request.model !== undefined && request.model !== 'neutral-v1') invalid('NOT_FOUND');
      const answers = request.questions.map(q => {
        if (q.kind === 'boolean') return { name: q.name, kind: q.kind, probability: select === 'first' ? '0.5' : '1' };
        const items = q.kind === 'choice' ? q.options : q.levels;
        const chosen = items[select === 'first' ? 0 : items.length - 1];
        const base = { name: q.name, kind: q.kind, confidence: '1',
          distribution: items.map(o => ({ id: o.id, probability: o.id === chosen.id ? '1' : '0' })) };
        return q.kind === 'choice' ? { ...base, selected: chosen.id } :
          { ...base, expectedScore: chosen.value, legend: structuredClone(q.levels) };
      });
      return { provider: 'neutral-reference', model: 'neutral-v1', answers, usage: { inputTokens: 0, outputTokens: 0 } };
    },
  });
}
