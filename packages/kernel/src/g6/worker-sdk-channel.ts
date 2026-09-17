import { AsyncLocalStorage } from 'node:async_hooks';
import { AcapError, check, errorRecord } from '@alica/acap-contracts';
import type { Disposer } from '@alica/acap-types';
import type { Frame } from './wire.js';
import type { request, response } from './wire-schema.js';
import type { WorkerEndpoint, WorkerTransport } from './worker-transport.js';
import { CallbackLedger, WorkerEffects } from './sdk-effects.js';
import { SDKPending, SDKRejection } from './sdk-rpc.js';
import type { ResultKind } from './sdk-rpc.js';

type ScopedRequest = Exclude<
  request['body'],
  {
    kind:
      | 'invoke'
      | 'lifecycle'
      | 'effect-cleanup'
      | 'outbound'
      | 'event-ack'
      | 'context-ready'
      | 'task-open';
  }
>;
type WithoutWire<T> = T extends unknown ? Omit<T, 'wireId'> : never;

/** Trusted worker-side scoped SDK channel. All work dispatchers for a worker
 * share this object and its outgoing sequence and pending-RPC ledgers. This
 * class neither opens a task for an expired ALS marker nor accepts wire parent
 * assertions. Broker authorization is still required for every request. */
export class WorkerSDKChannel {
  readonly pending: SDKPending;
  readonly callbacks: CallbackLedger;
  readonly effects: WorkerEffects;
  #current = new AsyncLocalStorage<WorkerEndpoint>();
  #sequences = new WeakMap<WorkerEndpoint, number>();
  #releases = new WeakMap<WorkerEndpoint, Map<string, Promise<void>>>();
  #taskOpening: { endpoint?: WorkerEndpoint } | undefined;
  readonly #controlIdentity = {};
  constructor(
    readonly transport: WorkerTransport,
    readonly activationMs: number,
  ) {
    check(
      Number.isInteger(activationMs) &&
        activationMs > 0 &&
        activationMs <= 30000,
    );
    check(transport.accepted, 'FAILED_PRECONDITION');
    const fail = () => {
      this.pending.close();
      transport.fail(new AcapError('UNAVAILABLE'));
    };
    this.pending = new SDKPending(fail);
    transport.onControl = (frame) => {
      check(
        frame.tag === 'response' &&
          (frame.body.kind === 'control' ||
            frame.body.kind === 'control-error'),
        'UNAUTHENTICATED',
      );
      this.pending.accept(this.#controlIdentity, frame.body);
    };
    transport.onOffer = (endpoint) => {
      if (endpoint.offer.purpose !== 'provider-task') return;
      check(
        this.#taskOpening && !this.#taskOpening.endpoint,
        'UNAUTHENTICATED',
      );
      this.#taskOpening.endpoint = endpoint;
    };
    this.callbacks = new CallbackLedger(
      transport.accepted.body.effectLimit,
      fail,
    );
    this.effects = new WorkerEffects(this.callbacks, {
      register: (scopeId, scopeGeneration, callbackId, end) => {
        const value = this.sync(
          { kind: 'effect-register', scopeId, scopeGeneration, callbackId },
          ['effect-registered'],
          end,
        );
        check(value.kind === 'effect-registered', 'UNAUTHENTICATED');
        return value.effectId;
      },
      release: (effectId) => this.releaseEffect(effectId),
      isDefiniteRejection: (error) => error instanceof SDKRejection,
      failSession: fail,
    });
  }
  /** Only absence of a marker permits a fresh ordinary provider task. */
  scoped<T>(scopeId: string, work: () => T): T {
    if (this.#current.getStore()) {
      this.current();
      return work();
    }
    check(!this.#taskOpening, 'RESOURCE_EXHAUSTED');
    const opening: { endpoint?: WorkerEndpoint } = {};
    this.#taskOpening = opening;
    const controller = new AbortController();
    const requestedMs = this.transport.capsule.runtime.maxCallMs;
    let wireId = 0;
    try {
      this.pending.requestSync(
        {
          endpoint: this.#controlIdentity,
          signal: controller.signal,
          end: performance.now() + requestedMs,
        },
        ['ack'],
        (id) => {
          wireId = id;
          this.transport.controlSend({
            schemaVersion: 'acap.ipc/v1',
            tag: 'request',
            sessionId: this.transport.capsule.sessionId,
            generation: this.transport.capsule.generation,
            contextId: 'control',
            sequence: this.transport.nextControlSequence(),
            body: { kind: 'task-open', wireId: id, scopeId, requestedMs },
          });
        },
        () => this.transport.waitTurn(),
      );
      check(opening.endpoint, 'UNAUTHENTICATED');
    } finally {
      this.#taskOpening = undefined;
    }
    const endpoint = opening.endpoint;
    const release = () => {
      if (!endpoint.stream.closed)
        this.send(endpoint, {
          tag: 'cancel',
          body: { wireId, reason: 'CANCELLED' },
        });
    };
    try {
      const result = this.run(endpoint, work);
      if (
        result &&
        typeof result === 'object' &&
        Symbol.asyncIterator in result
      ) {
        const iterator = (result as AsyncIterable<unknown>)[
          Symbol.asyncIterator
        ]();
        return {
          [Symbol.asyncIterator]() {
            return this;
          },
          next: async () => {
            try {
              const r = await this.run(endpoint, () => iterator.next());
              if (r.done) release();
              return r;
            } catch (e) {
              release();
              throw e;
            }
          },
          return: async () => {
            try {
              return await this.run(
                endpoint,
                () =>
                  iterator.return?.() ??
                  Promise.resolve({ done: true as const, value: undefined }),
              );
            } finally {
              release();
            }
          },
        } as T;
      }
      if (
        result &&
        typeof result === 'object' &&
        'then' in result &&
        typeof result.then === 'function'
      )
        return Promise.resolve(result).finally(release) as T;
      release();
      return result;
    } catch (error) {
      release();
      throw error;
    }
  }
  run<T>(endpoint: WorkerEndpoint, work: () => T): T {
    check(
      this.transport.contexts.get(endpoint.offer.contextId) === endpoint,
      'UNAUTHENTICATED',
    );
    return this.#current.run(endpoint, work);
  }
  current(): WorkerEndpoint {
    const endpoint = this.#current.getStore();
    // Delayed continuations keep their expired marker and fail; they never
    // silently acquire a fresh independent provider task or sibling endpoint.
    check(endpoint, 'FAILED_PRECONDITION');
    check(
      !endpoint.controller.signal.aborted && !endpoint.stream.closed,
      'FAILED_PRECONDITION',
    );
    check(performance.now() < endpoint.end, 'DEADLINE_EXCEEDED');
    check(
      this.transport.contexts.get(endpoint.offer.contextId) === endpoint,
      'UNAUTHENTICATED',
    );
    return endpoint;
  }
  private admission(endpoint: WorkerEndpoint) {
    return { endpoint, end: endpoint.end, signal: endpoint.controller.signal };
  }
  /** Shared by invocation/event/stream dispatch as well as scoped SDK replies. */
  send(endpoint: WorkerEndpoint, frame: Pick<Frame, 'tag' | 'body'>): void {
    check(
      this.transport.contexts.get(endpoint.offer.contextId) === endpoint,
      'UNAUTHENTICATED',
    );
    const sequence = (this.#sequences.get(endpoint) ?? 0) + 1;
    check(Number.isSafeInteger(sequence), 'RESOURCE_EXHAUSTED');
    this.#sequences.set(endpoint, sequence);
    // NativeStream validates the directional closed schema before enqueueing.
    endpoint.stream.send({
      schemaVersion: 'acap.ipc/v1',
      sessionId: endpoint.offer.sessionId,
      generation: endpoint.offer.generation,
      contextId: endpoint.offer.contextId,
      sequence,
      ...frame,
    } as Frame);
  }
  sync(
    body: WithoutWire<ScopedRequest>,
    expected: readonly ResultKind[],
    end?: number,
  ) {
    const endpoint = this.current();
    return this.pending.requestSync(
      {
        ...this.admission(endpoint),
        end: Math.min(end ?? endpoint.end, endpoint.end),
      },
      expected,
      (wireId) =>
        this.send(endpoint, { tag: 'request', body: { ...body, wireId } }),
      () => this.transport.waitTurn(),
    );
  }
  request(
    body: WithoutWire<ScopedRequest>,
    expected: readonly ResultKind[],
    resource?: string,
  ) {
    const endpoint = this.current();
    return this.pending.request(
      this.admission(endpoint),
      expected,
      (wireId) =>
        this.send(endpoint, { tag: 'request', body: { ...body, wireId } }),
      resource,
    );
  }
  acquire<T>(
    scopeId: string,
    generation: number,
    acquire: (register: (dispose: Disposer) => void) => Promise<T>,
  ): Promise<T> {
    const endpoint = this.current();
    return this.effects.acquire(
      scopeId,
      generation,
      Math.max(
        1,
        Math.min(
          this.activationMs,
          Math.floor(endpoint.end - performance.now()),
        ),
      ),
      acquire,
    );
  }
  private releaseEffect(effectId: string): Promise<void> {
    const endpoint = this.current();
    let releases = this.#releases.get(endpoint);
    if (!releases) this.#releases.set(endpoint, (releases = new Map()));
    const prior = releases.get(effectId);
    if (prior) return prior;
    // Reserve the inline link BEFORE enqueue. Cleanup may arrive from native
    // pumping while the originating effect-release reply is still pending.
    let resolve!: () => void, reject!: (error: unknown) => void;
    const result = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    releases.set(effectId, result);
    const done = () => releases!.delete(effectId);
    void result.then(done, done);
    try {
      void this.request(
        { kind: 'effect-release', effectId },
        ['effect-released'],
        effectId,
      ).then(() => resolve(), reject);
    } catch (error) {
      reject(error);
    }
    return result;
  }
  /** Returns false for invocation, stream and lifecycle dispatch owned by the
   * caller. The caller must not route those replies into the SDK origin map. */
  handle(endpoint: WorkerEndpoint, frame: Frame): boolean {
    if (
      frame.tag === 'response' &&
      (frame.body.kind === 'control' || frame.body.kind === 'control-error')
    ) {
      this.pending.accept(endpoint, frame.body);
      return true;
    }
    if (frame.tag !== 'request' || frame.body.kind !== 'effect-cleanup')
      return false;
    const body = frame.body;
    check(
      endpoint.offer.purpose === 'lifecycle' ||
        this.#releases.get(endpoint)?.has(body.effectId),
      'UNAUTHENTICATED',
    );
    const remainingMs = Math.min(
      body.remainingMs,
      Math.floor(endpoint.end - performance.now()),
    );
    check(remainingMs > 0, 'DEADLINE_EXCEEDED');
    const cleanup = this.run(endpoint, () =>
      this.callbacks.cleanup(body.callbackId, body.effectId, remainingMs),
    );
    const reply = (response: response['body']) => {
      if (!endpoint.stream.closed) {
        try {
          this.send(endpoint, { tag: 'response', body: response });
        } catch (error) {
          this.pending.close();
          this.transport.fail(error);
        }
      }
    };
    void cleanup.then(
      () =>
        reply({
          kind: 'effect-cleaned',
          wireId: body.wireId,
          effectId: body.effectId,
        }),
      (error) =>
        reply({
          kind: 'effect-cleanup-error',
          wireId: body.wireId,
          effectId: body.effectId,
          error: errorRecord(error),
        }),
    );
    return true;
  }
}
