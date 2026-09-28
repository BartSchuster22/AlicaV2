import { definePlugin } from '@alica/plugin-sdk';
import { canonical, parse, freeze } from '@alica/acap-contracts';
import { validateRequest, validateResponse } from '../provider/contract.mjs';
import { invalid } from '../provider/decimal.mjs';

const safeCodes = new Set(['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND',
  'CONTRACT_MISMATCH','DEADLINE_EXCEEDED','CANCELLED','UNAVAILABLE','RESOURCE_EXHAUSTED','FAILED_PRECONDITION']);
// The host context supplies authority; this service never mints or substitutes grants.
export function decisionService(descriptor, provider, { enabled = true } = {}) {
  if (!provider || typeof provider.evaluate !== 'function' || typeof provider.id !== 'string' || typeof enabled !== 'boolean') invalid();
  return definePlugin({
    activate(context) {
      context.provide(descriptor, {
        async evaluate(input, operation) {
          if (!enabled) invalid('FAILED_PRECONDITION');
          const request = freeze(parse(canonical(validateRequest(input))));
          const remaining = Math.min(30000, operation.deadlineMs - Date.now());
          if (!Number.isFinite(remaining) || remaining <= 0) invalid('DEADLINE_EXCEEDED');
          if (operation.signal.aborted) invalid('CANCELLED');
          const timeout = new AbortController();
          const signal = AbortSignal.any([operation.signal, timeout.signal]);
          let timer, abort;
          try {
            const stopped = new Promise((_resolve, reject) => {
              abort = () => reject(Object.assign(new Error('CANCELLED'), { code: timeout.signal.aborted ? 'DEADLINE_EXCEEDED' : 'CANCELLED' }));
              signal.addEventListener('abort', abort, { once: true });
              timer = setTimeout(() => timeout.abort(), remaining);
            });
            const result = await Promise.race([
              Promise.resolve().then(() => provider.evaluate(request, { signal, deadlineMs: Date.now() + remaining })), stopped,
            ]);
            if (result?.provider !== provider.id) invalid('CONTRACT_MISMATCH');
            return freeze(parse(canonical(validateResponse(request, result))));
          } catch (error) {
            // Never preserve an untrusted provider message/body/cause/stack.
            invalid(safeCodes.has(error?.code) ? error.code : 'UNAVAILABLE');
          } finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
          }
        },
      });
    },
  });
}
