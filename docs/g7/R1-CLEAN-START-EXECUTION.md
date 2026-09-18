# R1 clean-start execution record — uncommitted parent-review checkpoint

Baseline on local and development: `59f5eef3bf792d89a7193d753df0a85158a9a62c`. No commit/push or G7 acceptance. Implementation and remaining boundaries are in [R1-CLEAN-START-CHECKPOINT.md](R1-CLEAN-START-CHECKPOINT.md); the separate unapproved protocol proposal is [R1-ADMIN-OWNER-DECISION-BRIEF.md](R1-ADMIN-OWNER-DECISION-BRIEF.md).

## Execution environment and transfer

All JavaScript execution/formatting and the full regression used `/home/alica-dev/AlicaV2` on the authorized development SSH host with `PATH="$PWD/.tools/node/bin:$PATH"`: Node **24.21.0**, npm **11.19.0**, Python **3.12.3**, and the existing pinned native toolchain. Local Node18 was not used. No toolchain was installed. Local Python performed hashing, evidence checks and the final credential-pattern scan.

`evidence/g7/clean-start/commands.jsonl` preserves the exact SSH commands and timestamps. The specified identity, IdentitiesOnly, BatchMode, StrictHostKeyChecking and known-hosts file were used. There were no unexpected SSH/transport or permission failures in this execution. Intentional authentication/validation failures, syscall uncertainty and external lifecycle deadlines are exercised as named passing negative tests, not represented as successful starts.

The exact source/test transfer allowlist, in both directions, was:

1. `tools/g7-cell-owner.mjs`
2. `tools/g7-cell.mjs`
3. `tools/g7-release.mjs`
4. `tools/g7-supervisor.py`
5. `tests/g7/supervision.test.mjs`
6. `tests/g7/clean-start-block.mjs` (new test-only preload)

The initial transfer preceded the new preload and therefore contained only the first five paths. Later transfers and the final return contained exactly the six listed paths. No directory synchronization, deletion or unrelated-file extraction was used. Documentation/evidence are local review additions; they were not transferred over development's prior evidence.

## Actual results

| Run | Result | Scope |
| --- | --- | --- |
| `positive-initial` | exit 0 | Real clean-stop/start smoke test on intermediate source |
| `targeted-expanded` | exit 0 | Expanded intermediate custody/supervision tests; retained as intermediate evidence |
| `targeted-final-candidate` | exit 0; **35 passed, 0 failed/cancelled/skipped** | Native custody plus supervision, including the original seven supervision cases and parent-death coverage |
| `full-check` | **exit 1** | Stopped at formatting; regression tests did NOT run in this attempt |
| `format-correction` | exit 0 | Second formatter pass, full formatting check and independent single-file check passed |
| `full-check-corrected` | **exit 0** | Complete `npm run check`, followed by `git diff --check`; source/frozen-file hashes before and after |
| `local-final-checks` | exit 0 | Local diff whitespace and credential-pattern checks |
| `verification-run` | exit 0 | Exact returned/development/full-log hash agreement; preservation and post-test process checks |

The first Prettier write was not stable on one nested `h.context(...).require(...)` expression in `tools/g7-cell.mjs`; the following full check rejected it. The second write changed only formatting. The raw failing log, the exact first-pass Cell source, and `format-correction.diff` are retained. The 35-test targeted run used the first formatted bytes; the complete corrected regression reran those tests against the final returned bytes. No failure log was overwritten and no test was disabled to obtain success.

One background monitor wait requested 180 seconds, was clamped by the tool to 60 seconds, and returned a monitoring timeout while the regression continued. This did not kill the process or change a test/SSH/lifecycle timeout. The later wait returned actual exit 0.

The corrected full regression reported:

- **170/170** foundation/Kernel/contracts/SDK Node tests.
- **160/160** IPC Node tests.
- **189/189** G7 Node tests, including Cell preparation/lifecycle and the 35 custody/supervision tests. The 35 are included, NOT additional to 189.
- Python suites: **193** specification, **30** G6 design-model, **11** bootstrap, **119** G7 contract/model tests; all passed.
- All three reported Node suites: zero failures, cancellations or skips.
- Full pipeline formatting, build, typecheck, schema synchronization/validation, boundaries, credential patterns, dependency/license checks, isolated/external SDK checks and existing native builds completed successfully. G6 model/build outputs retain their own non-qualification labels; running them is not a G6 change or new qualification claim.

## Real new lifecycle coverage

The disposable fixtures/processes/sockets demonstrate:

- Original archive removal before same-revision start; unchanged accepted bytes, cell identity, supervisor incarnation, accepted sequence, release tree and journals across successful repeated cycles.
- No successor before actual previous-child reap, even after a clean stopped message; killing that blocked prior owner never grants a permit.
- Continuous custodian lock exclusion while stopped, while successor launch is blocked and after actual readiness.
- Wrong incarnation/sequence and start while running remain rejected; concurrent start conflicts; an accepted request's client disconnect does not cancel it or authorize another owner.
- Expired grants report FAILED, cannot trigger start directly, and require clean stop plus fresh authorized issuance. New valid revocation metadata advances floors without changing accepted bytes; restoring older metadata fails.
- Fresh authorization, signatures/revocation/expiry/policy, accepted sequence/selection/journal, artifact bytes, extra files, symlinks, future floors and opaque Kernel-residue failures all deny execution/retry without rewriting selection.
- Actual rename effects followed by injected publication/floor uncertainty never grant restart permission; accepted bytes remain present rather than being rolled back.
- The SAME signed preserved provider has time-dependent fixture behavior: successor public activation fails, or its real readiness echo fails, without replacing its accepted artifacts. Neither yields a RUNNING response or retry authority.
- Real synchronous FIFO stalls during successor activation and successor cleanup hit the unchanged external 30-second ceilings, with sticky uncertainty and retained exclusion.
- Parent death terminates the blocked successor through the unchanged native guard. Clean-stopped residue after supervisor death also refuses takeover.
- The existing extra write-EOF restriction is measured directly: delayed trailing bytes never dispatch stop; a complete but unsealed request reaches the existing connection deadline without mutation. This test documents the protocol gap; it does not approve or hide it.

Test preloads inject actual blocking opens and errors AFTER actual rename effects; they do not replace public Kernel reports, readiness, grants, clocks or death receipts. Ephemeral fixture keys/signatures are used by the existing disposable test framework only. No production/custody key access, release signing or service migration occurred.

## Source binding and preservation

`source-and-preservation-verification.json` records the final six source SHA-256 values, checks them against development, and verifies their before/after occurrences in the corrected full log. `return-final-source.json` independently records the exact returned bytes.

The before/after development inventory comparison found exactly five changed existing files and the one new allowlisted preload. **528 pre-existing development files were unchanged**, including **all 42 development-only prior files**; **zero files were removed**. All original local tracked files outside the six-path source allowlist are unchanged. This covers the frozen schemas/limits, G6 source and the inventoried prior/worker/failing evidence and generated protected files; none was overwritten by transfer. Existing ignored build outputs are not represented as a comprehensive filesystem inventory.

Frozen hashes remain:

- `docs/g7/draft/contracts.schema.json`: `917e9ab5aa42e9fd344ca380fee1bb4ba7ab53e1044e41e6d2fb4583b0fadc32`
- `docs/g7/draft/limits.json`: `75a0fa6abe34d1c6bbfba24d10e509b32e2bbc40fba3ab372583de07d975d7d2`

The post-test development process check found no remaining G7 supervisor/owner and no process-inspection permission errors. This housekeeping observation is NOT a substitute for the exact-child waitpid/public-shutdown proofs used by the implementation, and does not assert descendant death based on PID absence.

## Unresolved decisions / qualification limits

- Owner decision remains required on write-half-close semantics and unknown-selection responses. The decision brief is a DRAFT ONLY. No frozen schema/ceiling, new endpoint/version or response meaning was adopted. Restricted transport remains not fully conformant.
- Failed successor validation/activation/readiness/durability intentionally consumes the permit and remains sticky, even after apparently clean subsequent cleanup. Unknown selection closes without a fabricated response; no recovery/retry path is authorized here.
- No general postcrash restart, upgrade/reinstall, offline mutation, repair/reconciliation, backup/restore, grant renewal, standalone packaging/two-host qualification or G7 acceptance.
- Full 300-second external verification expiry, distinct-UID negative credential qualification and direct expiry of the prior in-process Cell cleanup timer remain unqualified in this checkpoint. Startup setup-failure branches are fail-closed but not exhaustively syscall-fault-injected.
- No delegation workers, scheduled jobs, other-profile edits, licensing/protected-host operations, commit or push. Parent retains review/publication authority.
