# Proposed G6 IPC profile — wire/state rules

**Review draft, not implemented transport.** ADR-013 and `draft/frames.schema.json` form one proposal. The schema is intentionally stored outside frozen G1 specifications. Each definition is closed except explicitly typed ACAP values. JSON Schema validates shapes; it cannot authenticate a peer or enforce protocol state.

## Framing and strict data boundary

UDS stream, 4-byte unsigned network-order body length, then exactly that many UTF-8 bytes. Body length 1..1048576, excluding prefix. Reject zero/oversized prefixes before allocating a body. Accumulate split reads and consume coalesced frames without assuming socket reads match messages. One partial body per direction; fixed partial-frame deadline 2000 ms from first byte, not extended by trickle traffic. Handshake deadline 3000 ms from launch. EOF in prefix/body is a failed session, not a partial value.

Use the existing constrained canonical JSON parser/serializer: strict UTF-8, duplicate-key rejection, printable-ASCII object keys, valid Unicode strings, safe integers only, depth <=32. No floats/exponents/negative-zero lexical forms, nonfinite values, host objects, functions or prototypes as authority. `__proto__`/`constructor` are ordinary own data keys, not object mutation mechanisms. Validate descriptor-specific inputs, outputs and events with the existing ACAP contracts package in addition to frame shape validation.

The entire encoded frame must fit the limit. The equivalence factories must apply the same declared encoded-envelope/depth profile to both transports; a 1 MiB payload does not automatically fit a 1 MiB framed message. Do not assert equivalence by running unlike admission limits.

## Session state and replay

`LAUNCHED -> PEER_VERIFIED -> HELLO_VERIFIED -> ACCEPTED -> ACTIVATING -> ACTIVE -> QUIESCING -> CLOSED/FAILED` is a transport session state machine, not a replacement for G1 lifecycle states. Only the supervisor/native verifier can establish PEER_VERIFIED. One hello and accepted exchange; both have sequence zero. Thereafter, sequence numbers start at one and strictly increase independently in each direction. Every message binds the fixed session ID and generation. Session/generation mismatch, duplicate/reordered sequence, unexpected direction/tag or disallowed-state traffic closes the session with a sanitized failure. No downgrade or authentication retry on the same connection.

Hello claims must equal the recorded Cell, physical instance, package and accepted descriptor/version/feature vector. A fresh single-use launch challenge and observed peer credentials are mandatory. Verify numeric version components through existing G1 validators; enforce unique capability IDs, exact digest association and disjoint required/optional feature sets. Reject missing required features or incompatible schema/protocol versions. Optional features are explicitly intersected, never inferred. Package digest also binds signed event declarations; their digests are checked on each publication/subscription.

Wire feature vocabulary proposed: `wire.unary`, `wire.stream`, `wire.events`, `wire.outbound`, `wire.lifecycle`, `wire.scopes`, `wire.secrets`, `wire.logging`. Required features are derived from the chosen package/runtime profile, not just the peer's preferences. A frame whose feature was not negotiated is rejected. Features never issue grants.

## Directions and authority

Validate the channel's actual direction against `toBroker`/`toProvider`. There is no caller-supplied `sender` field. A syntactically valid broker frame arriving from a provider remains invalid.

| Message | Meaning and checks |
|---|---|
| hello / accepted | Provider proposal / broker acceptance; native authentication and launch-record equality precede activation. |
| request: invoke | Broker-to-provider only. Immutable registration reference, public G1 call, broker-minted observational caller tuple, remaining monotonic budget. Grant IDs in the tuple are references, not transferable credentials. |
| request: outbound | Provider-to-broker only. No caller tuple. Broker derives provider authority from the authenticated instance plus an owned bound handle. `parentWireId` supplies causality/deadline association, never upstream caller authority. |
| request: bind | Index into the signed manifest's required or optional requirements; broker derives the requirement and uses existing require/optional semantics. Optional absence alone returns absent; permission, compatibility and lifecycle failures remain errors. |
| request: register / withdraw | Register proxy handlers only for signed, accepted descriptors and a permitted instance context scope. No code/function crosses the wire. Visibility follows activation, disposal and dependency-quiescence rules. |
| request: scope-create | Child of a context scope already associated with this instance. Creating a scope does not grant capability, secret or event permission. |
| request: secret | Reference only. Broker verifies the separate secret grant for this exact instance/scope/generation. No inherited host secrets or paths. |
| request: subscribe / unsubscribe | Event descriptors and separate event grants; opaque subscription references remain session/instance-bound. |
| request: log | Closed SDK level/event vocabulary, no arbitrary text or object fields. |
| request: lifecycle | Broker-to-provider only: activate, quiesce, dispose, with bounded budgets. Provider reports do not override supervisor observations. |
| response | Must match a live wire ID, expected response kind, public request ID and descriptor. Control replies have closed variants; reference ownership is checked independently of shape. |
| error | Session failure, not a route to caller impersonation. Normalize code and broker correlation; do not forward provider messages/stacks/raw diagnostics. |
| cancel | Only the owner of the corresponding live directional call can cancel it. Local cancellation completes once without waiting indefinitely for a remote acknowledgement. |
| stream-item / credit / end | Bound to a live streaming call, correct producer/receiver direction and strictly increasing item sequence. Unary calls cannot receive stream frames. |
| event: publish | Provider proposal with wire ID, permitted scope, declared event type/digest and ACAP data only. Broker derives source identity, generation, sequence, time and event ID. Reply acknowledges broker admission, not subscriber completion. |
| event: deliver / request: event-ack | Broker sends the complete G1 envelope to an owned subscription. Receiver acknowledges its event ID; wrong ownership/unknown acknowledgements fail. Bound in-flight deliveries and handler acknowledgement time. |
| ping / pong | Fresh correlated liveness nonce; arbitrary traffic or unsolicited/stale pong is not a heartbeat response. |

Revalidate grants/expiry/revocation at admission and each consumer-visible delivery, including buffered stream items. Recheck before writing protected data to a worker. Bytes already delivered cannot be revoked retroactively. Provider data and reported identity never modify the broker's authority tables.

Wire request counters strictly increase per origin and are separate from the public G1 request IDs. Keep bounded pending maps and high-water marks; late terminal replies are discarded without unbounded tombstone storage or request-ID reuse. A response cannot attach to another request merely by naming an old public request ID. Shared request/response frame tags do not remove role-specific pending-call checks.

## Deadlines, reentrancy and errors

Broker tracks monotonic deadlines from original admission, including time spent queued. Provider receives remaining budget, not a fresh full timeout; responses and cancellation cannot extend it. UTC deadline metadata remains available for compatibility, but backwards wall-clock movement cannot renew execution time. Control and lifecycle operations have independent fixed budgets.

Initial proposed profile permits **one active inbound invocation per worker**, with bounded broker admission queues. This makes an outbound call's parent unambiguous: `parentWireId` must be the sole current inbound invocation. Unsolicited background outbound calls are not supported by this profile. Causal cycles back into a busy worker must fail boundedly with `RESOURCE_EXHAUSTED`, not deadlock; apply the same profile to the inproc equivalence route. This is an explicit qualification limit, not a claim that all possible inproc concurrency/reentrancy behavior is reproduced. Raising concurrency requires a separately reviewed causal-budget design; the worker must not select a more privileged or longer-lived caller by assertion.

First terminal outcome wins. Peer loss yields UNAVAILABLE unless cancellation, revocation or deadline already committed its specific outcome. Remote error messages are replaced by safe normalized messages; stacks, arbitrary fields and process identity assertions never become public error content. No automatic mutation replay, including on timeout with unknown side effects.

## Proposed resource profile

| Resource | Bound |
|---|---:|
| Encoded body | 1048576 bytes |
| Canonical nesting | 32 |
| Application frames queued per connection | 64 |
| Application bytes queued per connection | 8388608 |
| Reserved control queue | 16 frames / 65536 bytes |
| Pending calls per connection | 64 |
| Active inbound invocation per worker | 1 |
| Outstanding stream credit | 256 items |
| Stream buffered bytes | 1048576 per stream; also charged to connection bound |
| Event in-flight deliveries | 64 per subscription; also charged to connection bound |
| Event acknowledgement budget | 2000 ms |
| Active subscriptions / worker-owned scopes | 64 each |
| Bound handles / registrations | 256 each |
| Frame-start rate | 1024 per monotonic second per connection |
| Parsing work per event-loop turn | at most 16 frames, then yield |
| Handshake / partial frame | 3000 / 2000 ms |
| Maximum invocation budget in this profile | 30000 ms |
| Heartbeat / loss threshold | 5000 ms / 3 missed correlated responses |
| Cooperative dispose / TERM grace / reap observation | 500 / 500 / 500 ms |
| Reconnects | at most 4; backoffs 1, 2, 4, 8 seconds |

These are proposed qualification bounds, not measured runtime performance. Counters include encoded objects, receive assembly, queued writes and in-flight application data; do not advertise a byte bound while omitting another buffer. Socket-buffer sizes must be inspected and included in the implementation report. Reserve control capacity without reordering bytes inside a frame. Overflow must not grow memory or drop silently: fail admission with RESOURCE_EXHAUSTED, or close a violating/stalled session when safe control delivery is impossible.

Streams begin with zero credit. Receiver reserves bounded item/byte capacity before granting credit. Producer never sends beyond credit; consuming an item returns capacity explicitly. Oversized individual items fail before enqueue. A stalled receiver cannot keep a call alive beyond its original deadline; no heartbeat extends an invocation. Terminal delivery releases all reservations exactly once.

Heartbeat loss is detected at the third missed interval, plus measured scheduling delay. Monotonic timers must report overshoot; there is no hard-real-time guarantee while the supervisor itself is descheduled. Test a healthy supervisor with a blocked worker, and record actual detection/kill/reap times. Failure to meet the accepted test bounds is not reported as success.

## Evidence boundary

Current evidence contains schema checks and disposable platform probes only. It does not demonstrate replay resistance, grant revocation, queue enforcement, reconnect behavior, equivalence or production forced termination. Those are mandatory executable tests in `QUALIFICATION.md` after design approval.
