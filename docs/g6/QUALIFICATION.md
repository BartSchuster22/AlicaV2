# G6 R2 qualification and evidence boundary

Status: **design candidate only; G6 runtime qualification incomplete**.

## Evidence levels

1. `tools/check-g6-design.py`: JSON schema, closed-body, directional/control/work-lane and carrier metadata checks. Correctly shaped identity claims still do not authenticate anything.
2. `tools/test-g6-context-model.py`: deterministic abstract broker model. Opaque Python objects stand in for native endpoint/descriptor leases; there is no PID authentication or production socket implementation. It checks overlap, shared state records, A→B→A success, budgets, provider-owned grants, reentrant capacity/depth, queues, cancellation/revocation, offer replay/swap, foreign acknowledgements, in-flight descriptor reservations and shared failure. Retained terminal histories are test inspection state, not a production memory design.
3. `tools/probe-g6-carrier.py`: real disposable Linux Python subprocess/SCM_RIGHTS feasibility. Two pending contexts use shared process state; extra descriptors and a regular-file descriptor are rejected/closed, received sockets are close-on-exec and the synthetic parent marker is absent. The initial prototype used a stream reader on seqpacket acknowledgements and timed out; the corrected packet-aware reader passed. This is a trusted Python fixture, not the production Node/native transport, full offer protocol, authentication or final seccomp profile.
4. Existing G1/G3/G4/G5 checks protect the frozen/runtime/SDK baseline. They do not become G6 runtime evidence merely because they pass again.

New execution receipts belong in `evidence/g6-r2-design/`; earlier `evidence/g6-design/` reports describe the superseded single-active candidate. The compiler lock contains retrieved official download metadata, not a downloaded/validated compiler or successful native build.

## Required implementation after review

- Private pinned native bridge/launcher, authenticated child-connected stream, inherited packet carrier, sealed launch/package association, Landlock/seccomp and fixed FD/thread/process budgets.
- TypeScript IPC adapter/dispatcher with actual receiver-owned context records, broker authorization, endpoint lifetimes, monotonic budgets, first-terminal outcomes and shared accounting.
- One out-of-process synthetic Node provider using the public SDK; no per-call module replica or mocked in-process substitute.
- One unchanged consumer test function parameterized over in-process and IPC factories. Record its source hash and exercise the same expected results, not per-transport test branching that hides missing semantics.

## Mandatory runtime matrix (all still pending)

| Area | Required evidence |
|---|---|
| Authentication | Genuine launched PID/UID/GID/pidfd/package/descriptor match; forged name, wrong process/publisher/digest, stale challenge/generation and replay rejected |
| Offer/endpoint binding | Correct atomic packet/SCM transfer; wrong nonce/context/instance, duplicate/truncated/multiple/unsolicited descriptors, wrong socket type and FD reuse rejected with observed cleanup |
| Concurrency/state | Slow and fast overlapping calls, independent deadlines/cancellation, one shared mutable provider instance and stable activation/disposal semantics |
| Reentrancy | Successful A→B→A and bounded deeper nesting; exhausted slots/depth fail promptly without admission deadlock |
| Authority | No upstream consumer-grant inheritance; no asserted parent/caller retargeting, scoped handle widening or old-context revival while another call remains live |
| Calls/streams/events | Same values/errors/metadata over both transports, schema enforcement, cumulative credit and shared reservations, event callback acknowledgement and overload |
| Revocation | Live grant/scope invalidation before buffered delivery; descendant cancellation while healthy unrelated contexts remain independent |
| Death/stalls | Actual worker death, partial-frame/read/write/stream stall, missing heartbeat/offer consumption, malformed messages and deterministic first-terminal failure |
| Recovery | Bounded retries with fresh trust/session/registration; old handles invalid; no mutation replay or automatic caller rebinding |
| Resource accounting | Queue/byte/frame/FD bounds across all active, pending and retired contexts, including rights still queued in the carrier; actual memory/socket-buffer observations |
| Confinement | Final pinned Node/native filter denies outside reads/writes, symlink escape, network and bypass syscalls, process/thread/exec escape, ptrace/FD theft and attacks on other processes; no inherited credentials |
| Cleanup | Uncooperative provider forced down through owned pidfd; actual exit/reap, no orphan endpoints/processes; overshoots/unreaped state reported, never marked disposed from an acknowledgement |

Do not claim per-call fault isolation when the shared process must be killed. Do not claim semantic provenance merely from possession of a different live context capability. Any tighter isolation requirement requires a separately reviewed design that still explains stateful semantics.

## Exit gate

A production adapter and synthetic provider must actually run, the unchanged consumer suite must pass on both routes, every hostile/lifecycle case must have real evidence, and bounded cleanup/resource claims must be measured. Apply the existing exact-candidate CI/owner acceptance controls. Until then G6 is not complete.
