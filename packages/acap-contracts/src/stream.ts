import type { Value, ErrorCode } from '@alica/acap-types';
import { AcapError, check, detach, normalized, schema } from './validation.js';
/** Inproc counterpart of the G1 IPC credit rule: zero initial credit, at most 256. */
export class CreditWindow {
  #credit = 0;
  #closed = false;
  #waiting: { resolve: () => void; reject: (e: unknown) => void } | undefined;
  constructor(readonly maximum = 256) {
    check(Number.isInteger(maximum) && maximum > 0 && maximum <= 256);
  }
  get outstanding() {
    return this.#credit;
  }
  get closed() {
    return this.#closed;
  }
  grant(count: number): void {
    check(!this.#closed, 'FAILED_PRECONDITION');
    check(
      Number.isInteger(count) &&
        count > 0 &&
        this.#credit + count <= this.maximum,
      'RESOURCE_EXHAUSTED',
    );
    this.#credit += count;
    if (this.#waiting) {
      const w = this.#waiting;
      this.#waiting = undefined;
      this.#credit--;
      w.resolve();
    }
  }
  take(): Promise<void> {
    if (this.#closed) return Promise.reject(new AcapError('CANCELLED'));
    if (this.#credit) {
      this.#credit--;
      return Promise.resolve();
    }
    if (this.#waiting)
      return Promise.reject(new AcapError('FAILED_PRECONDITION'));
    return new Promise((resolve, reject) => {
      this.#waiting = { resolve, reject };
    });
  }
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#credit = 0;
    const w = this.#waiting;
    this.#waiting = undefined;
    w?.reject(new AcapError('CANCELLED'));
  }
}
export type StreamOutcome = {
  requestId: string;
  sequence: number;
  result:
    | { kind: 'item'; value: Value }
    | { kind: 'complete' }
    | {
        kind: 'error';
        error: {
          code: ErrorCode;
          message: string;
          retryable: boolean;
          correlationId: string;
        };
      };
};
/** Logical values, not IPC wire frames. IPC framing/peer authentication remain G6. */
export async function* streamOutcomes(
  requestId: string,
  source: AsyncIterable<Value>,
): AsyncIterable<StreamOutcome> {
  check(
    typeof requestId === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(requestId),
  );
  let sequence = 0;
  let terminal = false;
  try {
    for await (const value of source) {
      const frame = detach({
        requestId,
        sequence: sequence + 1,
        result: { kind: 'item', value },
      }) as StreamOutcome;
      sequence++;
      yield frame;
    }
    terminal = true;
    yield { requestId, sequence: ++sequence, result: { kind: 'complete' } };
  } catch (e) {
    if (terminal) return;
    terminal = true;
    const n = normalized(e);
    yield {
      requestId,
      sequence: ++sequence,
      result: {
        kind: 'error',
        error: {
          code: n.code,
          message: n.code,
          retryable: false,
          correlationId: n.correlationId,
        },
      },
    };
  }
}
export async function* readStreamOutcomes(
  requestId: string,
  source: AsyncIterable<StreamOutcome>,
): AsyncIterable<Value> {
  let sequence = 0;
  for await (const raw of source) {
    const f = detach(raw);
    check(
      f &&
        typeof f === 'object' &&
        Object.keys(f).sort().join(',') === 'requestId,result,sequence',
    );
    check(
      f.requestId === requestId && f.sequence === ++sequence,
      'CONTRACT_MISMATCH',
    );
    const r = f.result;
    check(r && typeof r === 'object');
    if (r.kind === 'item') {
      check(Object.keys(r).sort().join(',') === 'kind,value');
      yield detach(r.value);
    } else if (r.kind === 'complete') {
      check(Object.keys(r).join(',') === 'kind');
      return;
    } else {
      check(
        r.kind === 'error' && Object.keys(r).sort().join(',') === 'error,kind',
      );
      schema('error', r.error);
      throw new AcapError(r.error.code, r.error.correlationId);
    }
  }
  throw new AcapError('UNAVAILABLE');
}
