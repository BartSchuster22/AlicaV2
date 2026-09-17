# G6 runtime qualification ledger

**Clean-source result:** exact candidate `ea38b4a9cd406ff75ef491e0aecca664b54d1c91` passed the complete `npm run check` in `/home/alica-dev/AlicaV2-g6-clean`: 169 baseline JavaScript tests, 193 schema tests, 30 design-model tests, and **160/160 IPC/native tests, no skips**. The raw exact-commit receipt is `evidence/g6-runtime/clean-source-final.log`. Earlier checkpoint counts below are historical, not the final suite total.

The runtime matrix has executed on the pinned Linux target. The complete earlier
checkpoint passed `npm run check` (169 JavaScript baseline tests, 193 schema tests,
30 design-model tests, 156 IPC/native tests; no skips). The subsequent event
closure extension passed all 14 production-closure tests on both transports.
The exact committed candidate must additionally pass the full pipeline in the
independent clean worktree before publication; its receipt identifies the commit.

## Twelve mandatory areas

| Area | Executed evidence / test source | What is established |
|---|---|---|
| Authentication | `session-qualification.test.mjs`: real Host invalid signature/forged publisher/descriptor admission, actual PID credentials, forged hello identity/digest/challenge/generation | Invalid packages do not launch; authenticated native peers must match the launched process and accepted package. Closed-hello publisher injection is supplementary, not substituted for signed-package rejection. |
| Offer/endpoint binding | Real carrier wrong-session/generation/nonce, replay, truncation, socket type, multiple/no rights, oversized packet; native lease/FD reuse tests | Real SCM_RIGHTS ownership and cleanup; independent victim survives. Stale native lease reuse is component-level evidence, not represented as a signed-provider operation. |
| Concurrency/state | `qualification-consumer.test.mjs`, `host-sdk.test.mjs` | Shared signed providers and identical consumer assertions on both routes; overlapping calls retain independent ancestry/state and healthy siblings. |
| Reentrancy | Same-source A→B→A/depth consumer; `scope-correction.test.mjs` native nested cleanup and bounded dispatch | Actual nested application calls, reserved cleanup capacity and prompt bounded admission. |
| Authority | Same-source explicit A→B grants; live stale/foreign scope and replay tests; delayed continuation tests | Consumer authority is not lent to a provider; no stale-scope revival or endpoint retargeting. No claim that transport authenticates arbitrary provider semantic intent. |
| Calls/streams/events | `production-closure.test.mjs`, unchanged SDK consumer, wire/exchange tests | Caller/request/deadline metadata, stream credit bounds, schema error parity, first-terminal semantics, callback overload and bounded queues. |
| Revocation | Buffered event grant/scope invalidation on both routes; buffered stream grant invalidation; same-source cancellation, grant and sibling deadline tests; `isolation.test.mjs` | Buffered data cannot escape invalidation; independent work survives normal cancellation. Actual uncertain mutation or physical-worker failure remains fail-closed. |
| Death/stalls | Real exit, SIGSTOP, heartbeat, partial/malformed/replayed control/work, retargeting, offer starvation and kernel backpressure cases | Bounded failure, native cleanup and surviving independent victim; stream stall/terminal tests supplement physical faults. |
| Recovery | Production Host 1/2/4/8 backoff, validated pong exhaustion, unload/trust changes, committed mutation non-replay, old-handle rejection | Production creates replacements, never the test driver; fresh identities and explicit rebinding, no replay or pong-based budget reset. |
| Resources | Sustained real queued sessions, stream credit/event overload, carrier/write starvation | Child self-observed FD/RSS under unchanged non-dumpable confinement; broker FD/lease accounting, actual socket observations, retired contexts and bounded queues. Instrumented child measurements are not claimed for uninstrumented victims. |
| Confinement | Native final Node sandbox and signed hostile Host package; environment sentinel | File/write/symlink/socket/exec/inspection/signal restrictions remain enforced. Actual launch artifact identity diagnostics are retained. No sandbox/profile relaxation. |
| Cleanup | Actual exit/reap and victim checks, unreaped quarantine, truthful Host state, registered acquisition rollback/timeout/scope race; original scope-completion suite | No false DISPOSED before reap, no prematurely released capacity, no duplicate cleanup. Original six scope-completion tests remain unchanged. |

## Receipts

* `evidence/g6-runtime/qualification-full-check.log`: full 156-test checkpoint.
* `evidence/g6-runtime/qualified-isolation-repeat.log`: deterministic isolation regressions and 20 consecutive consumer runs on both transports.
* `evidence/g6-runtime/buffered-event-closure.log`: subsequent 14/14 closure extension.
* `evidence/g6-runtime/pre-offer-metadata-red.log`: deterministic zero-budget-offer regression before correction.
* The committed `evidence/g6-runtime/clean-source-final.log` records exact implementation candidate `ea38b4a`. The subsequent documentation/evidence-only publication revision is rechecked independently; its receipt is retained at `evidence/g6-runtime/publication-check.log` on the target. Publication requires exit zero, no skipped tests, a clean source tree and matching candidate identity.

The sealed qualification dispatcher is trusted test instrumentation using real
bootstrap, sealing, native descriptors and framing; it is not represented as a
signed application. Production signed-provider tests and component tests are
identified separately above. Raw diagnostics distinguish qualification-worker
hashes from production worker-entry hashes. Parent `/proc` access to a sealed
child is not restored to obtain measurements.

## Acceptance boundary

Target and clean-source receipts are not GitHub CI receipts. The private
repository remains private. Exact-candidate `foundation` CI and the owner gate
remain required by `docs/gates/G6.md`; no CI success or owner acceptance is
invented when GitHub API authentication is unavailable.
