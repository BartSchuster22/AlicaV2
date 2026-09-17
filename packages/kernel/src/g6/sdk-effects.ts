import { AcapError, check, normalized } from '@alica/acap-contracts';
import type { Disposer } from '@alica/acap-types';

interface Callback {
  cleanup?: Disposer;
  effectId?: string;
  task?: Promise<void>;
}

/** One ledger per physical worker. Retired accepted records stay charged;
 * closures are released at the first terminal result, not at scope disposal.
 * The broker remains the authority for the shared provide/on/effect budget. */
export class CallbackLedger {
  #next = 0;
  #callbacks = new Map<string, Callback>();
  #effects = new Map<string, string>();
  constructor(
    readonly limit: number,
    readonly failSession: () => void,
  ) {
    check(Number.isInteger(limit) && limit > 0 && limit <= 4096);
  }
  reserve(cleanup: Disposer): string {
    check(typeof cleanup === 'function');
    check(this.#callbacks.size < this.limit, 'RESOURCE_EXHAUSTED');
    check(this.#next < Number.MAX_SAFE_INTEGER, 'RESOURCE_EXHAUSTED');
    const token = 'cb' + ++this.#next;
    this.#callbacks.set(token, { cleanup });
    return token;
  }
  private fault(): never {
    this.failSession();
    throw new AcapError('UNAUTHENTICATED');
  }
  /** May be called by cleanup before the originating registration RPC returns. */
  bind(callbackId: string, effectId: string): Callback {
    const callback = this.#callbacks.get(callbackId);
    if (!callback || (callback.effectId && callback.effectId !== effectId))
      this.fault();
    const prior = this.#effects.get(effectId);
    if (prior && prior !== callbackId) this.fault();
    callback.effectId = effectId;
    this.#effects.set(effectId, callbackId);
    return callback;
  }
  /** Only a definite broker rejection may retire an unaccepted reservation.
   * A lost registration reply is not a rejection and must fail the session. */
  reject(callbackId: string): void {
    const callback = this.#callbacks.get(callbackId);
    if (!callback || callback.effectId) this.fault();
    this.#callbacks.delete(callbackId);
  }
  cleanup(
    callbackId: string,
    effectId: string,
    remainingMs: number,
  ): Promise<void> {
    check(
      Number.isInteger(remainingMs) && remainingMs > 0 && remainingMs <= 30000,
    );
    const callback = this.bind(callbackId, effectId);
    if (callback.task) return callback.task;
    const cleanup = callback.cleanup!;
    // Install the join promise before invoking arbitrary callback code.
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    callback.task = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void callback.task.catch(() => {});
    let terminal = false;
    const finish = (ok: boolean, error?: unknown) => {
      if (terminal) return;
      terminal = true;
      clearTimeout(timer);
      delete callback.cleanup;
      if (ok) resolve();
      else reject(normalized(error));
    };
    const timer = setTimeout(() => {
      finish(false, new AcapError('DEADLINE_EXCEEDED'));
      this.failSession();
    }, remainingMs);
    void Promise.resolve()
      .then(cleanup)
      .then(
        () => finish(true),
        (error) => finish(false, error),
      );
    return callback.task;
  }
  inspect(): Readonly<{ records: number; closures: number; bindings: number }> {
    return Object.freeze({
      records: this.#callbacks.size,
      closures: [...this.#callbacks.values()].filter((x) => x.cleanup).length,
      bindings: this.#effects.size,
    });
  }
}

export interface EffectRPC {
  /** Must synchronously return a definite reply or throw. Unknown outcome
   * implementations must quarantine the session, not issue another request. */
  register(
    scopeId: string,
    generation: number,
    callbackId: string,
    end: number,
  ): string;
  release(effectId: string): Promise<void>;
  isDefiniteRejection(error: unknown): boolean;
  failSession(): void;
}

/** Public SDK acquisition semantics, without serializing callback functions. */
export class WorkerEffects {
  constructor(
    readonly callbacks: CallbackLedger,
    readonly rpc: EffectRPC,
  ) {}
  async acquire<T>(
    scopeId: string,
    generation: number,
    remainingMs: number,
    acquire: (registerCleanup: (cleanup: Disposer) => void) => Promise<T>,
  ): Promise<T> {
    check(
      Number.isInteger(remainingMs) && remainingMs > 0 && remainingMs <= 30000,
    );
    const end = performance.now() + remainingMs;
    const owned: string[] = [];
    let accepting = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() =>
          acquire((cleanup): void => {
            check(accepting && performance.now() < end, 'FAILED_PRECONDITION');
            const callbackId = this.callbacks.reserve(cleanup);
            let effectId: string;
            try {
              effectId = this.rpc.register(
                scopeId,
                generation,
                callbackId,
                end,
              );
            } catch (error) {
              if (this.rpc.isDefiniteRejection(error))
                this.callbacks.reject(callbackId);
              else this.rpc.failSession();
              throw error;
            }
            this.callbacks.bind(callbackId, effectId);
            owned.push(effectId);
          }),
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            accepting = false;
            reject(new AcapError('DEADLINE_EXCEEDED'));
          }, remainingMs);
        }),
      ]);
      check(performance.now() < end, 'DEADLINE_EXCEEDED');
      return result;
    } catch (error) {
      // Close BEFORE awaiting cleanup: delayed acquire continuations cannot
      // append records while reverse rollback is in flight.
      accepting = false;
      for (const effectId of owned.reverse()) {
        try {
          await this.rpc.release(effectId);
        } catch {
          /* Host owns and records each independent cleanup failure. */
        }
      }
      throw normalized(error);
    } finally {
      accepting = false;
      clearTimeout(timer);
    }
  }
}
