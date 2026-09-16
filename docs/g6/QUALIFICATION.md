# G6 qualification plan and current evidence boundary

Status: **design review candidate; G6 implementation and exit qualification not complete**.

## Required implementation artifacts after approval

1. Native Linux peer-credential/launch/confinement bridge with locked compiler provenance and reviewed syscall policy.
2. TypeScript authenticated IPC adapter integrated with existing Kernel admission, grant, lifecycle, contracts and SDK paths.
3. Signed synthetic out-of-process provider and identical public-import-only parameterized consumer suite for inproc/IPC.
4. Executed isolation, authority, transport-equivalence, failure and cleanup reports, including process observations and byte/item maxima.

## Required test matrix

| Area | Required executed assertion | Current status |
|---|---|---|
| Identity | Wrong PID/UID/GID or claimed provider rejected against launch record; no PID supplied by wire used for signalling | Peer-credential feasibility only; adapter test pending |
| Package/contracts | Wrong package/descriptor digest, incompatible version, missing required feature rejected before activation | Shape validation only; matching/handshake test pending |
| Replay | Captured hello, reused challenge, stale generation, duplicate/reordered sequence and second handshake rejected | Pending runtime implementation |
| Framing | Split/coalesced/truncated frames, invalid UTF-8, duplicate keys, oversized prefix, oversize body, depth and integer limits | Schema fixtures only; stream decoder tests pending |
| Authority | Provider-origin caller injection, foreign handle/scope, undeclared registration, unauthorized secret/event/outbound request rejected | Direction/shape checks only; real grants pending |
| Equivalence | Same consumer function/source hash, input cases and declared profile; transport selected only by factory | Not run |
| Streams | Zero initial credit, no excess credit/items, per-stream/connection byte bounds, stalled receiver and cancellation | Shape checks only; live backpressure pending |
| Revocation | Grant revoked with buffered stream/event data; no later unauthorized consumer delivery | Not run |
| Disconnect | Killed process, EOF and mid-mutation loss invalidate old handles and fail outstanding calls; execution counter proves no replay | Not run |
| Reconnect | Four-attempt lifetime budget, correct backoffs, fresh generation/nonce/physical instance, no counter reset via hello/pong | Not run |
| Cleanup | Normal unload, ignored abort, hanging disposer, CPU loop, SIGTERM refusal, bounded SIGKILL/reap, honest cleanup report | Disposable probes only; lifecycle tests pending |
| Isolation | Outside reads/writes, symlink escape, network, inherited secrets/FDs, fork/exec, ptrace/signal/prlimit attacks, io_uring bypass | Basic FS/network/environment probe passed; final hostile suite pending |
| Resource bounds | Record peak frames/bytes, handles/scopes/subscriptions, event acks, parser work and output draining under hostile traffic | Not run |
| Containers | Same provider qualified inside any selected container runtime | NOT SELECTED; no qualification claimed |

The equivalence profile proposes one active invocation per worker. Explicitly test bounded cyclic/reentrant rejection on both routes; do not describe that restricted profile as unrestricted inproc concurrency equivalence. Owner review can require a different concurrency design before implementation.

## Design checks

Run from a bootstrapped repository:

```sh
python3 -S tools/check-g6-design.py
```

It resolves public frozen G1 schemas, validates every frame tag and supported control shape, rejects additional authority fields and direction misuse, and checks finite ACAP values. Intentionally well-formed false identity/digest fixtures remain schema-valid: only a real authenticated state machine can reject their false claims. This distinction is tested, not hidden.

The disposable `tools/probe-g6-host.py` is a target-host feasibility collector, not an IPC adapter or sandbox certification. Its output distinguishes namespace failure, the initial OpenSSL restriction failure and a successful constrained Node run. It applies restrictions only in child processes. The final native policy must be materially stronger than its socket-only seccomp probe and broad library-directory read rules.

## Approval and completion

ADR-013, IPC-PROFILE.md and draft frames require the previously retained owner review before implementation. Approval must explicitly include the native component/build-tool policy addition and the proposed profile/limits. G5 acceptance and baseline approval remain valid; they are not being requested again.

After that approval, G6 completion still requires actual adapter/provider artifacts and all runtime tests above, a clean-checkout report, exact-candidate foundation CI success and owner acceptance under the existing private-repository manual controls. No passing schema count or platform probe substitutes for G6 exit.
