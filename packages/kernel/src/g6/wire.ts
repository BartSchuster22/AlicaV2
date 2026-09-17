import { canonical, check, parse, freeze, unique } from '@alica/acap-contracts';
import { validateFrame, validateOffer } from './schema.js';
import type { Lane } from './schema.js';
import type {
  hello,
  accepted,
  request,
  response,
  error,
  cancel,
  stream_item,
  stream_credit,
  stream_end,
  event,
  ping,
  pong,
  ContextOffer,
} from './wire-schema.js';
export type Frame =
  | hello
  | accepted
  | request
  | response
  | error
  | cancel
  | stream_item
  | stream_credit
  | stream_end
  | event
  | ping
  | pong;
export const MAX_FRAME = 1048576;
export const MAX_PACKET = 4096;
export type Release = () => void;

/** One shared account per physical worker; receive assemblies, queues, writes
 * and stream-credit reservations must all use this account. */
export class WireBudget {
  #bytes = 0;
  #frames = 0;
  #control = 0;
  reserve(bytes: number, control = false): Release {
    check(Number.isSafeInteger(bytes) && bytes > 0, 'INTERNAL');
    if (control) {
      check(this.#control + bytes <= 65536, 'RESOURCE_EXHAUSTED');
      this.#control += bytes;
    } else {
      check(
        this.#frames < 64 && this.#bytes + bytes <= 8388608,
        'RESOURCE_EXHAUSTED',
      );
      this.#frames++;
      this.#bytes += bytes;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (control) this.#control -= bytes;
      else {
        this.#frames--;
        this.#bytes -= bytes;
      }
    };
  }
  get usage(): Readonly<{ bytes: number; frames: number; control: number }> {
    return Object.freeze({
      bytes: this.#bytes,
      frames: this.#frames,
      control: this.#control,
    });
  }
}
function frameChecks(value: unknown, lane: Lane): Frame {
  validateFrame(value, lane);
  const frame = value as Frame;
  if (frame.tag === 'hello' || frame.tag === 'accepted') {
    unique(frame.body.contracts.map((c) => c.capabilityId));
    unique(frame.body.events.map((e) => e.eventType));
    if (frame.tag === 'hello')
      unique([...frame.body.requiredFeatures, ...frame.body.optionalFeatures]);
  }
  return freeze(frame);
}
function body(bytes: Uint8Array, max: number): unknown {
  const value = parse(bytes, max);
  const encoded = canonical(value, max);
  check(Buffer.from(bytes).equals(Buffer.from(encoded))); // Canonical UTF-8 only.
  return value;
}
export function decodeBody(bytes: Uint8Array, lane: Lane): Frame {
  check(
    bytes.byteLength > 0 && bytes.byteLength <= MAX_FRAME,
    'RESOURCE_EXHAUSTED',
  );
  return frameChecks(body(bytes, MAX_FRAME), lane);
}
export function encodeFrame(value: Frame, lane: Lane): Buffer {
  const text = canonical(value, MAX_FRAME);
  frameChecks(parse(text), lane);
  const packet = Buffer.allocUnsafe(4 + Buffer.byteLength(text));
  packet.writeUInt32BE(packet.length - 4);
  packet.write(text, 4, 'utf8');
  return packet;
}
export function encodeOffer(value: ContextOffer): Buffer {
  const text = canonical(value, MAX_PACKET - 4);
  validateOffer(parse(text, MAX_PACKET - 4));
  const packet = Buffer.allocUnsafe(4 + Buffer.byteLength(text));
  packet.writeUInt32BE(packet.length - 4);
  packet.write(text, 4, 'utf8');
  return packet;
}
/** Called only on a complete native recvmsg packet after ancillary checks. */
export function decodeOffer(packet: Uint8Array): ContextOffer {
  check(packet.byteLength > 4 && packet.byteLength <= MAX_PACKET);
  const bytes = Buffer.from(
    packet.buffer,
    packet.byteOffset,
    packet.byteLength,
  );
  check(bytes.readUInt32BE() === bytes.length - 4);
  const value = body(bytes.subarray(4), MAX_PACKET - 4);
  validateOffer(value);
  return freeze(value as ContextOffer);
}
export interface OwnedFrame {
  readonly frame: Frame;
  readonly release: Release;
}
/** Pull-sized stream assembly. The native read must never request more than
 * readSize; oversized feed is rejected rather than copied into an uncharged
 * overflow queue. Completed frame ownership transfers to the dispatcher. */
export class FrameReader {
  #prefix = Buffer.alloc(4);
  #prefixUsed = 0;
  #body: Buffer | undefined;
  #used = 0;
  #release: Release | undefined;
  #started: number | undefined;
  #closed = false;
  constructor(
    readonly budget: WireBudget,
    readonly lane: Lane,
    readonly now: () => number = () => performance.now(),
  ) {}
  get readSize(): number {
    return this.#closed
      ? 0
      : this.#body
        ? this.#body.length - this.#used
        : 4 - this.#prefixUsed;
  }
  checkDeadline(): void {
    if (this.#started !== undefined && this.now() - this.#started >= 2000) {
      this.close();
      check(false, 'DEADLINE_EXCEEDED');
    }
  }
  feed(bytes: Uint8Array): OwnedFrame | undefined {
    check(!this.#closed, 'UNAVAILABLE');
    try {
      this.checkDeadline();
      check(bytes.byteLength > 0 && bytes.byteLength <= this.readSize);
      if (this.#started === undefined) {
        this.#started = this.now();
        this.#release = this.budget.reserve(4, this.lane.startsWith('control'));
      }
      if (!this.#body) {
        this.#prefix.set(bytes, this.#prefixUsed);
        this.#prefixUsed += bytes.byteLength;
        if (this.#prefixUsed < 4) return;
        const length = this.#prefix.readUInt32BE();
        check(length > 0 && length <= MAX_FRAME, 'RESOURCE_EXHAUSTED');
        // Replace the prefix lease atomically in this synchronous turn, before allocation.
        this.#release!();
        this.#release = undefined;
        this.#release = this.budget.reserve(
          length + 4,
          this.lane.startsWith('control'),
        );
        this.#body = Buffer.allocUnsafe(length);
        return;
      }
      this.#body.set(bytes, this.#used);
      this.#used += bytes.byteLength;
      if (this.#used < this.#body.length) return;
      const frame = decodeBody(this.#body, this.lane);
      const release = this.#release!;
      this.#release = undefined;
      this.#body = undefined;
      this.#prefixUsed = this.#used = 0;
      this.#started = undefined;
      return Object.freeze({ frame, release });
    } catch (e) {
      this.close();
      throw e;
    }
  }
  close(): void {
    this.#closed = true;
    this.#release?.();
    this.#release = undefined;
    this.#body = undefined;
  }
}
/** Receiver-owned identity and independent directional sequencing. This check
 * does not authenticate a session; only the supervisor may create this fence
 * after kernel credential/challenge verification. */
export class EndpointFence {
  #sequence: number;
  #closed = false;
  constructor(
    readonly sessionId: string,
    readonly generation: number,
    readonly contextId: string,
    firstSequence = 1,
  ) {
    check(
      Number.isSafeInteger(firstSequence) && firstSequence >= 0,
      'INTERNAL',
    );
    this.#sequence = firstSequence;
  }
  accept(frame: Frame): void {
    check(
      !this.#closed &&
        frame.sessionId === this.sessionId &&
        frame.generation === this.generation &&
        frame.contextId === this.contextId &&
        frame.sequence === this.#sequence,
      'UNAUTHENTICATED',
    );
    if (this.#sequence === Number.MAX_SAFE_INTEGER) this.#closed = true;
    else this.#sequence++;
  }
  close(): void {
    this.#closed = true;
  }
}
