# G6 IPC parent regression — bounded G7 publication checkpoint

Baseline: `122ac0d33cb0a1e08aef836ac7c964ae365a30b3`. This is an uncommitted local candidate for independent parent verification, not publication, G7 completion/acceptance, deployment, or signing. The existing owned-coordinator checkpoint/execution records are preserved, not revised. The remaining G7 implementation/qualification checklist in those records still applies.

## Scope and custody

One worker, no child agents or scheduled jobs. Initial local/development process observations found no competing project build/test/writer. Existing unrelated services/cron were not changed. Development commands used `/home/alica-dev/AlicaV2`, the specified SSH identity/strict known-host checking, and `PATH="$PWD/.tools/node/bin:$PATH"`. No installs, toolchain changes, RAM/swap/service changes, production signing/deployment, protected licensing/archive actions, commits, or pushes were performed.

Evidence is exclusively new under `evidence/g7/ipc-parent-regression/`. The original `/home/herman/g7-owned-parent-full-check.log` remains intact; an exact copy is `parent-full-check.log`. The original `owned-coordinator/` evidence and its manifest-bound records are not rewritten. `local-before.json` and `remote-before.json` bind tracked and nonignored untracked regular files, excluding this new evidence prefix. They are not whole-filesystem or ignored build/toolchain inventories. Local/development implementation source and `docs/g7` agreed before investigation. Older evidence trees and root `G6-*` custody/transfer records already differed between machines; these are not synchronized or rewritten, and preservation is checked against each machine's own initial inventory.

The permanent source/test allowlist is `tests/ipc/qualification-consumer.test.mjs`, `tests/ipc/isolation.test.mjs`, and the new public helper `tests/ipc/qualification-consumer-fixture.mjs`. This new checkpoint and the new evidence prefix are the documentation/evidence allowlist. Temporary diagnostic edits touched five G6 implementation files (session, scheduler, host-adapter, worker-transport, sdk-rpc) and the consumer test; all five production files were restored byte-for-byte before final qualification. Every diagnostic input archive and before/after source binding is retained. No owned-coordinator source or old documentation required a correction.

## Baseline attribution and inspected lifecycle

`baseline-comparison.json` records exact SHA-256 and equality to the published baseline for the contracts runtime, every G6 source file, and the original consumer test. All were identical to baseline. This defect is not attributable to the newly uncommitted coordinator.

The relevant ordering is:

1. The original fixture called `ctx.optional(...)` afresh in each `deny`, `nest`, and `descendant` invocation. The 80 ms deadline case therefore issued a new asynchronous SDK **bind** request, not just an outbound logical invocation.
2. `HostIPC.scoped` creates/stores a binding handle. `WorkerSDKChannel.request` admits a bind through `SDKPending`; only `scope-check` is marked read-only. A bind without a definite response is intentionally an unknown SDK mutation outcome.
3. Contracts `ContractSession.prepare.cancel` selects its terminal, aborts the operation controller synchronously, then rejects its failure promise. Scheduler input abort selects `CANCELLED`; scheduler/deadline checks may independently select `DEADLINE_EXCEEDED`. `WorkContext.finish` latches once, aborts the context, retires the endpoint, and propagates to children. These transport-context codes need not equal the outer contract's already-selected deadline/revocation result.
4. On broker retirement the worker observes native peer closure and aborts that endpoint. `SDKPending.lose` on an unanswered bind calls the physical-session failure callback. Alternatively, the worker's own real monotonic timer can select the loss first while the broker is stalled. This is intentional fail-closed behavior, not an EOF that should be indiscriminately ignored.
5. Worker control closure/exit is then observed by `PhysicalSession`; `fail` disables the session, notifies Host, fails outstanding work, closes endpoints and contains/reaps the exact child. The provider is unavailable for subsequent calls. If this occurs before the outer contract deadline callback runs, the current call can report UNAVAILABLE; if the deadline has already settled, the next call observes UNAVAILABLE.

No production error ordering, authorization, cancellation, revocation, retirement, native PeerClosed classification, or uncertain-mutation policy was weakened.

## Assertion identification and exact epistemic limit

The original parent raw log contains the test registration line 195 and `ContractSession.call -> waitForActual -> strict.rejects`, but no consumer assertion line or runtime phase markers. There are two PERMISSION_DENIED assertions. Timing alone cannot prove which historical assertion failed.

In the retained `diagnostic-held-bind/raw.log` reproduction, runtime markers prove initial denial **passed**, the deadline assertion **passed**, and the rejection was the revocation assertion at **original line 169**, not initial denial at line 120. The trace records an unanswered `[bound, absent]` RPC, its CANCELLED loss, SDKPending physical failure, broker control closure and actual worker exit code 1 before that revocation assertion. No revoke operation had yet rescued the already-dead provider. This reproduces the parent's UNAVAILABLE versus PERMISSION_DENIED signature without changing the strict expected code.

`diagnostic-stalled-bind/raw.log` holds the same bind while the real worker continues running and reproduces UNAVAILABLE versus DEADLINE_EXCEEDED, the earlier worker-run signature. Its trace records worker deadline loss, session failure, context retirement, and exit ordering. No clock was mocked and no production budget increased.

These observations establish a concrete fixture defect sufficient to cause **both** recorded signatures. They do **not** constitute a retrospective transport trace of the historical parent/worker failures. The historical parent assertion and exclusive historical cause cannot be certified from the available original log. Independent parent verification remains required; this checkpoint does not claim every possible IPC instability is resolved.

## Minimal correction and deterministic regression

The fixture now lazily obtains and retains a successfully settled downstream binding. Failed binding attempts are not cached. The initial no-grant denial remains first; subsequent successful nested calls establish both bindings before cancellation/deadline/revocation exercises. Every actual bound call still goes through current Host authority/grant checks. Grant revocation is not bypassed by retaining a handle.

Both factories still execute identical provider source strings and the exact same consumer assertion function. The consumer function's runtime SHA-256 is unchanged: `6eebc4e3204c8f3d37fc0695b922e5d231588a3aabbc799149817d6f9b1dbefb`. The 80 ms call deadline, 4,500 ms ordinary deadline, 4,000 ms observation limits, 30,000 ms test ceiling, and factory budgets are unchanged. No expectation allows UNAVAILABLE in place of PERMISSION_DENIED/DEADLINE_EXCEEDED; no skip, retry-until-green, or full-suite serialization was added.

Two additional real-process regressions in `isolation.test.mjs` warm a binding through an actual A -> B -> A call, then hold exactly one authenticated request across the existing 4,500 ms ordinary-call budget:

- Broker-running: the broker and worker timers continue normally; no reply or replay of the held request is fabricated.
- Broker-stalled: only this test's broker process blocks across that actual deadline; the separate worker runs and observes its real monotonic budget. The additional 100 ms is fault duration beyond the existing deadline, not extra allowed execution time.

Both assert strict DEADLINE_EXCEEDED, actual request interception, no fresh bind inside the boundary, real successful calls to both providers afterward, and an active session with no physical failure before test completion. Under the original fixture both regressions failed (`regression-before`, 0/2). With only the binding-reuse correction they passed (`regression-after`, complete file 4/4). The final focused selection also retains the existing negative tests that unanswered SDK mutations/effect releases **must** fail closed, and unexpected worker EOF must fail the physical session.

The new tests record hold kind, remaining budget, retirement, physical failure and actual reap receipts. Their final diagnostics are emitted after fixture cleanup; consequently a successful case's event list also includes normal teardown's `PhysicalSession.fail` and worker exit code 1. That trailing teardown is not a failed isolation assertion: the test checks session health/no physical failure before returning. The final layout includes an explicit `healthy-before-cleanup` marker and the failure-origin stack, showing `HostIPC.shutdown` during normal teardown. The before-fix traces fail those health assertions or the deadline assertion before cleanup. The deeper diagnostic runs additionally retain the originating failure stacks and binding-RPC loss reasons.

The first full check caught a test-layout mistake introduced during this investigation: `qualification-consumer.test.mjs` is not authorized to import private HostIPC. It stopped at boundaries, before G6/G7; its failure is retained. The correction moved the white-box regressions to the already-authorized `isolation.test.mjs` and extracted public setup into the helper. No import-boundary policy was widened. The existing SDKPending negative test now also explicitly includes `['bound', 'absent']` and still requires physical failure. These are layout/coverage corrections, not a retry of identical failing source.

## Bounded experiment ledger

Each run directory retains `command.txt`, exact transfer allowlist/input archive, `before.json`, `after.json`, full `raw.log`, and actual `exit.txt`. Outer diagnostic loop exit status is not substituted for inner test statuses.

| Run                             | Actual result / purpose                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diagnostic-1`                  | Instrumented original focused consumer, 2/2; no resolution inferred                                                                                  |
| `diagnostic-native`             | Original native suite with phase/session diagnostics, 160/160; default suite concurrency unchanged                                                   |
| `diagnostic-bounded-eight`      | Predeclared fixed eight diagnostic samples, all retained with individual SAMPLE_EXIT records; not retry-until-green                                  |
| `diagnostic-held-bind`          | Failed 1/2; original line-169 revocation signature established by phase markers                                                                      |
| `diagnostic-stalled-bind`       | Failed 1/2; earlier deadline signature reproduced with actual ordering                                                                               |
| `regression-before`             | Production instrumentation removed; original fixture, new real-budget regressions failed 0/2                                                         |
| `regression-after`              | Minimal fixture correction, complete consumer file passed 4/4                                                                                        |
| `format-candidate`              | Existing pinned Prettier formatted only the allowed test; validated returned one-file archive synchronized locally                                   |
| `focused-final`                 | Formatted candidate, 39/39; consumer, isolation, SDK bookkeeping and scheduler tests                                                                 |
| `full-check-final`              | Actual unchanged `npm run check`, exit 1 at import boundaries; G6/G7 not run                                                                         |
| `boundary-corrected-focused`    | Final three-file layout formatted; unchanged boundary gate passes; focused 39/39                                                                     |
| `full-check-boundary-corrected` | Actual unchanged `npm run check`, exit 0: 170/170, G6 162/162, G7 272/272; zero failed/cancelled/skipped Node tests; final G7 contract model 121/121 |

## Formatted candidate identities

| File                                           | SHA-256                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `tests/ipc/qualification-consumer.test.mjs`    | `294139df7ddffb09a6cac242aaed4c3a9590352410cc76d438b9adeeb11ddb17` |
| `tests/ipc/qualification-consumer-fixture.mjs` | `c50f73349d811691fa85a35cb051f1f659e6be9cfee29bf6fd906f16c9e0e08b` |
| `tests/ipc/isolation.test.mjs`                 | `28df5fca7a99adfad3ce09b2f7d6d9097737db83e222a858db1151f35b675fb1` |
| Preserved `tools/g7-owned-coordinator.py`      | `7b6702a7e3a0763a087cf8541985b8fe6d2edea039c267866ae3f519cd42921f` |
| Preserved uncommitted `tools/g7-supervisor.py` | `ffb517a5635b391c13b3f4e4a7a664413899d3a293199b715a3af75a53b744de` |
| Preserved parent failure log                   | `ba19ed772482a763ec07c947d1f6eb4ad64fc34961b35f06187a94f2ce7cab9b` |

`semantic-preservation.json` verifies both the consumer assertion function and factory setup function are byte-identical to the original, including their budgets. `fixture-source-only.diff` isolates the provider source-generator correction from the file-layout change. `baseline-isolation-comparison.json` also binds the original isolation test to the published baseline.

## Final verification and parent handoff

The actual unchanged `npm run check` completed with exit **0**, including G7. Its full before/after inventory is identical, not merely its three changed test files. This is a passing worker qualification of this candidate, **not** G7 implementation completion, production acceptance, signing, deployment, or authorization to bypass the next parent's independent verification.

`preservation-and-binding.json` is the final machine-checked audit: original/final hashes, exact allowlist, local/development implementation equality, final source equality to the full-check source, preservation of all previously inventoried evidence on each machine, unchanged G7/coordinator bytes, and the original parent failed-log hash. The new checkpoint was finalized after testing; no executable source was changed after the successful full check. `final-doc-sync/` retains its transfer binding and final formatting/whitespace verification. `returned-candidate-source.tar` contains the changed test/helper files, new checkpoint and preserved G7 source subset. Full repository source identities remain in the inventory JSON files.

`SHA256-MANIFEST.json` binds the newly retained evidence files; it does not rewrite or replace any previous manifest. No prior failed evidence is superseded by a later pass. `local-process-final.txt` and `remote-process-final.txt` retain the final process observations. The local source tree is `/home/herman/g7-implementation`; the tested development tree is `/home/alica-dev/AlicaV2`.

Next gate: the parent independently verifies these exact hashes and the unchanged full check before deciding scoped publication. The historical-assertion/exclusive-cause limitation above remains explicit even though both signatures were deterministically reproduced and this corrected candidate passed. No commit or push was performed.
