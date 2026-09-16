# G6 R2 — IPC profile and state rules

Status: **complete review candidate; not implementation or runtime qualification**. [ADR-013 R2](../adr/ADR-013.md) and the schemas in `draft/` are one proposal. The old single-active profile is superseded. Frozen G1 schemas/specifications are unchanged.

## Wire formats and channels

- Control and invocation streams: 4-byte unsigned big-endian UTF-8 body length, then exactly one canonical JSON object. Bounds apply before allocation; reject zero/oversize length, malformed UTF-8/JSON, duplicate keys, unsupported numeric forms, depth beyond 32, unknown fields and non-ACAP values. Reuse existing public ACAP validators and canonical value semantics.
- Native carrier: one AF_UNIX/SOCK_SEQPACKET packet containing the same 4-byte length plus the closed `context-offer.schema.json` JSON body, and **exactly one SCM_RIGHTS descriptor**. Total packet <=4096 bytes including prefix. A single sendmsg must transmit the whole packet; no fragmentation/retry of a partial logical offer. Receive the whole packet with recvmsg, sufficient ancillary space, MSG_CMSG_CLOEXEC and explicit MSG_TRUNC/MSG_CTRUNC checks. Reject and close all received rights on error. Reject other ancillary types and non-stream sockets. Never use a stream prefix-reader for the packet carrier.
- The carrier belongs exclusively to the native transport layer. Ordinary Node stream reads must not race it or silently discard ancillary data. Application data remains ACAP JSON; the descriptor is not serialized as an integer or delivered to consumer logic.
- Each stream has independent direction sequence numbers and an immutable receiver-side context identity. `contextId` in JSON is an equality check, not authentication or routing authority. Work IDs are never reused within a session; counters never wrap.

Hello/accepted bind the exact launched process/package and expected capability **and event** descriptor digests. Capability versions/features and canonical event descriptor digests must match broker-accepted metadata. Reject logical duplicate IDs even when array elements differ. `wire.contexts` is mandatory for R2; never fall back to the old single-active/parent-ID protocol. The schema remains a proposed IPC v1 schema because the superseded draft was never an implemented/approved wire contract.

## Channel dispatch table

| Channel | Allowed traffic |
|---|---|
| Control, provider→broker | hello before acceptance; then ping/pong, sanitized session error, `context-ready`, `task-open` |
| Control, broker→provider | accepted, ping/pong, session error, responses to allowed control requests |
| Work, broker→provider | initial invoke/lifecycle/event dispatch matching offered purpose; responses to scoped requests; stream/cancel traffic matching pending state |
| Work, provider→broker | invoke/lifecycle replies; scoped bind/register/withdraw/secret/subscription/log/scope operations; outbound calls; event publication/acknowledgement; stream/cancel traffic matching pending state |

Use `controlToBroker`, `controlToProvider`, `workToBroker` and `workToProvider` schema selections. Structural validity is not sufficient: direction, offered purpose, lifecycle phase, pending request kind, scope/handle ownership and current authorization are also checked. No business outbound call is accepted on the control channel. Session errors do not carry arbitrary provider stacks/messages to consumers.

Responses refer to the requester's outstanding wire ID on that endpoint; stream items/end travel producer→consumer, credit/cancel consumer→producer. Distinguish request-origin maps so equal numeric IDs in opposite directions cannot collide. Validate operation-specific result shapes and expected descriptor digests; do not treat a well-shaped response as authority.

## Context and descriptor state machine

`RESERVED → OFFER_PENDING → READY → RUNNING → TERMINAL → RELEASED`.

Reservation starts the budget before endpoint allocation. Context records bind physical session/generation, provider identity and permitted scope, registration/handle, parent/depth, deadline, descendant cancellation and resource accounting. Broker native leases are not raw fd numbers. Dispatch occurs only after readiness; provider-task contexts have no inbound consumer invocation to impersonate.

The offer has a fresh unpredictable 256-bit nonce, disclosed **only in its carrier packet**, plus session, generation, context, purpose and one-descriptor count. A matching acknowledgement on the authenticated control channel establishes packet consumption, not a new authority grant or proof of business execution. Reject duplicates/replays, wrong session/context/instance, truncated carriers and malformed acknowledgement. Failure from one instance must never consume another instance's offer or cancel its unrelated context.

An original call may expire before the offer is acknowledged. Its endpoint becomes unusable immediately and it can never be dispatched or revived. However, the in-flight descriptor reservation and slot remain charged until the authenticated nonce acknowledgement proves the carrier packet was consumed, or the physical process/carrier is destroyed. A late valid acknowledgement retires the expired offer, not the call. After 1000 ms without consumption, fail the physical session and apply bounded termination; retain unreaped resources rather than pretending queued SCM_RIGHTS can be recalled. This is an explicitly shared failure, not cross-call deadline inheritance. A worker may retain a consumed dead endpoint, but that grants no live authority and remains subject to its OS fd limit.

Completed child records must be removed from production active maps. Use bounded pending maps, monotonic IDs/watermarks and late-frame discard; do not accumulate unlimited terminal histories. The test model retains terminal records solely for inspection and must not be copied as a production ledger.

## Scheduling and accounting

| Limit | R2 proposal |
|---|---:|
| Ordinary active/offer-reserved work per worker | 4 |
| Reserved nested/reentrant work | 4 |
| Total application contexts | 8 |
| Additional lifecycle context | 1 |
| Maximum causal depth | 8 |
| Pending ordinary calls | 64 |
| Outstanding offers, including retired/unconsumed | 9 |
| Encoded application frames/bytes, per worker across **all** channels | 64 / 8 MiB |
| Control reserve | 64 KiB |
| Maximum stream frame body | 1 MiB |
| Carrier packet, including prefix | 4096 bytes |
| Per-stream buffered encoded bytes | 1 MiB |
| Maximum cumulative stream item credit | 256 |
| Frame processing burst / sustained rate | 16 per turn / 1024 per second per worker |
| Handshake / partial-frame / offer-consumption deadlines | 3000 / 2000 / 1000 ms |
| Call/root provider-task ceiling | 30000 ms |
| Event callback budget | 2000 ms, also charged to ordinary slots |
| Heartbeat interval / missed responses | 5000 ms / 3 |
| Cooperative unload / TERM grace / reap observation | 500 / 500 / 500 ms |
| Reconnect attempts after initial launch | 4 |

Every admission must satisfy every applicable bound; these maxima do not guarantee simultaneous full capacity. Ordinary work queues FIFO with the original deadline. Nested calls use reserved capacity first, then available ordinary capacity, and never queue behind their ancestors: exhaustion/depth limit produces RESOURCE_EXHAUSTED promptly. Repeated provider visits are allowed within limits. Provider application lock deadlocks still expire under their original budgets.

Contexts awaiting offers count toward their slot. An expired but unconsumed offer still occupies that slot. Received descriptors, unsent offers, in-flight rights, retired endpoints, decoder assemblies and write buffers all need bounded ownership. With at most nine context endpoints, the final 64-fd process limit leaves a defined bootstrap/runtime reserve; measure actual runtime descriptors and refuse startup if the worst-case layout cannot fit. Four workers is a supervisor-wide cap, including unreaped/quarantined workers.

Reserve encoded byte and frame capacity before allocating/reading queued application bodies or granting stream credit. If a descriptor cannot prove a smaller encoded item bound, reserve the full permitted frame size. Aggregate reservations can reduce effective credit below 256. Account for framing/metadata as well as values, and for partial receive/write buffers; credit cannot multiply budgets across contexts. A stream must not produce an item without credit. Close/cancel releases its reservations once. Event deliveries use bounded callback contexts and acknowledgements; they do not obtain unlimited independent queues.

Encoded byte bounds are not an exact V8 heap/RSS or kernel socket-buffer measurement. The native build must measure those resources and qualify the separate OS process limits. Control traffic has its own reserve and cannot be starved by ordinary saturation. Partial-frame/stalled-peer detection remains active while application queues are paused. Numeric counters saturate/fail before wrap.

## Invocation context and authority

The receiver's endpoint record supplies parentage and monotonic budget. `outbound` contains bound handle, request and a requested upper budget, but no parent or caller assertion. The result cannot exceed the selected provider scope/handle/grant or the original parent deadline. Recheck authorization before starting work, exposing buffered data and delivering final results; already delivered information cannot be recalled.

Do not combine unrelated deadlines or cancellation. Parent termination cancels outstanding descendants. Normally cooperative cancellation closes only applicable contexts; an uncooperative or broken process can require whole-worker termination, which fails siblings honestly. No mutation replay or implicit rebind follows disconnect.

`task-open` is a separately admitted provider-owned root budget, not a substitute for an expired inbound context. SDK routing must retain an expired invocation marker and reject its delayed calls instead of silently opening a fresh task. A compromised process can intentionally use a different live context or request provider-owned background work; the broker enforces the context actually used, not unverifiable semantic intent. Its previous consumer invocation still cannot be revived, extended or answered twice. This threat boundary is part of review, not a claim of per-request OS isolation.

## Failure and recovery

First terminal outcome wins. Invalid provider protocol closes the offending session, not a victim's unrelated session. Broker diagnostics may distinguish framing, authentication, version, digest and resource faults; outstanding valid consumer calls receive UNAVAILABLE on peer loss unless an earlier specific result has committed. Provider-supplied diagnostic messages/correlation IDs are normalized, not trusted.

A new process requires fresh identity/challenge, generation, trust/grant/digest validation and registration. Backoff is 1/2/4/8 seconds; successful hello/pong does not reset the per-instance restart budget. Unload cancels queued reconnect timers. No replay of in-flight work and no rebinding of old handles. A failed reap is reported as unreaped/quarantined and retains capacity; SIGKILL issuance alone is not DISPOSED evidence.

## Qualification boundary

Apply identical logical scheduling, request/value admission and lifecycle rules to both factories; IPC cannot quietly impose a smaller accepted value domain. The same consumer test source must exercise overlap, independent deadlines, shared mutable provider state, A→B→A success, streams/events and the declared failure codes. Actual native authentication, complete confinement, worker death/revocation, stalls, fd accounting and bounded forced cleanup are separate required runtime tests. Current model/schema/primitive results do not close G6.
