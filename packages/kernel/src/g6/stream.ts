import { canonical, check } from '@alica/acap-contracts';
import type { Lane } from './schema.js';
import type { Lease } from './native.js';
import { native } from './native.js';
import {
  FrameReader,
  EndpointFence,
  encodeFrame,
  MAX_FRAME,
  WireBudget,
} from './wire.js';
import type { Frame, OwnedFrame } from './wire.js';

/** One rate account per physical session, shared across its endpoints. */
export class FrameRate {
  #start = performance.now();
  #count = 0;
  take(): void {
    const now = performance.now();
    if (now - this.#start >= 1000) {
      this.#start = now;
      this.#count = 0;
    }
    check(++this.#count <= 1024, 'RESOURCE_EXHAUSTED');
  }
}
/** No uv/private handle ownership: native read/write only. Supervisor pumps all
 * channels fairly; worker sync RPC may pump the same object without a second
 * stream reader racing it. Native lease identity fences numeric FD reuse. */
export class NativeStream {
  readonly reader: FrameReader;
  readonly fence: EndpointFence;
  #closed = false;
  #out: {
    bytes: Buffer;
    offset: number;
    release: () => void;
    start: number;
  }[] = [];
  #queued = 0;
  constructor(
    readonly lease: Lease,
    readonly budget: WireBudget,
    readonly incoming: Lane,
    readonly outgoing: Lane,
    sessionId: string,
    generation: number,
    contextId: string,
    readonly rate: FrameRate,
    firstSequence = 1,
  ) {
    this.reader = new FrameReader(budget, incoming);
    this.fence = new EndpointFence(
      sessionId,
      generation,
      contextId,
      firstSequence,
    );
  }
  get closed() {
    return this.#closed;
  }
  get pendingWrites() {
    return this.#out.length;
  }
  send(frame: Frame): void {
    check(!this.#closed, 'UNAVAILABLE');
    const size = Buffer.byteLength(canonical(frame, MAX_FRAME)) + 4;
    check(this.#queued + size <= MAX_FRAME + 4, 'RESOURCE_EXHAUSTED');
    const release = this.budget.reserve(
      size,
      this.outgoing.startsWith('control'),
    );
    try {
      const bytes = encodeFrame(frame, this.outgoing);
      this.#out.push({ bytes, offset: 0, release, start: performance.now() });
      this.#queued += size;
    } catch (error) {
      release();
      throw error;
    }
    this.flush();
  }
  flush(): void {
    check(!this.#closed, 'UNAVAILABLE');
    for (let i = 0; i < 16 && this.#out.length; i++) {
      const item = this.#out[0]!;
      check(performance.now() - item.start < 2000, 'DEADLINE_EXCEEDED');
      const written = native.write(
        this.lease,
        item.bytes.subarray(item.offset),
      );
      if (!written) break;
      item.offset += written;
      if (item.offset === item.bytes.length) {
        this.#queued -= item.bytes.length;
        item.release();
        this.#out.shift();
      }
    }
  }
  /** Caller retains frame budget until synchronous dispatch/validation ends. */
  receive(): OwnedFrame | undefined {
    check(!this.#closed, 'UNAVAILABLE');
    this.reader.checkDeadline();
    // At most prefix and body reads, never an unbounded read-and-discard loop.
    for (let i = 0; i < 2; i++) {
      const bytes = native.read(this.lease, this.reader.readSize);
      if (bytes === null) return;
      check(bytes.length, 'UNAVAILABLE');
      const owned = this.reader.feed(bytes);
      if (owned) {
        try {
          this.fence.accept(owned.frame);
          this.rate.take();
          return owned;
        } catch (error) {
          owned.release();
          throw error;
        }
      }
    }
    return;
  }
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.reader.close();
    this.fence.close();
    for (const item of this.#out) item.release();
    this.#out = [];
    this.#queued = 0;
    native.close(this.lease);
  }
}
