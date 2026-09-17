# R1 activation working draft — historical worker handoff

> Superseded for current execution status by [the parent review](R1-CELL-ACTIVATION-PARENT-REVIEW.md). The following records the original blocked handoff, not current test results.

Baseline: 054efdd15662f5a82b254a498339e9e2d837e2e2. This is an incomplete local implementation handoff, NOT a tested activation deliverable, production authorization, or acceptance claim.

Read before editing: owner approval, parent preparation review, R1 contract review, design, frozen schemas and limits; existing preparation, fixture, durable-write and public Kernel lifecycle/cleanup code. Read-only development discovery returned the baseline commit and Node v24.21.0. Existing unrelated G6 untracked files were observed and left untouched.

## Draft source boundary

`CellPreparation.install()` now attempts first installation through existing staging/admission, private activation, public `Host.startProfile`, and fixed real echo/consumer call checks. It intends accepted-file durable replacement before COMMITTED, retaining the Host and flock until explicit asynchronous shutdown. All new authority helpers use runtime-private fields/methods. Original release manifests, frozen schemas, Kernel, SDK, providers, dependencies and CLI are unchanged.

This is an in-process component, NOT a persistent daemon, admin socket, general upgrade engine or runtime assembled from the candidate archive. It has no public arbitrary operation interface or grant-renewal loop. CLI install/start/stop/upgrade/verify/backup remain unavailable. First installation only is intended; exact reinstall is not implemented.

Fresh-process post-ACTIVATING recovery deliberately does not infer IPC worker death from flock acquisition, PID absence, or stored status. It attempts NEEDS_OPERATOR for unfinished activation and reports NEEDS_OPERATOR runtime for a committed selection whose workers cannot independently be proven dead. It does not reopen COMMITTED. Successful same-process shutdown uses public Kernel cleanup reports; it does not create a durable proof usable by another process.

## Execution blocker

The first scoped SCP + native build + positive test operation returned `pending_approval`, pattern `tirith:raw_ip_url`. The exact command and complete returned fields are preserved in `evidence/g7/cell-activation/blocked-operation.json`. Operation stopped; no alternative transfer or guard bypass attempted. Parent handling is required for this security result, not owner approval of an API gap.

No native build, activation test, preparation regression, formatting suite or full check ran for these changes. Development transfer was not confirmed. Local Node22 has not been used as a replacement for the pinned runtime. The single new positive test is UNEXECUTED SOURCE. Historical preparation results do not qualify these changes.

## Remaining defects / required work

- Positive IPC activation/readiness/publication/shutdown must actually run and be debugged on Node24.21.0 before any operational claim.
- Required new external-SIGKILL activation/publication boundary tests, real process contention during activation, stale/corrupt accepted/journal cases, and real failure/cleanup tests are not yet implemented. Existing preparation tests were not suppressed or edited.
- Total lifecycle deadline enforcement needs review: underlying Kernel bounds individual operations, not necessarily the complete 30-second Cell activation/cleanup ceiling.
- Runtime status currently checks ACTIVE instances, not continued grant/trust validity or renewal; it is not a sustained readiness guarantee.
- Corrupt selection/journal currently throws fail-closed rather than returning a structured NEEDS_OPERATOR status. Publication uncertainty throws and poisons the object; this needs a precise externally visible outcome contract/test.
- Generic stage catch poisons the instance after a clean activation rollback; shutdown/close remain available, but same-object status does not. Recovery and retry behavior need qualification.
- Post-activation recovery's early conservative branch needs review against Kernel-owned same-version trust digest continuity; no new grants/code are started there, but it currently bypasses the normal recovery bootstrap continuity check.
- No independently authenticated post-crash reap mechanism; no automatic committed restart, upgrade, exact reinstall, release retry/retention cleanup, or daemon/admin interface.
- Full archive/runtime assembly/SBOM, age backup/restore and independent two-host qualification remain separate required work.

No commit or push. No production signing, keys, acceptance-host changes, network configuration changes, or unrelated profile/G6 edits.
