// Proposed neutral reference; finite deterministic task, NOT model inference.
import { AcapError } from '@alica/acap-contracts';
export const fixtureTask = 'Read the approved fixture and return its text exactly.';
export const fixtureText = 'ALICA request-scoped fixture';
export const handlers = Object.freeze({
  async execute(input, context) {
    if (context.signal.aborted) throw new AcapError('CANCELLED');
    if (context.deadlineMs <= Date.now()) throw new AcapError('DEADLINE_EXCEEDED');
    if (input.task !== fixtureTask) throw new AcapError('INVALID_ARGUMENT');
    return { text: fixtureText };
  },
});
