import {
  AcapError,
  check,
  canonical,
  errorRecord,
  CreditWindow,
} from '@alica/acap-contracts';
import type { Value } from '@alica/acap-types';
import type { Frame } from './wire.js';
export type Message = Pick<Frame, 'tag' | 'body'>;
export interface Link {
  readonly signal: AbortSignal;
  readonly end: number;
}
interface Pending {
  endpoint: object;
  accept: (frame: Frame) => boolean;
  receive: (frame: Frame) => void;
  fail: (error: unknown) => void;
  remove: () => void;
}
/** Requester-origin maps are distinct from producer maps. One-item demand
 * prevents speculative iterator reads and bounds each stream below 1 MiB. */
export class Exchanges<E extends object> {
  #pending = new Map<number, Pending>();
  #producers = new Map<
    E,
    Map<number, { credit: CreditWindow; controller: AbortController }>
  >();
  #origins = new WeakMap<E, { ordinal: number; next: number }>();
  #ordinal = 0;
  #incoming = 0;
  constructor(
    readonly send: (endpoint: E, frame: Message) => void,
    readonly link: (endpoint: E) => Link,
    readonly fault: () => void,
    readonly reserve: () => () => void = () => () => {},
  ) {}
  private admit(
    endpoint: E,
    accept: Pending['accept'],
    receive: Pending['receive'],
    fail: Pending['fail'],
    options?: { signal?: AbortSignal; deadlineMs: number },
  ) {
    check(this.#pending.size < 64, 'RESOURCE_EXHAUSTED');
    const original = this.link(endpoint);
    const link = {
      signal: options?.signal
        ? AbortSignal.any([original.signal, options.signal])
        : original.signal,
      end: Math.min(
        original.end,
        options
          ? performance.now() + options.deadlineMs - Date.now()
          : Infinity,
      ),
    };
    check(!link.signal.aborted, 'CANCELLED');
    check(performance.now() < link.end, 'DEADLINE_EXCEEDED');
    let origin = this.#origins.get(endpoint);
    if (!origin) {
      check(this.#ordinal + 1 < 2 ** 26, 'RESOURCE_EXHAUSTED');
      this.#origins.set(
        endpoint,
        (origin = { ordinal: ++this.#ordinal, next: 0 }),
      );
    }
    const id = ((origin.next + 1) * 2 ** 26 + origin.ordinal) * 2 - 1;
    check(Number.isSafeInteger(id), 'RESOURCE_EXHAUSTED');
    const release = this.reserve();
    origin.next++;
    let timer: ReturnType<typeof setTimeout>;
    const abort = () => {
      if (!original.signal.aborted) {
        try {
          this.send(endpoint, {
            tag: 'cancel',
            body: { wireId: id, reason: 'CANCELLED' },
          });
        } catch {
          this.fault();
        }
      }
      const reason = link.signal.reason;
      p.fail(
        new AcapError(reason === 'DEADLINE_EXCEEDED' ? reason : 'CANCELLED'),
      );
    };
    const p: Pending = {
      endpoint,
      accept,
      receive,
      fail: (error) => {
        p.remove();
        fail(error);
      },
      remove: () => {
        if (!this.#pending.delete(id)) return;
        clearTimeout(timer);
        link.signal.removeEventListener('abort', abort);
        release();
      },
    };
    this.#pending.set(id, p);
    link.signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(
      () => p.fail(new AcapError('DEADLINE_EXCEEDED')),
      Math.max(1, link.end - performance.now()),
    );
    return { id, p };
  }
  exchange(
    endpoint: E,
    make: (id: number) => Message,
    accept: Pending['accept'],
    options?: { signal?: AbortSignal; deadlineMs: number },
  ): Promise<Frame> {
    return new Promise((resolve, reject) => {
      const { id, p } = this.admit(
        endpoint,
        accept,
        (frame) => {
          p.remove();
          resolve(frame);
        },
        reject,
        options,
      );
      try {
        this.send(endpoint, make(id));
      } catch (error) {
        p.fail(error);
      }
    });
  }
  stream(
    endpoint: E,
    make: (id: number) => Message,
    options?: { signal?: AbortSignal; deadlineMs: number },
  ): AsyncIterableIterator<Value> {
    let waiter:
      | {
          resolve: (r: IteratorResult<Value>) => void;
          reject: (e: unknown) => void;
        }
      | undefined;
    let terminal = false,
      error: unknown,
      sequence = 0,
      credit = 0;
    const { id, p } = this.admit(
      endpoint,
      (f) =>
        f.tag === 'stream-item' ||
        f.tag === 'stream-end' ||
        (f.tag === 'response' && f.body.kind === 'control-error'),
      (f) => {
        if (f.tag === 'response' && f.body.kind === 'control-error') {
          terminal = true;
          p.remove();
          error = new AcapError(f.body.error.code);
          const w = waiter;
          waiter = undefined;
          w?.reject(error);
          return;
        }
        check(
          f.tag === 'stream-item' || f.tag === 'stream-end',
          'UNAUTHENTICATED',
        );
        check(f.body.itemSequence === sequence++, 'UNAUTHENTICATED');
        if (f.tag === 'stream-item') {
          check(credit === 1 && waiter, 'UNAUTHENTICATED');
          check(
            Buffer.byteLength(canonical(f.body.value)) <= 1048576,
            'RESOURCE_EXHAUSTED',
          );
          credit = 0;
          const w = waiter;
          waiter = undefined;
          w.resolve({ done: false, value: f.body.value });
        } else {
          terminal = true;
          p.remove();
          if (f.body.outcome === 'error')
            error = new AcapError(f.body.error.code);
          const w = waiter;
          waiter = undefined;
          if (w)
            error
              ? w.reject(error)
              : w.resolve({ done: true, value: undefined });
        }
      },
      (e) => {
        terminal = true;
        error = e;
        const w = waiter;
        waiter = undefined;
        w?.reject(e);
      },
      options,
    );
    try {
      this.send(endpoint, make(id));
    } catch (e) {
      p.fail(e);
    }
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: () => {
        if (terminal)
          return error
            ? Promise.reject(error)
            : Promise.resolve({ done: true, value: undefined });
        check(!waiter, 'FAILED_PRECONDITION');
        return new Promise((resolve, reject) => {
          waiter = { resolve, reject };
          credit = 1;
          try {
            this.send(endpoint, {
              tag: 'stream-credit',
              body: { wireId: id, items: 1 },
            });
          } catch (e) {
            p.fail(e);
          }
        });
      },
      return: async () => {
        if (!terminal) {
          terminal = true;
          p.remove();
          const w = waiter;
          waiter = undefined;
          w?.resolve({ done: true, value: undefined });
          this.send(endpoint, {
            tag: 'cancel',
            body: { wireId: id, reason: 'CANCELLED' },
          });
        }
        return { done: true, value: undefined };
      },
    };
  }
  produce(
    endpoint: E,
    wireId: number,
    source: (signal: AbortSignal) => AsyncIterable<Value>,
  ): Promise<void> {
    check(this.#incoming < 64, 'RESOURCE_EXHAUSTED');
    let map = this.#producers.get(endpoint);
    if (!map) this.#producers.set(endpoint, (map = new Map()));
    check(!map.has(wireId), 'UNAUTHENTICATED');
    const controller = new AbortController(),
      credit = new CreditWindow();
    const link = this.link(endpoint);
    const abort = () => {
      controller.abort();
      credit.close();
    };
    map.set(wireId, { credit, controller });
    this.#incoming++;
    link.signal.addEventListener('abort', abort, { once: true });
    if (link.signal.aborted) abort();
    const task = (async () => {
      let sequence = 0;
      let iterator: AsyncIterator<Value> | undefined;
      try {
        while (!controller.signal.aborted) {
          await credit.take();
          iterator ??= source(controller.signal)[Symbol.asyncIterator]();
          const result = await iterator.next();
          check(!controller.signal.aborted, 'CANCELLED');
          if (result.done) {
            this.send(endpoint, {
              tag: 'stream-end',
              body: { wireId, itemSequence: sequence, outcome: 'complete' },
            });
            return;
          }
          check(
            Buffer.byteLength(canonical(result.value)) <= 1048576,
            'RESOURCE_EXHAUSTED',
          );
          this.send(endpoint, {
            tag: 'stream-item',
            body: { wireId, itemSequence: sequence++, value: result.value },
          });
        }
      } catch (error) {
        if (!link.signal.aborted) {
          try {
            this.send(endpoint, {
              tag: 'stream-end',
              body: {
                wireId,
                itemSequence: sequence,
                outcome: 'error',
                error: errorRecord(error),
              },
            });
          } catch {
            this.fault();
          }
        }
      } finally {
        credit.close();
        link.signal.removeEventListener('abort', abort);
        map!.delete(wireId);
        if (!map!.size) this.#producers.delete(endpoint);
        this.#incoming--;
        if (iterator?.return)
          void Promise.resolve()
            .then(() => iterator!.return!())
            .catch(() => {});
      }
    })();
    void task.catch(() => this.fault());
    return task;
  }
  handle(endpoint: E, frame: Frame): boolean {
    if (frame.tag === 'stream-credit' || frame.tag === 'cancel') {
      const producer = this.#producers.get(endpoint)?.get(frame.body.wireId);
      check(producer, 'UNAUTHENTICATED');
      if (frame.tag === 'stream-credit')
        producer.credit.grant(frame.body.items);
      else {
        producer.controller.abort(frame.body.reason);
        producer.credit.close();
      }
      return true;
    }
    if (
      frame.tag !== 'response' &&
      frame.tag !== 'stream-item' &&
      frame.tag !== 'stream-end' &&
      !(frame.tag === 'request' && frame.body.kind === 'event-ack')
    )
      return false;
    if (!('wireId' in frame.body)) return false;
    const id = frame.body.wireId;
    const p = this.#pending.get(id);
    if (!p) {
      const origin = this.#origins.get(endpoint),
        encoded = (id + 1) / 2;
      check(
        origin &&
          Number.isInteger(encoded) &&
          encoded % 2 ** 26 === origin.ordinal &&
          Math.floor(encoded / 2 ** 26) >= 1 &&
          Math.floor(encoded / 2 ** 26) <= origin.next,
        'UNAUTHENTICATED',
      );
      return true;
    }
    check(p.endpoint === endpoint && p.accept(frame), 'UNAUTHENTICATED');
    p.receive(frame);
    return true;
  }
}
