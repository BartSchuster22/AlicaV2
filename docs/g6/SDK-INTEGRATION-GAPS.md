# G6 SDK wire-mapping gaps — decision required

Status: implementation finding and proposed correction, NOT an approved R2 amendment.
G6 remains incomplete. Frozen G1 and public SDK 0.1.0 are unchanged; Host/Trust
continue rejecting IPC execution until a complete adapter is implemented and tested.

## Verified mismatches

1. `KernelContext.emit()` returns `Promise<{ admitted: number }>`, computed by
   Host from broker-owned subscription admission. The approved IPC schema's
   publication frame has a request wire ID, but its closed control-result union
   contains bound/absent/registered/secret/subscribed/scope/ack only. No variant
   carries a publication count. Returning zero, counting locally, smuggling JSON
   into secret values or forging invoke replies would not preserve the contract.
2. Scope-owned `effect()` cleanup callbacks must run on child-scope destruction,
   independently of whole-provider disposal. The approved schema has no effect
   registration request or scoped resource-cleanup dispatch. Lifecycle actions
   activate/quiesce/dispose have no resource selector. Whole-instance disposal or
   undocumented application-call encodings cannot silently substitute for this.

References: packages/acap-types/src/index.ts (KernelContext),
packages/kernel/src/index.ts (effect ownership, destroyScope, emit),
docs/g6/draft/frames.schema.json (request/response/event unions).

## Recommended correction for concrete schema review

Add an explicit private publication result `{ kind: "published", admitted }`,
correlated with the publication wire ID on its originating endpoint. `admitted`
must be a nonnegative safe integer supplied only by broker admission, not worker
claims; wrong pending-operation kind, direction and extra fields fail closed.

Add explicit bounded effect-registration and broker-directed effect-cleanup
messages. The broker must own the resource ID and associate it with physical
session/generation, authorized scope and registered worker callback. Worker
callback tokens alone must confer no cross-scope authority. Define exactly-once
retirement, acquisition rollback, reverse-order scope disposal, manual disposal,
acknowledgement versus actual cleanup, timeout and shared-worker failure semantics.
The concrete revision must select and test finite effect/callback queue limits,
including behavior when the reserved lifecycle lane is occupied; it must not
invent an unbounded cleanup channel or alter successful reentrancy guarantees.

Update closed directional schemas, generated private types, examples, model and
negative tests, and IPC-PROFILE/ADR-013 together. This is a private IPC addendum,
not permission to change frozen G1/public SDK, authority boundaries, native
confinement or provider state/concurrency semantics. Concrete review/approval
precedes enabling revised wire behavior.

## Acceptance required after the correction

One unchanged public SDK consumer suite on both factories must prove actual
publication counts (including no subscribers, rejected/overloaded subscriptions)
and child-scope cleanup, manual cleanup, failed acquisition, cleanup error/timeout,
and retained unrelated scopes. Hostile tests must reject forged resource ownership,
replays, wrong generation, duplicate terminal outcomes and malformed publication
results. All existing G6 authentication, concurrency, resource and cleanup matrix
rows still apply. Schema/model/component passes alone never close G6.
