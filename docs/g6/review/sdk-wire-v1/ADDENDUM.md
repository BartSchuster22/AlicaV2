# G6 private-wire SDK addendum — concrete review candidate v1

**Status: UNAPPROVED, REVIEW ONLY. No runtime behavior or active schema changed.**
Base checkpoint: `3de792997e62f5c28f2f623e9d210993e589ac50`.
This directory is deliberately outside `docs/g6/draft/`, runtime imports,
`tools/generate-g6-wire.mjs`, and the root check pipeline. Approving preparation
of this document is NOT approval to implement or activate it. G6 remains incomplete.

## Review decision

Approve/revise the exact candidate messages, mandatory minor/feature barrier,
broker-owned effect ledger, synchronous registration mapping, cleanup-lane reuse,
and finite bounds below before implementing the SDK adapter. Public SDK 0.1.0,
frozen G1, R2 process authentication/confinement, one shared stateful provider,
4 ordinary + 4 nested + 1 lifecycle contexts, and successful bounded A→B→A remain
unchanged. The candidate does not introduce a second cleanup transport or replica.

Files:
- `frames.schema.json`: complete standalone closed/directional candidate schema.
- `build_candidate.py`: deterministic transformation of the unchanged active schema;
  `--check` verifies the snapshot and never writes the active schema.
- `baseline.sha256.json`: protected current schema/runtime/SDK/native inputs.
- `test_review.py`, `review_model.py`: executable schema and abstract state tests.
- `ACCEPTANCE.md`: test coverage and mandatory later real-runtime tests.
- `RESULTS.md`: actual target execution receipt, added after verification.

## 1. Negotiation and unchanged framing

Candidate hello/accepted require `protocolMajor:1, protocolMinor:1` and all of
`wire.contexts`, `wire.sdkresults`, `wire.scopedeffects` in the required/negotiated
feature array. Existing `acap.ipc/v1` envelope framing remains, but unsupported
minor/features fail with INCOMPATIBLE_VERSION; no minor-0 downgrade or partial
SDK fallback. Optional features cannot substitute for the mandatory set.
The accepted body adds `effectLimit`, integer 1..4096, exactly the validated
Host `maxEffects` for this instance. It is not a new per-worker lower limit.
An unrecognized required feature still fails negotiation, regardless of shape.

Existing canonical encoding, frame/byte/rate limits, immutable endpoint identity,
sequence numbers and separate requester-origin maps remain authoritative. The
new messages have no parent/caller claims, numeric FD, arbitrary cleanup code,
transport handle, or permission-grant field. Schema shape is not authentication.
All new messages are WORK traffic; neither control direction admits them.

## 2. Exact new bodies and legal direction

Every field shown is required; each object is closed. `wireId` is positive safe
integer; IDs use the existing 1..128 character identifier grammar. `remainingMs`
is integer 1..30000. Errors use the unchanged frozen error schema, including its
required correlationId; broker normalizes diagnostics before exposing results.

| Tag | Direction | Body |
|---|---|---|
| response | broker→worker | `{kind:"control",wireId,value:{kind:"published",admitted}}` |
| request | worker→broker | `{kind:"effect-register",wireId,scopeId,scopeGeneration,callbackId}` |
| response | broker→worker | `{kind:"control",wireId,value:{kind:"effect-registered",effectId}}` |
| request | worker→broker | `{kind:"effect-release",wireId,effectId}` |
| request | broker→worker | `{kind:"effect-cleanup",wireId,effectId,callbackId,remainingMs}` |
| response | worker→broker | `{kind:"effect-cleaned",wireId,effectId}` |
| response | worker→broker | `{kind:"effect-cleanup-error",wireId,effectId,error}` |
| response | broker→worker | `{kind:"control",wireId,value:{kind:"effect-released",effectId}}` |

`published.admitted` is integer 0..9007199254740991. `scopeGeneration` is positive
safe integer and must equal the broker record, not merely pass the shape check.
Denied/failed scoped requests use existing `control-error`, correlated with that
request. Cleanup exceptions use effect-cleanup-error, NOT whole-lifecycle replies.
A release returns effect-released only after successful actual callback completion;
known cleanup failure returns control-error with that first terminal error.

The candidate generator extends generic and appropriate directional unions only;
control selections and all existing R2 numeric limit definitions remain identical.
Its separate `$id` is a review artifact identity, not a deployed endpoint.

## 3. Publication result semantics

The existing event/publish request is unchanged. The broker validates publisher,
scope, contract digest, payload and grant, then uses the **same Host.emit admission
algorithm**. Return the exact count once on the request's originating endpoint and
wire ID, without waiting for callback completion. Zero is a legitimate result.

Count subscriptions admitted to the bounded broker delivery queues, not callbacks
completed or recipients guessed by the worker. Host currently filters live/matching/
active/visible subscriptions, retires an overflowing subscription and excludes it
from this count. Delivery-time grant/revocation checks and callback failures happen
later; a subsequently rejected delivery does not rewrite the admission receipt.
This addendum does not silently move those baseline authorization checks or claim
that admission proves delivery. No replay on lost reply and no fake invoke/secret
encoding. Pending operation kind must be `publish`; an ack/bind result cannot settle
emit, and a published result cannot settle a bind. Late terminal responses cannot
produce a second SDK result or additional event admission.

## 4. Registration, synchronous SDK semantics and acquisition rollback

`effect(acquire)` and its `registerCleanup(disposer):void` signature are unchanged.
The worker reserves a local callback token before sending effect-register. Tokens
are fresh per physical session, never reused, bounded by the same ledger budget.
The callback is never serialized. Registration MUST synchronously complete or throw
before registerCleanup returns: a fire-and-forget or Promise-returning substitute
would hide capacity/scope errors and violate the SDK. Native worker wait/pump must
continue trusted transport progress; this document does not implement that pump.

Broker admission atomically checks authenticated instance, endpoint-authorized
scope, exact generation, OPEN scope and registration phase; reserves one slot in
the instance's existing Host effect ledger; allocates a broker effectId; and appends
it in actual registration order. The ledger binding is
`(physical session,generation,effectId,scope,generation,callbackId,order,state)`.
Worker callbackId is only a demultiplexing token; it grants no scope or cleanup
authority. Duplicate accepted tokens are a protocol fault. Well-formed foreign
resource requests receive PERMISSION_DENIED and never mutate the victim ledger.

**Cross-endpoint race:** scope destruction may dispatch cleanup before the worker
consumes the registration reply on another work endpoint. Therefore effect-cleanup
includes BOTH broker effectId and the already reserved callbackId. The worker may
bind them on the first authenticated broker message, and must require the later
registration reply/cleanup to assert the same one-to-one binding. Unknown callback,
conflicting binding, or callback-token reuse fails the offending physical session.
No second user callback invocation occurs because of arrival order.

A rejected registration owns no broker effect; no partial effect reservation remains.
The acquisition must roll back resources that were never successfully registered,
as it must for an inproc registerCleanup exception. An accepted registration with
an unknown delivery outcome is NOT retried: retain its charge/callback state and
fail/quarantine the session for bounded termination. No stale acquisition becomes
new provider-owned background work after its invocation expires.

The acquisition window is the existing activationMs bound, additionally subject to
its original R2 invocation/context budget. On failed acquisition, release successful
registrations in reverse acquisition order and preserve the original acquisition
error, recording each cleanup error independently. `effect-release` is private SDK
bookkeeping for this rollback (and framework-owned disposal), not a new public API.
Registration after the acquisition window closes throws FAILED_PRECONDITION.

## 5. Ownership, cleanup order and exactly-once boundary

States: `OWNED → SELECTED → RUNNING → TERMINAL`, with a cached first terminal result.
A scope-close/manual-framework-release/instance-dispose race joins the same cleanup
operation; it never launches a second callback. Broker reply correlation includes
resource, physical session/generation, exact endpoint, requester origin and wire ID.
Retired exact-context duplicates are discarded; wrong-resource or wrong-endpoint
pending replies are protocol faults. Sequence replay rules remain unchanged.

Scope destruction marks affected scopes CLOSING and revokes/cancels scope work first,
then walks descendants and effects in the same reverse order as Host.destroyScope.
Cooperative child cleanup does not dispose unrelated scopes or the entire instance.
No cleanup callback can register new effects or acquire new authority in CLOSING
scope. It may use another independently live scope only with that scope's existing
authority; no special bypass accompanies cleanup. Whole-instance disposal joins
already completed effects and uses their cached results for accounting.

This is **at-most-once framework dispatch**, not proof that malicious plugin code
performed cleanup, and not a prohibition on plugin code directly calling its own
original function. Public provide/on disposers already use Host-owned records;
they keep their existing withdraw/unsubscribe mapping and consume the SAME effect
budget, not a second remote quota. Do not add a hidden public effect disposer API.

## 6. Cleanup transport and finite accounting

| Resource | Exact candidate rule |
|---|---|
| Registered effects per instance | Host maxEffects, 1..4096, shared with provide/on and all scopes |
| Retired effect records | Still charged until instance teardown, matching current Host effects.length behavior |
| Callback closures | At most accepted effect slots plus already charged pending registrations; release closure after terminal result |
| Pending SDK RPCs | At most 64 per physical worker across endpoints; reserve before enqueue, RESOURCE_EXHAUSTED before side effects |
| Active root cleanup traversal | One per physical worker; recursive/joined disposal uses the same traversal, not a second root waiter |
| Deferred affected-scope markers | Coalesced by existing scope record, at most Host maxScopes ≤256; no list per repeated close request |
| Effect cleanup queue | References to existing effect records, at most maxEffects, no duplicate entry per waiter |
| Cleanup contexts/descriptors | Existing ONE reserved lifecycle context; no new carrier purpose or descriptor budget |
| Inline cleanup depth | Combined causal call/cleanup depth ≤8; depth 9 fails promptly before dispatch |
| Cleanup messages/bytes | Existing shared 64-frame/8-MiB accounting and 1-MiB stream cap; not control-reserve traffic |
| Callback budget | min(Host cleanupMs, remaining enclosing deadline if any), max 30000 ms |

A new root scope cleanup uses the existing lifecycle slot. If activation/disposal is
already running, required descendant cleanup runs sequentially WITHIN that same
broker-owned lifecycle endpoint and its remaining budget. Failed acquisition's
release/cleanup exchange runs within the requesting work endpoint; it must not wait
for a fresh slot owned by its ancestor. The secondary effect-cleanup frame is legal
on a non-lifecycle endpoint ONLY when broker state links it to that endpoint's
pending effect-release. No arbitrary invocation is legal merely because a cleanup
callback is running. Nested cleanup/outbound work obeys the existing causal depth
and reentrant admission rules; exhaustion fails promptly, not behind its ancestor.

The per-effect cleanup clock starts at SELECTED, before waiting for an occupied
lifecycle slot or writing the frame; enqueue/offer/delivery cannot reset it. Only the
next ordered effect is selected; do not start every effect's individual timeout at
scope-close and thereby change sequential Host cleanup semantics. A containing
unload budget still bounds the whole traversal. On an independent busy lifecycle
slot, retain a single charged selected record under its original clock, not an
unbounded lifecycle queue. Operator request coalescing and bounded caller admission
are required; promises must not accumulate outside the stated queues.

## 7. Error, timeout, death and accounting

An ordinary callback exception produces one failedDisposers entry and restartRequired,
but the broker continues remaining cooperative cleanups. A successful callback adds
one completedDisposers. The worker does not supply an aggregate CleanupReport for
these effects; the broker computes it from terminal records. Existing disposed
reports must not double-count these callbacks in later SDK integration.

A selected/active callback exceeding its bound records DEADLINE_EXCEEDED once,
increments timedOutResources once and triggers shared physical-session failure and
R2 bounded termination. Other affected unresolved work becomes UNAVAILABLE unless
an earlier terminal result won; explicitly report the shared failure. A late success
cannot overwrite timeout. Death or malformed replies are never cleanup success.
TERM/KILL issuance, context-ready, effect-released, or a worker's lifecycle ack is
not evidence of OS reap. Retain physical capacity, outstanding rights and quarantine
until actual owned-pidfd exit/reap observation; record unobserved reap honestly.

Apply the existing 500-ms cooperative unload, 500-ms TERM grace and 500-ms reap
observation where unload is involved; the new cleanup messages do not extend them.
No callback replay, resource-ID rebinding or automatic mutation replay after restart.
The new generation starts fresh and cannot resolve old pending operations.

## 8. Approval and subsequent implementation gate

- [ ] Review exact schema snapshot and mandatory minor/features/effectLimit.
- [ ] Review Host parity for admission counts and lifetime effect capacity.
- [ ] Review synchronous registerCleanup and cross-endpoint callback binding.
- [ ] Review cleanup lane reuse, causal depth, deadlines and honest shared failure.
- [ ] Approve a specific candidate commit; update active ADR/profile/schema together.
- [ ] Only then implement SDK/Host integration and the real tests in ACCEPTANCE.md.

Passing this directory's tests is **SCHEMA/ABSTRACT-MODEL EVIDENCE ONLY**. It is not
native supervision, synchronous pump liveness, SDK equivalence, release acceptance,
or a proof that all G6 runtime integration gaps have been discovered.
