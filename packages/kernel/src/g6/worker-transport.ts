import { readFileSync, closeSync } from 'node:fs';
import { pbkdf2 } from 'node:crypto';
import { check, canonical, parse } from '@alica/acap-contracts';
import type { Manifest, Descriptor, EventDescriptor } from '@alica/acap-types';
import { native } from './native.js';
import type { Lease } from './native.js';
import { NativeStream, FrameRate } from './stream.js';
import { decodeOffer, WireBudget } from './wire.js';
import type { Frame } from './wire.js';
import type { ContextOffer, hello, accepted } from './wire-schema.js';

interface Capsule {
  sessionId: string;
  generation: number;
  hello: hello['body'];
  manifest: Manifest;
  modules: [string, string][];
  descriptors: Descriptor[];
  events: EventDescriptor[];
  identity: Record<string, string>;
  readPaths: string[];
  runtime: { activationMs: number; maxCallMs: number };
}
export interface WorkerEndpoint {
  readonly offer: ContextOffer;
  readonly stream: NativeStream;
  readonly controller: AbortController;
  readonly end: number;
}
/** Trusted bootstrap, before any package evaluation. Launcher's inherited
 * Landlock protects all threads; the final seal is TSYNC, not a replacement. */
export class WorkerTransport {
  readonly capsule: Capsule;
  readonly budget = new WireBudget();
  readonly rate = new FrameRate();
  readonly control: NativeStream;
  readonly carrier: Lease;
  readonly contexts = new Map<string, WorkerEndpoint>();
  #challenge: string;
  #controlSequence = 1;
  #wireId = 0;
  #lastContext = 0;
  #timer: ReturnType<typeof setInterval> | undefined;
  #closed = false;
  #accepted: accepted | undefined;
  #accept!: (frame: accepted) => void;
  #reject!: (error: unknown) => void;
  readonly ready: Promise<accepted>;
  #started = performance.now();
  onFrame: (endpoint: WorkerEndpoint, frame: Frame) => void = () => {
    throw Error('no dispatcher');
  };
  onControl: (frame: Frame) => void = () => {
    throw Error('unexpected control');
  };
  onOffer: (endpoint: WorkerEndpoint) => void = () => {};
  onFailure: () => void = () => {
    process.exitCode = 1;
  };
  constructor() {
    this.capsule = parse(readFileSync(5), 16777216) as unknown as Capsule;
    this.#challenge = readFileSync(4, 'utf8');
    closeSync(4);
    closeSync(5);
    this.carrier = native.adopt(6, 5);
    this.control = new NativeStream(
      native.adopt(3, 1),
      this.budget,
      'controlToProvider',
      'controlToBroker',
      this.capsule.sessionId,
      this.capsule.generation,
      'control',
      this.rate,
      0,
    );
    this.ready = new Promise((resolve, reject) => {
      this.#accept = resolve;
      this.#reject = reject;
    });
    void this.ready.catch(() => {});
  }
  async start(): Promise<accepted> {
    await Promise.all(
      [1, 2].map(
        () =>
          new Promise<void>((resolve, reject) => {
            pbkdf2('g6-bootstrap', 'g6-bootstrap', 1, 16, 'sha256', (error) =>
              error ? reject(error) : resolve(),
            );
          }),
      ),
    );
    native.seal(this.capsule.readPaths, 6, Number(process.argv[2]));
    this.control.send({
      schemaVersion: 'acap.ipc/v1',
      tag: 'hello',
      sessionId: this.capsule.sessionId,
      generation: this.capsule.generation,
      contextId: 'control',
      sequence: 0,
      body: { ...this.capsule.hello, challenge: this.#challenge },
    });
    this.#challenge = '';
    this.#timer = setInterval(() => {
      try {
        this.pump();
      } catch (error) {
        this.fail(error);
      }
    }, 2);
    return this.ready;
  }
  get accepted(): accepted | undefined {
    return this.#accepted;
  }
  controlSend(frame: Frame): void {
    this.control.send(frame);
  }
  nextControlSequence(): number {
    check(
      this.#controlSequence < Number.MAX_SAFE_INTEGER,
      'RESOURCE_EXHAUSTED',
    );
    return this.#controlSequence++;
  }
  private header() {
    return {
      schemaVersion: 'acap.ipc/v1' as const,
      sessionId: this.capsule.sessionId,
      generation: this.capsule.generation,
      contextId: 'control' as const,
      sequence: this.nextControlSequence(),
    };
  }
  /** Bounded native wait used by synchronous SDK registration. This is the
   * same transport reader as the timer pump, not a private libuv handle loop.
   * All endpoints and the reserved control lane continue making progress. */
  waitTurn(): void {
    check(!this.#closed, 'UNAVAILABLE');
    native.poll(
      [
        this.control.lease,
        this.carrier,
        ...[...this.contexts.values()].map((endpoint) => endpoint.stream.lease),
      ],
      2,
    );
    this.pump();
  }
  /** Also used by a bounded synchronous framework RPC. Never has a second
   * reader or Promise wait spinning an unbounded application queue. */
  pump(): void {
    check(!this.#closed, 'UNAVAILABLE');
    if (!this.#accepted)
      check(performance.now() - this.#started < 3000, 'DEADLINE_EXCEEDED');
    this.control.flush();
    for (let i = 0; i < 4; i++) {
      const owned = this.control.receive();
      if (!owned) break;
      try {
        const frame = owned.frame;
        if (!this.#accepted) {
          check(frame.tag === 'accepted', 'UNAUTHENTICATED');
          const {
            challenge: _c,
            requiredFeatures: _r,
            optionalFeatures: _o,
            ...expected
          } = this.capsule.hello;
          const {
            negotiatedFeatures,
            limits: _l,
            effectLimit: _e,
            rootScopeId: _s,
            scopeGeneration: _g,
            ...actual
          } = frame.body;
          check(
            canonical(actual) === canonical(expected) &&
              canonical(negotiatedFeatures) ===
                canonical([
                  'wire.contexts',
                  'wire.sdkresults',
                  'wire.scopedeffects',
                ]),
            'UNAUTHENTICATED',
          );
          this.#accepted = frame;
          this.#accept(frame);
        } else if (frame.tag === 'ping')
          this.control.send({
            ...this.header(),
            tag: 'pong',
            body: frame.body,
          });
        else this.onControl(frame);
      } finally {
        owned.release();
      }
    }
    if (!this.#accepted) return;
    // One entire ancillary packet, never a prefix-read on a seqpacket socket.
    const received = native.receiveOffer(this.carrier);
    if (received) {
      let transferred = false;
      try {
        const offer = decodeOffer(received.data);
        check(
          offer.sessionId === this.capsule.sessionId &&
            offer.generation === this.capsule.generation,
          'UNAUTHENTICATED',
        );
        // Broker context IDs are a monotonic watermark, not an unbounded replay set.
        check(/^c[1-9][0-9]*$/.test(offer.contextId), 'UNAUTHENTICATED');
        const id = Number(offer.contextId.slice(1));
        check(
          Number.isSafeInteger(id) &&
            id > this.#lastContext &&
            this.contexts.size < 9,
          'UNAUTHENTICATED',
        );
        this.#lastContext = id;
        const stream = new NativeStream(
          received.handle,
          this.budget,
          'workToProvider',
          'workToBroker',
          offer.sessionId,
          offer.generation,
          offer.contextId,
          this.rate,
        );
        const endpoint = {
          offer,
          stream,
          controller: new AbortController(),
          end: performance.now() + offer.remainingMs,
        };
        this.contexts.set(offer.contextId, endpoint);
        transferred = true;
        check(this.#wireId < Number.MAX_SAFE_INTEGER, 'RESOURCE_EXHAUSTED');
        this.control.send({
          ...this.header(),
          tag: 'request',
          body: {
            kind: 'context-ready',
            wireId: ++this.#wireId,
            offerId: offer.offerId,
            readyContextId: offer.contextId,
          },
        });
        this.onOffer(endpoint);
      } finally {
        if (!transferred) native.close(received.handle);
      }
    }
    for (const endpoint of [...this.contexts.values()]) {
      if (performance.now() >= endpoint.end) {
        this.closeEndpoint(endpoint, 'DEADLINE_EXCEEDED');
        continue;
      }
      let owned;
      try {
        endpoint.stream.flush();
        owned = endpoint.stream.receive();
      } catch (error) {
        // Only a transport EOF is treated as broker context closure. An
        // application/dispatcher callback throwing UNAVAILABLE must not be
        // misclassified as EOF and silently leave the session running.
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'UNAVAILABLE'
        ) {
          this.closeEndpoint(endpoint, 'UNAVAILABLE');
          continue;
        }
        throw error;
      }
      if (!owned) continue;
      try {
        this.onFrame(endpoint, owned.frame);
      } finally {
        owned.release();
      }
    }
  }
  closeEndpoint(endpoint: WorkerEndpoint, reason: string): void {
    endpoint.controller.abort(reason);
    endpoint.stream.close();
    this.contexts.delete(endpoint.offer.contextId);
  }
  fail(error: unknown): void {
    this.#reject(error);
    this.close();
    this.onFailure();
  }
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    clearInterval(this.#timer);
    for (const endpoint of this.contexts.values())
      this.closeEndpoint(endpoint, 'UNAVAILABLE');
    this.control.close();
    native.close(this.carrier);
  }
}
