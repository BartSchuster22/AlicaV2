# R1 supervision checkpoint — historical worker handoff

> Current source corrections and independent verification are tracked in [the parent execution review](R1-SUPERVISION-PARENT-EXECUTION.md). Worker results below apply to the pre-correction source.

Baseline remains `0b70b71f69f9548574d38d51937769499cdb5ff1`; all changes are uncommitted. See R1-SUPERVISION-PARENT-REVIEW.md for scope, architecture, exact unresolved contract restrictions and operator invocation. This does not repeat preparation, activation or in-process deadline work as new milestones.

## Executed results

Development host: `/home/alica-dev/AlicaV2`, existing Node **24.21.0**, Python **3.12.3**, existing authenticated pinned Zig/native build toolchain. No local Node18 runtime qualification or toolchain installation.

- Initial native build and initial targeted three-test run: exit 0. Historical implementation before outer-cleanup-budget hardening; not final-source qualification. Raw `evidence/g7/supervision/targeted-initial.log` contains the native compiler invocation/input/output receipt and pre-format source hashes.
- Expanded final targeted run: **7 passed, 0 failed**, exit 0, approximately 75 seconds. Raw `targeted-expanded.log`. Its leading input hashes precede Prettier; final tested source is bound separately.
- Final `npm run check` followed by `git diff --check`: **exit 0**. Node suites **170 / 160 / 161**, all failures/cancellations/skips zero. Python suites **193 / 30 / 11 / 119**, all OK. The 161 G7 tests include the existing 50 Cell tests plus the seven new custody/supervision tests; baseline results are not substituted for this run. Raw `full-check.log` preserves the complete combined output.
- Final source SHA256 values printed both before and after the development full run match each other and all eight local source/test files. `source-binding.json` mechanically verifies and records those equalities, unchanged frozen schema/limit hashes, and raw log hashes. No commits or parent acceptance are implied by this worker receipt.
- Post-run development diff check passed; scoped read-only `/proc` inventory found no live `g7-supervisor.py` or `g7-cell-owner.mjs` command lines under the development UID. Raw `post-run-state.log`. This housekeeping observation is NOT descendant-reap or runtime death authority.
- Local Python syntax parsing and `git diff --check` passed. Formatted source returned by explicit-path transfer; no approval blocker occurred. Exact execution/transfer commands are recorded in `commands.txt`.

## What was exercised

1. Native descriptor adoption rejects unlocked custody, a separately opened description instead of the held lock, wrong inode, and wrong mode. Closing the adopted descriptor does not release the supervisor's flock.
2. Real first-install public Kernel IPC readiness and exact-schema local status/stop; stop requires the actual clean Kernel shutdown report AND normal exact-child reap before responding STOPPED.
3. External pidfd SIGKILL of the real owner yields sticky NEEDS_OPERATOR, never descendant-cleanup success. Another writer remains excluded, including by durable residue after supervisor termination; new supervision refuses residue.
4. Actual synchronous named-FIFO IO blocks the owner during stop. The supervisor remains responsive, another writer cannot enter, and the unchanged 30-second SUPERVISOR outer cleanup deadline forces uncertainty without restart. Final code starts this budget at stop dispatch, not at an owner acknowledgment and not via the admin connection timeout.
5. Activation phase blocked in actual synchronous FIFO IO is killed by the external deadline. A held OS pidfd observes exit; accepted.json never appears and another writer remains excluded.
6. Actual Unix peer credentials, private socket permissions, wrong incarnation/sequence, unsupported operations, caller-supplied UID rejection, malformed/duplicate/deep/invalid-UTF8/oversized/empty bodies, and the eight-connection ceiling.
7. The initiating launcher really exits before installation observation; the independent owner subsequently serves RUNNING status and clean stop through the authenticated endpoint.

## Limitations / blockers retained

- Component-only trusted development runtime, not assembled standalone delivery, candidate-runtime/SBOM or two-host qualification. Python is an explicit host dependency.
- Two unresolved admin-contract restrictions: no truthful frozen response envelope when accepted sequence/digest are unknown during uncertain publication; and required client write-half-close to seal the single frame before execution, which is not specified explicitly by the frozen length-framed protocol. Those requests fail closed. Full R1 admin conformance is NOT claimed.
- Status/stop only. Start and verify return DENIED; upgrade/reinstall/recover/backup/restore and offline-mutation handoff are unavailable. Even clean stop keeps custody/residue; no automatic marker/socket removal or restart.
- The supervisor cannot make Linux uninterruptible IO hard-real-time or undo an in-flight rename/fsync. SIGKILL is not evidence of all descendants reaped. Uncertainty always retains the fence.
- The new genuine fixture covers direct SUPERVISOR outer cleanup expiry. Direct expiry of the prior in-process Cell cleanup timer remains unproven. Full 300-second external verification expiry and a distinct-UID negative peer test are also not newly covered.
- No grant renewal or continuous-readiness claim. Existing short-lived grants can expire and subsequent status reports FAILED while the owner process remains alive. Detached launch discards stderr; durable diagnostic logging is not implemented.
- Same-UID threat assumptions are unchanged. No private Kernel internals or G6 source changes, no production/custody signing, owner acceptance, licensing/protected-artifact access, other-profile edits, workers, scheduled jobs, commit or push.

Documentation and evidence are local review artifacts. Only the eight explicitly named changed source/test files were transferred to the development checkout; existing unrelated G6 evidence was preserved.
