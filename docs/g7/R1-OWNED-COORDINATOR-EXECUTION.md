# R1 owned coordinator — execution and preservation record

This is an uncommitted parent-review checkpoint, not G7/G8 acceptance. Architecture, the exact read-only boundary and the remaining G7 checklist are in `R1-OWNED-COORDINATOR-CHECKPOINT.md`.

## Pre-edit gate and scope

Local `/home/herman/g7-implementation` was clean before creation of this evidence directory. Local and development tracked HEADs matched `122ac0d33cb0a1e08aef836ac7c964ae365a30b3`. The required `R1-EXACT-REINSTALL-PARENT-REVIEW.md` was read before editing. Development untracked G6 records and earlier G7 evidence were inventoried, not deleted/replaced. Before inventories contain 2,212 local and 3,783 development original regular-file bindings; their precise scope and the evidence-directory status nuance are in `preflight-and-commands.txt`.

SSH used the explicitly supplied identity, IdentitiesOnly, BatchMode, StrictHostKeyChecking and known-hosts file. Every development formatting/test command used `/home/alica-dev/AlicaV2` and `PATH="$PWD/.tools/node/bin:$PATH"`. No dependencies/toolchains were installed. No RAM/swap/service, deployment, production key/signing, licensing/protected artifact, commit/push or acceptance action was performed. One worker; no child agents or cron.

The exact source transfer allowlist is `evidence/g7/owned-coordinator/transfer-allowlist.json`: seven source/test files, two new documentation files and this new evidence prefix only. The sole changed pre-existing tracked source is `tools/g7-supervisor.py` (root-acquisition hook and inert detached lifecycle tick). Existing contracts, schema versions/fields, limits and public v1/v2 operations are unchanged.

## Final candidate qualification

Final development commands are retained verbatim in `run-review-candidate.sh.txt`. Its final focused selection exercises the unmodified CLI, real independent owned reaps/stopped maintenance, corrected concurrent sealing, and actual Unix credential/pidfd tests. It passed **4/4 Node tests**, including **9/9 real-process Python cases**. This is a targeted focused result, not a claim that the earlier expanded failure disappeared without correction.

The final **`npm run check` completed with exit 0** on 2026-09-18, from 08:29:49 to 08:48:02 UTC. Its Node runner summaries were **170/170 main tests, 160/160 G6 native tests and 272/272 G7 tests**, with zero failures, cancellations or skips. The full command also passed the 193-case schema runner, 30-case G6 context model, 11-case G7 bootstrap runner, 9 nested owned-channel process cases and final **121-case G7 contract model**, plus toolchain, formatting, build/type, API/schema/boundary, secret/dependency and external/isolated checks. Raw output and exit are `review-candidate/full-check.log` and `.exit`; `qualification-summary.json` extracts actual runner summaries and real-budget case timings. The earlier G6 IPC failure is retained, not erased by this later full pass.

The final source is bound at `review-candidate/{before-focused,after-focused,before-full,after-full}.sha256`. The returned formatted source archive is `returned-source-review-candidate.tar`; its member names/types were checked against the exact source allowlist before extraction. `verify-bindings.py` checks the final local files against every final focused/full source boundary, both HEADs, both before/after inventories and the new documentation. The generated `preservation-result.json` is the authoritative preservation result; it does not claim whole-filesystem coverage of ignored build/toolchain/system files.

## Original runs and failures retained

All paths below are relative to `evidence/g7/owned-coordinator/`. No later attempt overwrote the listed original raw log or input archive.

| Record | Actual result |
| --- | --- |
| `focused-1.log/.exit` | 20/20 passed; first process implementation |
| `focused-2.log/.exit` | 75/76 passed; pre-SEALED live Kernel high-water snapshot assertion failed |
| `focused-3.log/.exit` | 85/85 passed after correction and added coverage |
| `focused-final.log/.exit` | 95/95 passed; expanded fsync boundaries and deadline-return checks |
| `full-check.log/.exit` | Failed in unchanged G6 IPC same-source consumer: UNAVAILABLE versus expected DEADLINE_EXCEEDED; that stage was 159/160 |
| `ipc-failure-focused.log/.exit` | 2/2 passed, unchanged source/budgets; underlying earlier cause not established |
| `final-qualification/focused-final.log/.exit` | 96/97 passed; the seal race still made the same invalid live-Kernel no-op assumption; independent maintenance timeout and parent-loss cases passed |
| `seal-diagnostic.log/.exit` | Reproduced that assertion; actual diff was only kernel.json before shutdown/reap |
| `local-channel-final.log/.exit` | New unit-test caller had reversed pid/pidfd arguments; corrected without relaxing production authentication |
| `local-channel-final-3.log/.exit` | New parent-death unit test used a nonexistent helper name; corrected to the real guard_parent |
| `local-review-candidate-check.log/.exit` | Final local Python syntax, nine process cases, diff and bounded secret-pattern checks passed |

`failure-disposition.txt` records exact corrections and limitations. Original source input/return archives preserve the relevant revisions. The concurrency/crash corrections preserve and record opaque live Kernel high-water changes; they do not suppress accepted/journal/identity/G7-floor changes. All-file byte/hash/inode/mtime preservation remains strict at the actual post-reap maintenance boundary. No production contract, stopped guarantee or timer ceiling was weakened to make a test pass. The final deadline review also anchors readiness before GO and offline verification before worker creation, with fresh checks after authenticated receive, exact waitpid and result decoding.

## What the real path proves

The demonstration uses disposable fixtures accepted under the new coordinator FROM INCEPTION. It is not an adoption of a previous detached Cell. The initialized Cell is installed once by the real public Kernel owner. Its same identity, actual accepted release, journals, high-water files, original supplied archive and independently re-read private trust/authorization are used by the separate stopped worker. There is no replacement Cell or fresh installation at the transfer boundary.

Process traces in `review-candidate/focused-process/` and `review-candidate/full-process/` retain actual PIDs, owner spawn/reap observations, authenticated-channel phase boundaries, coordinator exact custodian reap and separate worker reap. `maintenance-binding.json` records before/after regular-file SHA-256, inode, mode and mtime for the successful read-only action. The result is `operation=verify-stopped`, `status=STOPPED`, `fence=RETAINED`, with the actual accepted selection. Those diagnostics are not serialized clean permits.

Qualification includes:

- Real AF_UNIX per-message credentials, anonymous inherited channels and held pidfds; socketpair creator versus actual child credentials; ancillary-free/plain stream and closed channels; forced and late reaps refused.
- Real public Kernel shutdown and exact prior owner-child normal reap before CLEAN, followed by exact custodian waitpid zero before the separate read-only worker. External flock/Cell contenders cannot enter the held relationship. Normal stopped residue cannot later be adopted.
- Coordinator and custodian SIGKILL before/after each of the three supervision-fence fsyncs; readiness/sealing/CLEAN boundaries; coordinator loss after custodian reap and around maintenance. Exact owner pidfd death at readiness/sealing denies maintenance. There is no residue retirement code to claim qualified.
- Queued and concurrent v1/v2 requests versus sealing, including start/stop/verify/status/upgrade probes. Sealing closes listeners and already-admitted clients; no successor or immutable transaction mutation is admitted by the race tests.
- Real FIFO-blocked owner cleanup with the unchanged 30-second budget; initial owned verification with the unchanged 300-second budget; independently blocked stopped worker with its unchanged 300-second verification budget. No scaled production timers or fabricated Kernel success are used.
- A genuine buffered CLEAN/normal child exit delayed past the actual cleanup budget, a blocked seal acknowledgment, and post-return authenticated-receive/waitpid deadline tests. Late results do not authorize maintenance.
- Actual parent-death guard containment and coordinator loss while a separate observer holds the blocked stopped worker's pidfd. Exit-readiness is labeled containment only, never normal clean-reap authority.
- Rejection of retained release, original-archive, independently supplied trust and authorization tampering without Cell writes; retained lock/fence and no restart/release after ambiguity.

## Exact limits and incomplete work

This completes a bounded read-only production-path component, not independent-process exact reinstall, mutating maintenance, upgrade, safe residue retirement, standalone distribution, backup/restore, two-host acceptance or G7 completion. The existing same-object exact-reinstall regression is retained separately and is not recast as independent-process proof. The stopped release inspector does not perform the opaque Kernel private-copy continuity probe used by that existing exact-reinstall method. A secure mutating bridge remains implementation/qualification work, not an invented missing owner approval.

Successful read-only completion deliberately retains supervision residue. It cannot authorize a later ordinary constructor/start or new coordinator. Uncertainty parks the live coordinator holding the lock; parent loss leaves the durable fence. No takeover based on cached STOPPED, PID disappearance, a socket path, checksums, timeouts or forced kills is introduced.

Credential cases executed as UID/GID 1000 with zero effective/permitted capabilities; a distinct-UID negative case is not claimed. New full-duration cases qualify the owned path, not every pre-existing detached verification deadline. Process/SIGKILL boundaries are not physical power-loss qualification. Synchronous OS setup/IO cannot be undone by signals, and stdout delivery is diagnostic rather than a hard-bounded transferable authority channel. Raw fixture final states, original archives and snapshot bindings are retained; this is not a complete bitwise image of every transient pre-fault opaque Kernel write. The earlier G6 IPC full-run failure remains part of the evidence even if a later whole run passes.

Owner-controlled production signing and final acceptance remain gated. The remaining G7 checklist is updated in the companion checkpoint without rewriting any historical manifest-bound record.
