# R1 Cell lifecycle deadline candidate — parent review required

Baseline: published `ce6d72423b426ff8e44e10d624ab7640dc7f30ea`. This is a bounded continuation of the existing in-process Cell, not another preparation/activation milestone or G7 acceptance. Read before edits: R1-OWNER-APPROVAL, CONTRACT-REVIEW-R1, frozen contracts.schema.json and limits.json, and R1-CELL-ACTIVATION-PARENT-REVIEW.

## Implementation

- Real `process.hrtime.bigint()` elapsed-time budgets, with frozen 300 s verification, 30 s activation/readiness/publication, and separate 30 s cleanup ceilings. Activation is one shared budget, not a fresh 30 s per provider or readiness call. Kernel's existing individual operation bounds remain intact.
- Await races wrap only leaf Kernel promises. The code that publishes accepted selection is not run in a detached/raced operation. Once an awaited step rejects/times out, no late fulfillment can resume that publication continuation. Each race consumes late rejection too.
- Actual Kernel bootstrap, discovery, grant issuance, startProfile, require, synthetic echo plus unchanged-consumer calls and shutdown remain the authority. No supplied readiness/activation callback, fake death proof, supplied clock, confinement relaxation or production fault flag was added.
- Shutdown is bounded as a whole. Unsettled work/resources, failed or restart-required cleanup and deadline expiration latch conservative failure. The held host and ownership remain retained when cleanup is uncertain. A repeated Kernel shutdown can return an interim inspect report; the Cell refuses to reinterpret that as completion of the original cleanup. No later promise completion changes Cell state to STOPPED.
- Clean activation rejection with an actually clean Kernel shutdown now leaves same-object status usable, ABORTED/STOPPED, instead of unconditional poisoning by the outer stage catch. Retained immutable candidate files are not deleted or silently reused. Retrying that retained candidate returns CONFLICT before creating a new transaction and does not poison the object. Exact retry/reinstall remains unimplemented; no claim of general retry support.
- Journal/selection validation and durability failures remain rejected promises/errors, with structured in-process `runtime: NEEDS_OPERATOR` and `outcome: CLEANUP_UNCERTAIN`. Existing error codes are retained except the Cell's own deadline uses R1 TIMEOUT. This is not an implementation of the frozen admin response protocol; no schema was changed. Errors do not fabricate accepted/null selection knowledge. Corruption remains untouched; admission closes rather than repairing, truncating, rolling back selection or resetting trust.
- All no-follow descriptor paths and `/proc/<actual owner PID>/fd/<held FD>` Kernel anchoring remain unchanged. No PID-derived runtime/death authority is added. Generation/ownership checks remain in the unchanged public Kernel.

## Exact hard-deadline limitation / contract tension

JavaScript in this existing in-process component cannot preempt a synchronous Linux filesystem syscall or an event-loop stall. `renameSync` can begin before the monotonic deadline and return after it; the rename can already have taken effect. Similarly, fsync can block beyond a ceiling. A JavaScript timer cannot provide a hard wall-time response or undo that syscall. The candidate checks elapsed time at actual durable-write boundaries (including after the accepted file fsync, before reaching rename), and after publication/commit. It stops further admission and returns NEEDS_OPERATOR on detected overrun/uncertainty; it never rolls a possibly published accepted selection back.

Thus this candidate supports a bounded asynchronous orchestration and no *post-failure continuation* publication claim, not an unconditional hard real-time or "a syscall can never finish after 30 s" claim. If frozen R1's numeric ceilings require the latter even under blocked synchronous IO, this in-process architecture does not fully meet them. Parent review must retain this gap rather than weaken the frozen limits or equate timer racing with cancellation. Independent supervision/IO isolation and its authority/lifetime design remain missing. No owner approval of new semantics is implied.

Verification and cleanup are distinct frozen phases: failure near the end of the activation budget can require up to a further cleanup budget. Not a claim that verification + activation + cleanup fit one 30 s window. Verification has elapsed-time checkpoints, but blocking synchronous verification/IO cannot be forcibly interrupted by this component either.

## Executable coverage and evidence

Existing 36 Cell tests are unchanged. New test-only subprocess syscall interception exercises real accepted rename effects, accepted-directory fsync failure, COMMITTED journal link failure, ENOSPC at a journal write, and an actual 31 s block after accepted-file fsync. The latter uses real elapsed time, not a mocked clock. Provider fixtures execute real throwing, hanging and late IPC activation/readiness and a hanging disposer. After failed operations, tests wait for real late completion opportunities and recheck accepted bytes. No test result or runtime report is substituted.

The uncertain-cleanup harness intentionally ends its owner process after checking that close is blocked and admission remains closed. That process exit is not evidence of STOPPED, independent reap, or restart safety. Preservation of selection after publication uncertainty is asserted, not mistaken for successful activation.

See R1-CELL-LIFECYCLE-CHECKPOINT.md for actual executed results and any remaining failures. `evidence/g7/cell-lifecycle/commands.txt` records exact commands and the approval blocker. `transferred-input.sha256` binds the inputs to the initial explicit-path transfer, not the formatted development bytes. Final local hashes are separate. No cross-host final-byte identity is claimed without receipts.

## Still missing / not qualified

Standalone supervisor and local admin transport; start/stop/upgrade/reinstall/recovery CLI; independently authenticated post-crash reap/restart; continuous readiness and grant renewal; candidate runtime/SDK assembly; complete inventory/SBOM; age backup/restore; independent two-host qualification. No production/custody signing, owner acceptance, commit, push, licensing change, other-profile edit, worker launch or scheduled job is authorized or performed here. Existing preparation/activation evidence remains historical evidence, not new qualification of these missing behaviors.
