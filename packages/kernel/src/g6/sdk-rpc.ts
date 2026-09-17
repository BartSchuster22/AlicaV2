import { AcapError, check, normalized } from '@alica/acap-contracts';
import type { ErrorCode } from '@alica/acap-types';
import type { response } from './wire-schema.js';

type Reply = response['body'];
type Control = Extract<Reply, { kind: 'control' }>['value'];
export type ResultKind = Control['kind'];
interface Pending {
  expected: readonly ResultKind[];
  resource?: string;
  resolve: (value: Control) => void;
  reject: (error: unknown) => void;
  finish: () => void;
  value?: Control;
  error?: unknown;
  done: boolean;
}
interface EndpointState {
  ordinal: number;
  next: number;
  pending: Map<number, Pending>;
}
/** Definite remote rejection, distinct from a transport outcome of unknown commit. */
export class SDKRejection extends AcapError {}
export interface RPCAdmission {
  readonly endpoint: object;
  readonly signal: AbortSignal;
  readonly end: number;
}
/** Per physical worker, requester-origin only. The dispatcher must route only
 * authenticated response frames here; incoming broker requests have a separate
 * map and never settle these IDs. Endpoint object identity is not a wire claim. */
export class SDKPending {
  // IDs encode a never-reused endpoint ordinal plus its request counter.
  // This permits exact retired-origin rejection without unbounded tombstones.
  static readonly stride = 2 ** 26;
  #ordinal = 0;
  #endpoints = new WeakMap<object, EndpointState>();
  #active = new Set<Pending>();
  #closed = false;
  #external = 0;
  reserveExternal(): () => void {
    check(!this.#closed, 'UNAVAILABLE');
    check(this.#active.size + this.#external < 64, 'RESOURCE_EXHAUSTED');
    this.#external++;
    let done = false;
    return () => {
      if (!done) {
        done = true;
        this.#external--;
      }
    };
  }
  constructor(readonly failSession: () => void) {}
  private reserve(
    admission: RPCAdmission,
    expected: readonly ResultKind[],
    resource?: string,
  ): { wireId: number; pending: Pending; promise: Promise<Control> } {
    try {
      return this.reserveBeforeSend(admission, expected, resource);
    } catch (error) {
      // No frame has been enqueued: local capacity/deadline rejection is as
      // definite as a broker control-error, never an unknown mutation outcome.
      throw new SDKRejection(normalized(error).code);
    }
  }
  private reserveBeforeSend(
    admission: RPCAdmission,
    expected: readonly ResultKind[],
    resource?: string,
  ): { wireId: number; pending: Pending; promise: Promise<Control> } {
    check(!this.#closed, 'UNAVAILABLE');
    check(!admission.signal.aborted, 'CANCELLED');
    check(performance.now() < admission.end, 'DEADLINE_EXCEEDED');
    check(this.#active.size + this.#external < 64, 'RESOURCE_EXHAUSTED');
    let state = this.#endpoints.get(admission.endpoint);
    if (!state) {
      check(this.#ordinal + 1 < SDKPending.stride, 'RESOURCE_EXHAUSTED');
      state = { ordinal: ++this.#ordinal, next: 0, pending: new Map() };
      this.#endpoints.set(admission.endpoint, state);
    }
    const wireId = ((state.next + 1) * SDKPending.stride + state.ordinal) * 2;
    check(Number.isSafeInteger(wireId), 'RESOURCE_EXHAUSTED');
    state.next++;
    let resolve!: (value: Control) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Control>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void promise.catch(() => {});
    const pending: Pending = {
      expected,
      ...(resource === undefined ? {} : { resource }),
      resolve,
      reject,
      done: false,
      finish: () => {
        if (pending.done) return;
        pending.done = true;
        clearTimeout(timer);
        admission.signal.removeEventListener('abort', abort);
        state!.pending.delete(wireId);
        this.#active.delete(pending);
      },
    };
    const lose = (code: ErrorCode) => {
      if (pending.done) return;
      pending.error = new AcapError(code);
      pending.finish();
      reject(pending.error);
      // Mutating SDK requests have unknown commit status. No retry or release
      // of a callback reservation can safely be inferred from this timeout.
      this.failSession();
    };
    const abort = () => lose('CANCELLED');
    const timer = setTimeout(
      () => lose('DEADLINE_EXCEEDED'),
      Math.max(1, admission.end - performance.now()),
    );
    admission.signal.addEventListener('abort', abort, { once: true });
    state.pending.set(wireId, pending);
    this.#active.add(pending);
    return { wireId, pending, promise };
  }
  private sendFailure(pending: Pending, error: unknown): never {
    pending.error = error;
    pending.finish();
    pending.reject(error);
    this.failSession();
    throw error;
  }
  request(
    admission: RPCAdmission,
    expected: readonly ResultKind[],
    send: (wireId: number) => void,
    resource?: string,
  ): Promise<Control> {
    const { wireId, pending, promise } = this.reserve(
      admission,
      expected,
      resource,
    );
    try {
      send(wireId);
    } catch (error) {
      this.sendFailure(pending, error);
    }
    return promise;
  }
  /** The trusted pump is synchronous and progresses all transport lanes. It
   * must use bounded native polling, not private Node handles or Promise spins. */
  requestSync(
    admission: RPCAdmission,
    expected: readonly ResultKind[],
    send: (wireId: number) => void,
    pump: () => void,
    resource?: string,
  ): Control {
    const { wireId, pending } = this.reserve(admission, expected, resource);
    try {
      send(wireId);
      while (!pending.done) {
        check(!admission.signal.aborted, 'CANCELLED');
        check(performance.now() < admission.end, 'DEADLINE_EXCEEDED');
        pump();
      }
    } catch (error) {
      this.sendFailure(pending, error);
    }
    if (pending.error) throw pending.error;
    check(pending.value, 'UNAVAILABLE');
    return pending.value;
  }
  accept(endpoint: object, body: Reply): void {
    const state = this.#endpoints.get(endpoint);
    const fault = () => {
      this.failSession();
      throw new AcapError('UNAUTHENTICATED');
    };
    if (
      !state ||
      !Number.isSafeInteger(body.wireId) ||
      body.wireId < 1 ||
      body.wireId % 2 !== 0 ||
      (body.wireId / 2) % SDKPending.stride !== state.ordinal ||
      Math.floor(body.wireId / 2 / SDKPending.stride) > state.next ||
      Math.floor(body.wireId / 2 / SDKPending.stride) < 1
    )
      return fault();
    const pending = state.pending.get(body.wireId);
    // Exact endpoint and origin watermark: no growing retired-reply history.
    if (!pending) return;
    if (body.kind === 'control-error') {
      pending.error = new SDKRejection(body.error.code);
      pending.finish();
      pending.reject(pending.error);
      return;
    }
    if (body.kind !== 'control' || !pending.expected.includes(body.value.kind))
      return fault();
    if (
      pending.resource !== undefined &&
      (!('effectId' in body.value) || body.value.effectId !== pending.resource)
    )
      return fault();
    pending.value = body.value;
    pending.finish();
    pending.resolve(body.value);
  }
  close(): void {
    this.#closed = true;
    for (const pending of this.#active) {
      pending.error = new AcapError('UNAVAILABLE');
      pending.finish();
      pending.reject(pending.error);
    }
  }
  get size(): number {
    return this.#active.size;
  }
}
