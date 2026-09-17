import { randomBytes } from 'node:crypto';
import { AcapError, check } from '@alica/acap-contracts';
import type { ErrorCode } from '@alica/acap-types';
import type { ContextOffer } from './wire-schema.js';
import { WireBudget } from './wire.js';

export type Purpose = ContextOffer['purpose'];
type Slot = 'ordinary' | 'nested' | 'lifecycle';
export interface Admission {
  readonly scope: string;
  readonly purpose: Purpose;
  readonly requestedMs: number;
  readonly encodedBytes: number;
  readonly parent?: WorkContext;
  readonly signal?: AbortSignal;
  /** Host closure: checks current scope, instance, grant and registration. */
  readonly authorize: () => void;
}
interface RecordState {
  context: WorkContext;
  slot?: Slot;
  releaseBytes: () => void;
  timer: ReturnType<typeof setTimeout>;
  detach: () => void;
  resolve: (context: WorkContext) => void;
  reject: (error: AcapError) => void;
  admitted: boolean;
  offer?: { nonce: string; timer: ReturnType<typeof setTimeout> };
}
/** A broker-only object capability, never reconstructed from wire IDs. */
export class WorkContext {
  readonly children = new Set<WorkContext>();
  readonly controller = new AbortController();
  #terminal: ErrorCode | 'complete' | undefined;
  #endpointId: string | undefined;
  constructor(
    readonly owner: Scheduler,
    readonly reservationId: string,
    readonly scope: string,
    readonly purpose: Purpose,
    readonly end: number,
    readonly depth: number,
    readonly parent: WorkContext | undefined,
    readonly authorize: () => void,
  ) {}
  get id(): string {
    return this.#endpointId ?? this.reservationId;
  }
  bindEndpoint(id: string): void {
    check(this.#endpointId === undefined, 'FAILED_PRECONDITION');
    this.#endpointId = id;
  }
  get terminal() {
    return this.#terminal;
  }
  get remainingMs(): number {
    return Math.max(0, Math.ceil(this.end - this.owner.now()));
  }
  assertLive(): void {
    if (this.#terminal)
      throw new AcapError(
        this.#terminal === 'complete' ? 'FAILED_PRECONDITION' : this.#terminal,
      );
    check(this.remainingMs > 0, 'DEADLINE_EXCEEDED');
    this.parent?.assertLive();
    this.authorize();
  }
  finish(code: ErrorCode | 'complete' = 'complete'): void {
    if (this.#terminal) return;
    this.#terminal = code;
    this.controller.abort(code === 'complete' ? 'CANCELLED' : code);
    for (const child of [...this.children])
      child.finish(code === 'complete' ? 'CANCELLED' : code);
    this.parent?.children.delete(this);
    this.owner.terminal(this);
  }
}
/** Shared logical admission policy for local and native routes. Transport must
 * call offered only after atomic sendmsg succeeds, and reaped only after actual
 * process death. Logical cancellation cannot recall queued SCM_RIGHTS. */
export class Scheduler {
  #records = new Map<WorkContext, RecordState>();
  #queue: RecordState[] = [];
  #slots = { ordinary: 0, nested: 0, lifecycle: 0 };
  #counter = 0;
  #offerCounter = 0;
  #failed = false;
  #reaped = false;
  constructor(
    readonly sessionId: string,
    readonly generation: number,
    readonly budget: WireBudget,
    readonly failSession: (code: ErrorCode) => void,
    readonly now: () => number = () => performance.now(),
  ) {}
  get usage() {
    return Object.freeze({
      ...this.#slots,
      queued: this.#queue.length,
      records: this.#records.size,
      offers: [...this.#records.values()].filter((r) => r.offer).length,
      failed: this.#failed,
    });
  }
  admit(input: Admission): Promise<WorkContext> {
    try {
      check(!this.#failed, 'UNAVAILABLE');
      check(
        Number.isSafeInteger(input.requestedMs) &&
          input.requestedMs > 0 &&
          input.requestedMs <= 30000,
      );
      input.authorize();
      input.parent?.assertLive();
      check(!input.signal?.aborted, 'CANCELLED');
      const depth = (input.parent?.depth ?? 0) + 1;
      check(depth <= 8, 'RESOURCE_EXHAUSTED');
      check(this.#counter < Number.MAX_SAFE_INTEGER, 'RESOURCE_EXHAUSTED');
      const end = Math.min(
        this.now() +
          Math.min(input.requestedMs, input.purpose === 'event' ? 2000 : 30000),
        input.parent?.end ?? Infinity,
      );
      check(end > this.now(), 'DEADLINE_EXCEEDED');
      const slot = this.slot(input.purpose, !!input.parent);
      if (!slot)
        check(
          !input.parent &&
            input.purpose !== 'lifecycle' &&
            this.#queue.length < 64,
          'RESOURCE_EXHAUSTED',
        );
      const releaseBytes = this.budget.reserve(
        input.encodedBytes,
        input.purpose === 'lifecycle',
      );
      const context = new WorkContext(
        this,
        'r' + ++this.#counter,
        input.scope,
        input.purpose,
        end,
        depth,
        input.parent,
        input.authorize,
      );
      input.parent?.children.add(context);
      return new Promise<WorkContext>((resolve, reject) => {
        const abort = () => context.finish('CANCELLED');
        const record: RecordState = {
          context,
          releaseBytes,
          resolve,
          reject,
          admitted: false,
          timer: setTimeout(
            () => context.finish('DEADLINE_EXCEEDED'),
            Math.max(1, end - this.now()),
          ),
          detach: () => input.signal?.removeEventListener('abort', abort),
        };
        this.#records.set(context, record);
        input.signal?.addEventListener('abort', abort, { once: true });
        if (slot) this.start(record, slot);
        else this.#queue.push(record);
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }
  private slot(purpose: Purpose, nested: boolean): Slot | undefined {
    if (purpose === 'lifecycle')
      return this.#slots.lifecycle < 1 ? 'lifecycle' : undefined;
    if (nested && this.#slots.nested < 4) return 'nested';
    return this.#slots.ordinary < 4 ? 'ordinary' : undefined;
  }
  private start(record: RecordState, slot: Slot): void {
    try {
      record.context.assertLive();
    } catch (error) {
      record.context.finish(
        error instanceof AcapError ? error.code : 'UNAVAILABLE',
      );
      return;
    }
    record.slot = slot;
    this.#slots[slot]++;
    record.admitted = true;
    record.resolve(record.context);
  }
  /** Nonce exists only in the returned carrier metadata, not a control message. */
  offer(context: WorkContext): ContextOffer {
    const record = this.#records.get(context);
    check(record?.admitted && !record.offer, 'FAILED_PRECONDITION');
    context.assertLive();
    check(this.#offerCounter < Number.MAX_SAFE_INTEGER, 'RESOURCE_EXHAUSTED');
    // Admission order differs from dispatch order when nested work bypasses a
    // queued root. Allocate the immutable wire identity in carrier send order.
    context.bindEndpoint('c' + ++this.#offerCounter);
    const nonce = randomBytes(32).toString('hex');
    record.offer = {
      nonce,
      timer: setTimeout(() => this.fail('UNAVAILABLE'), 1000),
    };
    return {
      schemaVersion: 'acap.ipc-offer/v1',
      sessionId: this.sessionId,
      generation: this.generation,
      contextId: context.id,
      offerId: nonce,
      descriptorCount: 1,
      purpose: context.purpose,
      remainingMs: context.remainingMs,
    };
  }
  /** Called on this physical session only after authenticated control fencing. */
  acknowledge(
    sessionId: string,
    generation: number,
    contextId: string,
    nonce: string,
  ): WorkContext | undefined {
    check(
      !this.#failed &&
        sessionId === this.sessionId &&
        generation === this.generation,
      'UNAUTHENTICATED',
    );
    const record = [...this.#records.values()].find(
      (r) => r.context.id === contextId,
    );
    check(record?.offer && record.offer.nonce === nonce, 'UNAUTHENTICATED');
    clearTimeout(record.offer.timer);
    delete record.offer;
    if (record.context.terminal) {
      this.release(record);
      return;
    }
    try {
      record.context.assertLive();
    } catch (error) {
      record.context.finish(
        error instanceof AcapError ? error.code : 'UNAVAILABLE',
      );
      return;
    }
    return record.context;
  }
  terminal(context: WorkContext): void {
    const record = this.#records.get(context);
    if (!record) return;
    clearTimeout(record.timer);
    record.detach();
    if (!record.admitted)
      record.reject(
        new AcapError(
          context.terminal === 'complete' ? 'CANCELLED' : context.terminal!,
        ),
      );
    // Never release an in-flight descriptor or a quarantined process slot.
    if (!record.offer && (!this.#failed || this.#reaped)) this.release(record);
  }
  private release(record: RecordState): void {
    if (!this.#records.delete(record.context)) return;
    clearTimeout(record.timer);
    if (record.offer) clearTimeout(record.offer.timer);
    record.detach();
    record.releaseBytes();
    if (record.slot) this.#slots[record.slot]--;
    this.#queue = this.#queue.filter((r) => r !== record);
    if (!this.#failed)
      while (this.#queue.length && this.#slots.ordinary < 4)
        this.start(this.#queue.shift()!, 'ordinary');
  }
  fail(code: ErrorCode = 'UNAVAILABLE'): void {
    if (this.#failed) return;
    this.#failed = true;
    for (const record of this.#records.values()) {
      if (record.offer) clearTimeout(record.offer.timer);
      record.context.finish(code);
    }
    this.failSession(code);
  }
  /** Supervisor-only: call after observing actual exit/reap, not after SIGKILL. */
  reaped(): void {
    this.#reaped = true;
    this.fail();
    for (const record of [...this.#records.values()]) this.release(record);
  }
}
