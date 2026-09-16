# G6 bounded-concurrency revision — design notes

Status: **revision in progress, not an approved or implemented replacement protocol**.

[Owner direction](../gates/G6-CONCURRENCY-DIRECTION.md) supersedes the single-active final qualification target in `5bb062f`. Native Linux authentication/confinement and a locked C build toolchain remain the agreed direction. The old frame schema still describes the old profile; its passing structural checks do not qualify this revision.

## Required invariants

- The same consumer function must demonstrate overlapping requests and successful nested/reentrant calls within declared bounds over both transports. Merely serializing both routes or rejecting every cycle is insufficient.
- Broker records own effective authority, parent context, monotonic deadline, cancellation, pending descendants and resource reservations. Queueing and dispatch consume the original budget.
- Provider-origin requests use the authenticated provider's authority and permitted scope/handle, never the observational caller tuple supplied with an inbound call.
- A provider-supplied parent ID cannot select another call's authority or renew an expired budget. All parent/child and handle/scope associations must be checked independently of frame claims.
- Completion, expiry, revocation and cancellation invalidate the applicable context and descendants atomically. Late replies cannot attach to new work, even after descriptor/FD/identifier reuse.
- Successful concurrent calls must not unnecessarily inherit each other's cancellation or the minimum deadline of unrelated requests. A process-wide earliest-deadline workaround would not preserve independent-call semantics.
- Preserve provider-instance state and activation/disposal semantics. Replicating a mutable provider into a new process per call is not transparently equivalent to one stateful provider instance.

## Candidate mechanism for the revised ADR

Consider broker-created, invocation-bound communication endpoints, distinct from the instance control channel. The broker associates each endpoint with one immutable invocation record. Nested work arriving through that endpoint obtains its parent, remaining budget and permitted provider context from the receiving endpoint's broker record, not a `parentWireId` assertion.

A shared provider process can retain one module instance and its mutable state while handling multiple invocation endpoints. The SDK dispatcher uses the corresponding opaque context for asynchronous work. AsyncLocalStorage can assist correct routing, but is not the security boundary. The broker must reject attempts to retarget an endpoint, revive a closed context, use a foreign scoped handle or inject upstream caller authority.

For Linux, an authenticated native descriptor-transfer mechanism is a possible way to supply those endpoints without allowing the worker to create arbitrary sockets. That requires an explicit ancillary-data protocol and bounds: authenticate the launch/control relationship, correlate each offer once, reject unsolicited/multiple/truncated descriptors, close rejected descriptors, bind endpoint lifetime to the physical instance and prevent descriptor-number reuse from rebinding context. Do not claim that credentials on a parent-created socketpair prove the child's PID. Do not mix ordinary stream reads with ancillary-descriptor reads without a validated ownership/framing design.

This is a **candidate mechanism**, not approval to introduce descriptor passing or a completed frame specification. The revised ADR must settle the carrier, lifecycle and syscall-policy details and account for their resource cost before implementation.

### Necessary threat-model precision

An untrusted process handling several requests can possess several legitimate context capabilities. No parent ID, MAC or shared-process AsyncLocalStorage alone proves the semantic origin of its computation. Even separate invocation endpoints do not prevent a compromised process from deliberately using another endpoint it legitimately possesses. The broker can enforce the authority, scope, deadline and cancellation of the endpoint actually used; it cannot prove what business data motivated that operation.

The revised design must state this distinction explicitly and show that using another live context cannot revive, deliver a result to, or extend the expired original call, and cannot exceed the provider authority allowed on the context actually used. If the required threat model prohibits all cross-context capability use inside a compromised shared process, additional isolation is necessary; its effect on shared provider state must be resolved rather than concealed. Do not claim that opaque tickets alone solve that stronger problem.

## Scheduling design to resolve

Define ordinary admission capacity, capacity reserved for nested/reentrant work, total active/pending work, maximum causal depth, endpoint/descriptor counts and aggregate byte reservations. A nested call must not wait forever behind capacity held by its own ancestors. It must receive permitted capacity or a deterministic exhaustion outcome; application-level lock deadlocks remain subject to deadlines, not magically prevented by transport scheduling.

Do not select a concurrency number by only replacing `1` in the current schema. Capacity must be justified against descriptor limits, stream/event reservations, lifecycle control capacity and broker-wide worker limits. Use identical logical admission rules for both transport factories. Ordinary overload must not starve cancellation, lifecycle traffic or bounded reentrant progress.

## Required revision tests

1. Concurrent slow and fast calls with distinct deadlines; no global serialization or deadline/cancellation contamination.
2. Concurrent requests against a stateful provider; one instance's state and activation/disposal semantics preserved.
3. Successful A-to-B-to-A reentrancy within capacity and causal-depth bounds.
4. Exhausted reserved capacity/depth returns the declared error promptly, without scheduler deadlock or leaked reservations.
5. Injected parent IDs/caller tuples, wrong context/scope, stolen or swapped endpoint offers, duplicate offers, stale generation and descriptor reuse.
6. Attempted use of an expired context while another longer-lived call remains active; original deadline/result cannot be revived.
7. Parent cancellation/revocation cascades to descendants while unrelated calls remain unaffected where process health permits.
8. Instance death/disconnect closes every associated endpoint and fails each outstanding call once; no automatic mutation replay.
9. Concurrent streams/events consume shared byte/item/FD limits, not independent unaccounted budgets.
10. Process-wide failure remains an explicitly shared failure domain. Do not promise that force-killing one malicious task inside a shared worker leaves sibling calls alive.

## Remaining work before the review gate can close

Resolve the mechanism and threat boundary; revise ADR-013, the profile, all affected frame/offer schemas and fixtures; add structural/state-model checks; document resource accounting; run checks and present the concrete candidate for review. None of the preceding design notes is runtime qualification. Earlier G6 design evidence remains historical, not evidence that the proposed concurrency mechanism works.
