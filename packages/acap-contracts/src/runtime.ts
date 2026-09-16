import { randomUUID } from 'node:crypto';
import { CreditWindow } from './stream.js';
import { performance } from 'node:perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  Descriptor,
  Requirement,
  Value,
  Handler,
  OperationContext,
  ErrorCode,
  CallOptions,
} from '@alica/acap-types';
import {
  AcapError,
  check,
  normalized,
  canonical,
  detach,
  freeze,
  digest,
  descriptor,
  payload,
  schema,
  version,
  requirement,
  parse,
} from './validation.js';
export interface ErrorRecord {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  correlationId: string;
}
export interface CallEnvelope {
  requestId: string;
  capabilityId: string;
  descriptorDigest: string;
  operation: string;
  deadlineMs: number;
  payload: Value;
  idempotencyKey?: string;
}
export interface ResponseEnvelope {
  requestId: string;
  result:
    { kind: 'success'; value: Value } | { kind: 'error'; error: ErrorRecord };
}
export function errorRecord(e: unknown): ErrorRecord {
  const safe = normalized(e);
  return freeze({
    code: safe.code,
    message: safe.code,
    retryable: false,
    correlationId: safe.correlationId,
  });
}
export function decodeResponse(bytes: string, expectedId: string): Value {
  const r = schema<ResponseEnvelope>('response', parse(bytes));
  check(r.requestId === expectedId, 'CONTRACT_MISMATCH');
  if (r.result.kind === 'error')
    throw new AcapError(r.result.error.code, r.result.error.correlationId);
  return detach(r.result.value);
}
export function negotiate(
  input: Descriptor,
  request: Requirement,
  expectedDigest?: string,
) {
  const d = descriptor(canonical(input));
  const r = detach(request);
  schema('plugin', {
    schemaVersion: 'alica.plugin/v1',
    id: 'org.alica.validation',
    version: '1.0.0',
    publisher: 'org.alica.validation',
    execution: 'inproc',
    entrypoint: 'index.js',
    provides: [],
    requires: [r],
    optionalRequires: [],
    secretReferences: [],
    publishedEvents: [],
    subscribedEvents: [],
  });
  requirement(r);
  const [major, minor] = version(d.version);
  check(!expectedDigest || digest(d) === expectedDigest, 'CONTRACT_MISMATCH');
  check(
    d.id === r.capabilityId &&
      major === r.major &&
      minor! >= r.minMinor &&
      (r.maxMinor === undefined || minor! <= r.maxMinor) &&
      r.operations.every((x) => d.operations.some((o) => o.name === x)) &&
      r.features.every((x) => d.features.includes(x)),
    'INCOMPATIBLE_VERSION',
  );
  return freeze({
    descriptorDigest: digest(d),
    version: d.version,
    negotiatedFeatures: (r.optionalFeatures ?? [])
      .filter((x) => d.features.includes(x))
      .sort(),
  });
}
/** Bounded single-reader queue. Error/cancellation discards buffered values, never silently drops. */
export class BoundedChannel<T> implements AsyncIterableIterator<T> {
  #queue: T[] = [];
  #done = false;
  #ended = false;
  #error: unknown;
  #waiting:
    | { resolve: (r: IteratorResult<T>) => void; reject: (e: unknown) => void }
    | undefined;
  constructor(
    readonly capacity = 256,
    private readonly validate: (value: T) => T = (x) => x,
    private readonly terminal: () => void = () => {},
    private readonly abandoned: () => void = () => {},
  ) {
    check(Number.isInteger(capacity) && capacity > 0 && capacity <= 256);
  }
  get size() {
    return this.#queue.length;
  }
  push(value: T): boolean {
    if (this.#done || this.#ended) return false;
    if (this.#waiting) {
      const w = this.#waiting;
      this.#waiting = undefined;
      try {
        w.resolve({ done: false, value: this.validate(value) });
      } catch (e) {
        this.fail(e);
        this.#ended = true;
        this.terminal();
        w.reject(normalized(e));
      }
      return !this.#done;
    }
    if (this.#queue.length >= this.capacity) {
      this.fail(new AcapError('RESOURCE_EXHAUSTED'));
      return false;
    }
    this.#queue.push(value);
    return true;
  }
  finish() {
    if (this.#done || this.#ended) return;
    this.#done = true;
    if (this.#waiting) {
      const w = this.#waiting;
      this.#waiting = undefined;
      this.#ended = true;
      this.terminal();
      w.resolve({ done: true, value: undefined });
    }
  }
  fail(e: unknown) {
    if (this.#ended || this.#error) return;
    this.#done = true;
    this.#queue = [];
    this.#error = normalized(e);
    this.abandoned();
    if (this.#waiting) {
      const w = this.#waiting;
      this.#waiting = undefined;
      this.#ended = true;
      this.terminal();
      w.reject(this.#error);
    }
  }
  async next(): Promise<IteratorResult<T>> {
    if (this.#ended) return { done: true, value: undefined };
    if (this.#error) {
      this.#ended = true;
      this.terminal();
      throw this.#error;
    }
    if (this.#queue.length) {
      try {
        return { done: false, value: this.validate(this.#queue.shift()!) };
      } catch (e) {
        this.fail(e);
        return this.next();
      }
    }
    if (this.#done) {
      this.#ended = true;
      this.terminal();
      return { done: true, value: undefined };
    }
    check(!this.#waiting, 'FAILED_PRECONDITION');
    return new Promise((resolve, reject) => {
      this.#waiting = { resolve, reject };
    });
  }
  async return(): Promise<IteratorResult<T>> {
    if (!this.#ended) {
      this.#ended = true;
      this.#queue = [];
      this.#done = true;
      this.abandoned();
      const w = this.#waiting;
      this.#waiting = undefined;
      w?.resolve({ done: true, value: undefined });
      this.terminal();
    }
    return { done: true, value: undefined };
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
const parents = new AsyncLocalStorage<{
  deadlineMs: number;
  signal: AbortSignal;
}>();
interface Ledger {
  payload: string;
  pending: boolean;
  expires: number;
  result?: Value;
  error?: ErrorRecord;
}
export class ContractProvider {
  readonly descriptor: Descriptor;
  readonly descriptorDigest: string;
  readonly handlers: Readonly<Record<string, Handler>>;
  #ledger = new Map<string, Ledger>();
  #closed = false;
  constructor(
    d: Descriptor,
    handlers: Record<string, Handler>,
    readonly maxRecords = 256,
  ) {
    this.descriptor = freeze(descriptor(canonical(d)));
    this.descriptorDigest = digest(this.descriptor);
    check(Number.isInteger(maxRecords) && maxRecords > 0 && maxRecords <= 4096);
    check(
      canonical(Object.keys(handlers).sort()) ===
        canonical(d.operations.map((x) => x.name).sort()) &&
        Object.values(handlers).every((x) => typeof x === 'function'),
      'CONTRACT_MISMATCH',
    );
    check(
      !d.operations.some((o) => o.idempotencyPolicy?.persistence === 'durable'),
      'FAILED_PRECONDITION',
    );
    this.handlers = Object.freeze({ ...handlers });
  }
  get closed() {
    return this.#closed;
  }
  close() {
    this.#closed = true;
    this.#ledger.clear();
  }
  async unary(
    op: string,
    body: Value,
    ctx: OperationContext,
    now: () => number,
  ): Promise<Value> {
    check(!this.#closed, 'UNAVAILABLE');
    const operation = this.descriptor.operations.find((o) => o.name === op)!;
    let record: Ledger | undefined;
    if (ctx.idempotencyKey !== undefined) {
      for (const [k, v] of this.#ledger)
        if (!v.pending && v.expires <= now()) this.#ledger.delete(k);
      const key = canonical([
        ctx.caller.principal,
        ctx.caller.scope,
        ctx.scopeGeneration,
        this.descriptor.id,
        op,
        ctx.idempotencyKey,
      ]);
      const bodyDigest = digest(body);
      record = this.#ledger.get(key);
      if (record) {
        check(record.payload === bodyDigest && !record.pending, 'CONFLICT');
        if (record.error) throw record.error;
        return detach(record.result!);
      }
      check(this.#ledger.size < this.maxRecords, 'RESOURCE_EXHAUSTED');
      record = { payload: bodyDigest, pending: true, expires: Infinity };
      this.#ledger.set(key, record);
    }
    try {
      const result = await (
        this.handlers[op]! as (v: Value, c: OperationContext) => Promise<Value>
      )(body, ctx);
      let value: Value;
      try {
        value = detach(result);
        payload(operation.output, value);
      } catch {
        throw new AcapError('CONTRACT_MISMATCH');
      }
      if (record) record.result = detach(value);
      return value;
    } catch (e) {
      if (record) record.error = errorRecord(e);
      throw normalized(e);
    } finally {
      if (record) {
        record.pending = false;
        record.expires =
          now() + (operation.idempotencyPolicy?.retentionMs ?? 0);
      }
    }
  }
}
export interface ClientEndpoint {
  readonly descriptor: Descriptor;
  call(operation: string, input: Value, options: CallOptions): Promise<Value>;
  openStream(
    operation: string,
    input: Value,
    options: CallOptions,
  ): AsyncIterable<Value>;
}
export interface Binding {
  caller: { principal: string; instanceId: string; scope: string };
  scopeGeneration: number;
  /** Trusted host callbacks, never deserialized from client JSON. Required even for local test sessions. */
  authorize: (operation?: string) => void;
  maxCallMs?: number;
  maxPending?: number;
  streamCapacity?: number;
  now?: () => number;
  admit?: (cancel: (code: ErrorCode) => void) => () => void;
  track?: <T>(promise: Promise<T>) => Promise<T>;
}
interface Attempt {
  request: CallEnvelope;
  context: OperationContext;
  cancel: (code: ErrorCode) => void;
  failure: Promise<never>;
  stop: () => void;
  isDone: () => boolean;
  assertLive: () => void;
  commit: () => void;
}
export class ContractSession {
  #pending = new Map<string, (code: ErrorCode) => void>();
  #closed = false;
  #now: () => number;
  #limit: number;
  #caller: Binding['caller'];
  constructor(
    readonly provider: ContractProvider,
    private readonly binding: Binding,
  ) {
    check(typeof binding.authorize === 'function', 'UNAUTHENTICATED');
    this.#caller = freeze(detach(binding.caller));
    check(
      typeof this.#caller.principal === 'string' &&
        typeof this.#caller.instanceId === 'string' &&
        typeof this.#caller.scope === 'string' &&
        Number.isSafeInteger(binding.scopeGeneration) &&
        binding.scopeGeneration > 0,
    );
    this.binding = { ...binding };
    this.#now = binding.now ?? Date.now;
    this.#limit = binding.maxCallMs ?? 30000;
    check(
      Number.isSafeInteger(this.#limit) &&
        this.#limit > 0 &&
        this.#limit <= 30000,
    );
    check(
      Number.isInteger(binding.maxPending ?? 256) &&
        (binding.maxPending ?? 256) > 0 &&
        (binding.maxPending ?? 256) <= 4096,
    );
    check(
      Number.isInteger(binding.streamCapacity ?? 256) &&
        (binding.streamCapacity ?? 256) > 0 &&
        (binding.streamCapacity ?? 256) <= 256,
    );
  }
  private prepare(
    input: CallEnvelope,
    kind: 'unary' | 'stream',
    signal?: AbortSignal,
  ): Attempt {
    const admissionTime = this.#now();
    const admissionMono = performance.now();
    check(!this.#closed && !this.provider.closed, 'UNAVAILABLE');
    this.binding.authorize();
    const q = schema<CallEnvelope>('call', detach(input));
    check(!this.#pending.has(q.requestId), 'CONFLICT');
    check(
      q.capabilityId === this.provider.descriptor.id &&
        q.descriptorDigest === this.provider.descriptorDigest,
      'CONTRACT_MISMATCH',
    );
    const op = this.provider.descriptor.operations.find(
      (x) => x.name === q.operation,
    );
    check(op, 'NOT_FOUND');
    this.binding.authorize(q.operation);
    check(op.kind === kind, 'FAILED_PRECONDITION');
    check(
      q.idempotencyKey === undefined || op.idempotency === 'provider',
      'INVALID_ARGUMENT',
    );
    payload(op.input, q.payload);
    check(signal === undefined || signal instanceof AbortSignal);
    const parent = parents.getStore();
    const now = this.#now();
    const deadline = Math.min(
      q.deadlineMs,
      parent?.deadlineMs ?? Infinity,
      admissionTime + this.#limit,
    );
    const monotonicEnd = admissionMono + (deadline - admissionTime);
    check(deadline > now, 'DEADLINE_EXCEEDED');
    check(!signal?.aborted && !parent?.signal.aborted, 'CANCELLED');
    check(
      this.#pending.size < (this.binding.maxPending ?? 256),
      'RESOURCE_EXHAUSTED',
    );
    let done = false;
    let committed = false;
    let stopped = false;
    let reject!: (e: unknown) => void;
    let release: () => void = () => {};
    const controller = new AbortController();
    const failure = new Promise<never>((_, r) => {
      reject = r;
    });
    void failure.catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      parent?.signal.removeEventListener('abort', abort);
      this.#pending.delete(q.requestId);
      release();
    };
    const cancel = (code: ErrorCode) => {
      if (done) return;
      done = true;
      controller.abort(code);
      reject(new AcapError(code));
      stop();
    };
    const abort = () => cancel('CANCELLED');
    this.#pending.set(q.requestId, cancel);
    try {
      release = this.binding.admit?.(cancel) ?? (() => {});
      timer = setTimeout(
        () => cancel('DEADLINE_EXCEEDED'),
        Math.max(0, Math.min(deadline - now, monotonicEnd - performance.now())),
      );
      signal?.addEventListener('abort', abort, { once: true });
      parent?.signal.addEventListener('abort', abort, { once: true });
    } catch (e) {
      done = true;
      stop();
      throw e;
    }
    const context = Object.freeze({
      requestId: q.requestId,
      deadlineMs: deadline,
      signal: controller.signal,
      caller: this.#caller,
      scopeGeneration: this.binding.scopeGeneration,
      ...(q.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: q.idempotencyKey }),
    });
    return {
      request: q,
      context,
      cancel,
      failure,
      stop,
      isDone: () => done,
      commit: () => {
        if (!done) {
          done = true;
          committed = true;
          stop();
        }
      },
      assertLive: () => {
        if (done && !committed)
          throw new AcapError(
            (controller.signal.reason ?? 'CANCELLED') as ErrorCode,
          );
        check(!this.#closed && !this.provider.closed, 'UNAVAILABLE');
        check(
          this.#now() < deadline && performance.now() < monotonicEnd,
          'DEADLINE_EXCEEDED',
        );
        this.binding.authorize(q.operation);
      },
    };
  }
  private tracked<T>(promise: Promise<T>): Promise<T> {
    return this.binding.track?.(promise) ?? promise;
  }
  async invoke(
    input: CallEnvelope,
    signal?: AbortSignal,
  ): Promise<ResponseEnvelope> {
    let a: Attempt | undefined;
    let requestId = randomUUID() as string;
    try {
      const raw =
        input && typeof input === 'object'
          ? Object.getOwnPropertyDescriptor(input, 'requestId')?.value
          : undefined;
      if (
        typeof raw === 'string' &&
        /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(raw)
      )
        requestId = raw;
      a = this.prepare(input, 'unary', signal);
      const current = a;
      const task = this.tracked(
        parents.run(
          { deadlineMs: a.context.deadlineMs, signal: a.context.signal },
          async () => {
            current.assertLive();
            return this.provider.unary(
              current.request.operation,
              current.request.payload,
              current.context,
              this.#now,
            );
          },
        ),
      );
      const result = await Promise.race([a.failure, task]);
      a.assertLive();
      a.commit();
      return detach({
        requestId,
        result: { kind: 'success', value: result },
      }) as ResponseEnvelope;
    } catch (e) {
      a?.commit();
      return detach({
        requestId,
        result: { kind: 'error', error: errorRecord(e) },
      }) as ResponseEnvelope;
    } finally {
      a?.stop();
    }
  }
  stream(
    input: CallEnvelope,
    signal?: AbortSignal,
  ): AsyncIterableIterator<Value> {
    let a: Attempt;
    try {
      a = this.prepare(input, 'stream', signal);
    } catch (e) {
      const c = new BoundedChannel<Value>();
      c.fail(e);
      return c;
    }
    const operation = this.provider.descriptor.operations.find(
      (x) => x.name === a.request.operation,
    )!;
    let iterator: AsyncIterator<Value> | undefined;
    let returning = false;
    const credits = new CreditWindow(this.binding.streamCapacity ?? 256);
    const abandon = () => {
      credits.close();
      if (!a.isDone()) a.cancel('CANCELLED');
      if (iterator?.return && !returning) {
        returning = true;
        void this.tracked(
          Promise.resolve().then(() => iterator!.return!()),
        ).catch(() => {});
      }
    };
    const channel = new BoundedChannel<Value>(
      this.binding.streamCapacity ?? 256,
      (value) => {
        a.assertLive();
        const v = detach(value);
        try {
          payload(operation.output, v);
        } catch {
          throw new AcapError('CONTRACT_MISMATCH');
        }
        return v;
      },
      () => {
        credits.close();
        a.commit();
      },
      abandon,
    );
    void a.failure.catch((e) => channel.fail(e));
    const pump = parents.run(
      { deadlineMs: a.context.deadlineMs, signal: a.context.signal },
      async () => {
        try {
          a.assertLive();
          const source = this.provider.handlers[a.request.operation]!(
            a.request.payload,
            a.context,
          );
          check(source && Symbol.asyncIterator in source, 'CONTRACT_MISMATCH');
          iterator = (source as AsyncIterable<Value>)[Symbol.asyncIterator]();
          for (;;) {
            await credits.take();
            a.assertLive();
            const next = await iterator.next();
            a.assertLive();
            if (next.done) {
              channel.finish();
              break;
            }
            if (!channel.push(detach(next.value))) break;
          }
        } catch (e) {
          channel.fail(e);
        }
      },
    );
    void this.tracked(pump).catch((e) => channel.fail(e));
    let reading = false;
    return {
      next: () => {
        if (reading)
          return Promise.reject(new AcapError('FAILED_PRECONDITION'));
        reading = true;
        const next = channel.next();
        if (!credits.closed) credits.grant(1);
        return next.finally(() => {
          reading = false;
        });
      },
      return: () => channel.return(),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }
  request(operation: string, input: Value, options: CallOptions): CallEnvelope {
    check(
      options &&
        Object.keys(options).every((k) =>
          ['deadlineMs', 'signal', 'idempotencyKey'].includes(k),
        ),
    );
    return {
      requestId: randomUUID(),
      capabilityId: this.provider.descriptor.id,
      descriptorDigest: this.provider.descriptorDigest,
      operation,
      payload: input,
      deadlineMs: options.deadlineMs,
      ...(options.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: options.idempotencyKey }),
    };
  }
  async call(
    operation: string,
    input: Value,
    options: CallOptions,
  ): Promise<Value> {
    const q = this.request(operation, input, options);
    const r = await this.invoke(q, options.signal);
    if (r.result.kind === 'error')
      throw new AcapError(r.result.error.code, r.result.error.correlationId);
    return detach(r.result.value);
  }
  openStream(
    operation: string,
    input: Value,
    options: CallOptions,
  ): AsyncIterable<Value> {
    return this.stream(this.request(operation, input, options), options.signal);
  }
  cancel(requestId: string): void {
    this.#pending.get(requestId)?.('CANCELLED');
  }
  close(): void {
    this.#closed = true;
    for (const cancel of [...this.#pending.values()]) cancel('UNAVAILABLE');
  }
  get descriptor() {
    return this.provider.descriptor;
  }
  get outstanding() {
    return this.#pending.size;
  }
}
