import { AcapError, check } from '@alica/acap-contracts';
import type { Disposer } from '@alica/acap-types';

export interface EffectScope {
  readonly id: string;
  readonly generation: number;
}
export interface EffectAuthority<E extends object> {
  /** Receiver-owned endpoint lookup; must validate session, instance, scope,
   * exact generation, OPEN state and still-open acquisition phase. */
  registerScope(endpoint: E, scopeId: string, generation: number): EffectScope;
  /** Release never grants access to a foreign scope/resource. Closing scope
   * rollback is framework bookkeeping, not a fresh registration. */
  releaseScope(endpoint: E, scope: EffectScope): void;
  /** The existing Host.own ledger is the sole capacity and ordering authority.
   * Its returned disposer caches first terminal result/report accounting. */
  own(scope: EffectScope, cleanup: Disposer, select?: () => void): Disposer;
  /** Select a lifecycle lane, or the broker-linked release endpoint for inline
   * rollback, under the original selected deadline and causal depth. */
  dispatch(
    effectId: string,
    callbackId: string,
    scope: EffectScope,
    inline?: E,
  ): Promise<void>;
  failSession(): void;
}
interface EffectRecord<E> {
  scope: EffectScope;
  callbackId: string;
  release: Disposer;
  inline?: E;
  selected?: boolean;
  selectedInline?: E;
}
/** One instance/session/generation per object. It intentionally has no second
 * maxEffects counter: provide/on/custom callbacks all reserve via Host.own.
 * Records live until physical instance teardown, just like Host.effects. */
export class BrokerEffects<E extends object> {
  #next = 0;
  #records = new Map<string, EffectRecord<E>>();
  #callbacks = new Set<string>();
  constructor(readonly authority: EffectAuthority<E>) {}
  register(
    endpoint: E,
    scopeId: string,
    generation: number,
    callbackId: string,
  ): string {
    const scope = this.authority.registerScope(endpoint, scopeId, generation);
    if (this.#callbacks.has(callbackId)) {
      this.authority.failSession();
      throw new AcapError('UNAUTHENTICATED');
    }
    check(this.#next < Number.MAX_SAFE_INTEGER, 'RESOURCE_EXHAUSTED');
    const effectId = 'effect' + ++this.#next;
    // own is synchronous and atomic. A rejection inserts neither a callback
    // token nor a resource record; an accepted ID is never rebound/replayed.
    let record!: EffectRecord<E>;
    const select = () => {
      if (record.selected) return;
      record.selected = true;
      if (record.inline) record.selectedInline = record.inline;
    };
    const release = this.authority.own(
      scope,
      () => {
        select();
        return this.authority.dispatch(
          effectId,
          callbackId,
          scope,
          record.selectedInline,
        );
      },
      select,
    );
    record = { scope, callbackId, release };
    this.#records.set(effectId, record);
    this.#callbacks.add(callbackId);
    return effectId;
  }
  release(endpoint: E, effectId: string): Promise<void> {
    const record = this.#records.get(effectId);
    check(record, 'PERMISSION_DENIED');
    this.authority.releaseScope(endpoint, record.scope);
    // Only the first release installs the inline lane. Concurrent callers join
    // Host's cached cleanup task and cannot retarget an in-flight callback.
    if (!record.selected) record.inline ??= endpoint;
    return record.release();
  }
  get size(): number {
    return this.#records.size;
  }
}
