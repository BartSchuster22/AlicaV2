# G7 R1 Cell lifecycle checkpoint — historical worker handoff

> Current transfer, source-binding and independent full-regression results are in [the parent execution review](R1-CELL-LIFECYCLE-PARENT-EXECUTION.md). The text below preserves the original handoff, not the current publication status.

Base: `ce6d72423b426ff8e44e10d624ab7640dc7f30ea` in both the initially clean implementation worktree and the development checkout. No commit/push or owner acceptance performed. Preparation/activation are not counted as new milestones.

## Result actually executed

The explicit three-path transfer, development Node syntax check, pinned Prettier formatting, and targeted test command completed with exit code 0. Toolchain discovery returned Node `v24.21.0` on the development host. The targeted suite reported:

- tests 50; suites 0; pass 50; fail 0
- cancelled 0; skipped 0; todo 0
- duration_ms 175007.542416

These are the existing unchanged 36 Cell tests plus 14 added lifecycle tests, not 50 new tests. The captured process-tool rendering is `evidence/g7/cell-lifecycle/targeted-process-output.log` (transcribed process log rendering with a final newline; not claimed to be a lossless raw SSH byte stream). The background process session was `proc_5a07fc5865fc`; its final status was exited, exit_code 0, completion_reason exited.

Actual new executions include late/hanging/throwing IPC, failed readiness, shared activation/readiness deadline, retained-candidate conflict after clean failure, actual syscall-boundary failures/delay, and structured committed-corruption rejection. The hanging-disposer test completed in 5220.091461 ms: it proves conservative handling of actual uncertain cleanup, **not** that this fixture reached the Cell's 30 s cleanup timer. Direct expiry of that outer cleanup timer remains a coverage gap. No mock Kernel, fake death receipt, substituted callback result or fake clock was used.

The published baseline full regression counts supplied by the parent remain Node 170/160/140 and Python 193/30/11/119. They are historical baseline results. No full `npm run check` was run for this candidate after the approval guard below; do not relabel the baseline regression as a new-candidate regression.

## Approval blocker / byte binding

Returning development-formatted files with SCP was blocked with `status: pending_approval`, `approval_pending: true`, `exit_code: -1`, `pattern_key: tirith:raw_ip_url`. The exact command and diagnostic are preserved in `evidence/g7/cell-lifecycle/commands.txt`. It was not retried, and no alternate transfer or subsequent remote execution was initiated. Only the already-running target process was monitored to completion. No unrelated development G6 files were deleted or modified.

`transferred-input.sha256` records the exact three local source/test inputs sent before development formatting. Local source/test bytes have not been edited since that transfer. The development command formatted them before executing. Return transfer and final cross-host hashes are therefore unavailable: **do not claim final local/development byte identity**. The final local changed-file receipt is `final-local.sha256`, excluding the receipt itself. New docs/evidence are local only. Local formatting has not been asserted to match the development formatter output.

## Review and bounded limitations

See `R1-CELL-LIFECYCLE-PARENT-REVIEW.md` for the source review, preserved trust/ownership/descriptor/public IPC guarantees, and the exact in-process synchronous-syscall hard-deadline limitation. Timers cannot preempt synchronous fsync/rename, and a rename initiated before expiry can finish after it. The candidate prevents publication by late asynchronous continuations and treats detected publication/durability overrun as NEEDS_OPERATOR without rollback. An unconditional hard-real-time claim would be false.

Clean-failure reuse is deliberately limited: same-object status works after proven clean activation failure; a retained identical candidate is rejected before a new transaction. General exact retry/reinstall is not implemented. Unknown cleanup or durable selection/journal state is not advertised as STOPPED/ABORTED or restartable. Structured error metadata is in-process only, not a new admin wire contract.

Standalone supervisor/admin, upgrade, runtime/SDK assembly, complete SBOM, age backup/restore, independent post-crash reap/restart and two-host qualification remain missing. Production/custody signing, licensing artifacts and other Hermes profiles are untouched. No additional agent workers or scheduled jobs were launched.

## Parent action, through approved paths only

1. Review this bounded candidate and the hard-deadline tension; do not weaken frozen R1 ceilings to call the component complete.
2. Reconcile/format the exact three changed source/test paths, establish post-format hashes on both hosts and preserve G6 untracked evidence.
3. Rerun targeted tests against the final bound bytes and full `npm run check` using the pinned development toolchain when approved. Add direct outer-cleanup-expiry qualification without fake reports/clocks if a valid fixture is available.
4. Parent review precedes any commit/push. No owner acceptance is requested or inferred by this checkpoint.
