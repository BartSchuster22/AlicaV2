# R1 clean-stop / same-accepted-revision start — review checkpoint

Baseline: published `59f5eef3bf792d89a7193d753df0a85158a9a62c`. This is an uncommitted bounded component for parent review/publication, NOT G7 acceptance, standalone delivery, upgrade, reinstall, general recovery, or offline mutation authority. Frozen contracts/limits and all G6 source remain unchanged. Historical worker, failure and parent evidence is retained in place.

## Architecture and authority

The existing independent Python custodian remains the lifetime exclusive-flock owner. It still initially accepts only an initialized, never-installed Cell with no supervision residue. A new supervisor cannot use an existing accepted Cell/residue as restart permission, even if the prior supervisor died while cleanly stopped. No stale-marker/socket cleanup or offline handoff is added.

The only new admission is an authenticated frozen `start` request to the SAME live supervisor after a successful `stop`. The permit exists only in that supervisor's memory. It requires all of:

1. A real clean public Kernel `shutdown()` report: no unsettled work/resources, no restart-required cleanup, no timed-out resources or failed disposers.
2. The owner's validated STOPPED selection agrees with its prior known accepted sequence/digest.
3. Normal exit code zero AND `Popen.poll()`/waitpid of that exact child, observed through its held Linux pidfd. A stopped message, EOF, a PID, marker, or forced kill alone is insufficient. The existing cleanup ceiling applies through reap, and deadlines are checked again after selector wakeup before granting the permit.
4. No uncertainty latch, no operation in flight, correct OS peer UID, incarnation and expected accepted sequence.

Start consumes that permit before spawning. The custodian never closes/unlocks its root descriptor between owners; each owner adopts a duplicate of the SAME locked open-file description. Old control/pidfd resources are retired only after prior reap. Stale selector events from the old control socket cannot be processed against the successor socket. Every owner runs the unchanged native authenticated `guardParent` before adopting custody or doing Cell work. Setup failure exits the custodian fail-closed with residue, rather than reusing a stale owner/pidfd or issuing a new permit. A child must pass the parent guard before adoption; loss of an established parent triggers the OS guard, not an event-loop-only callback.

## Actual same-revision path

`g7-cell-owner.mjs` rereads the existing private operator input file on every launch. Its existing archive/trust/authorization shape is retained; for a successor the archive field is NOT opened or used to select/reconstruct a candidate. Current trust/authorization come from the freshly read owner-only input, not candidate trust snapshots.

`CellPreparation.startAccepted` requires supervised custody; ordinary/offline Cell construction cannot invoke it successfully. It validates Cell identity, the complete accepted/journal relation and terminal COMMITTED/ABORTED state, plus the supervisor-pinned canonical accepted digest. It does not call install/stage/recover, create a new transaction, reopen a terminal journal, increment accepted sequence, rewrite accepted.json, or repair residue.

`inspectStoredRelease` verifies the actual preserved content-addressed release. It checks the exact expected directory/file set (including the separately accepted authorization file), private no-follow reads, bounded bytes and signed raw artifact inventory. It shares the existing full release inspection logic: current signatures, revocation, immutable policy/profile/lock identity, package indexes/manifests/descriptors, resolver bindings and fixed IPC-only profile restrictions. It never fabricates an archive, substitutes another candidate, or uses an input archive as accepted authority. Missing/extra/changed/linked files fail closed.

Operator authorization must satisfy the frozen schema, equal the preserved authorization canonically and have the exact accepted authorization digest. The exact original profile and lock are reused. Current trust is checked against nondecreasing G7 floors; the public Kernel also enforces its own opaque persisted trust continuity. G7 floor updates are durable; opaque Kernel state is neither decoded nor reset. A later valid revocation version is supported if the original release remains authorized. A changed/expired original policy cannot silently acquire a replacement policy/lock under this same-revision operation; a separately authorized future upgrade is outside this component.

The successor uses only existing public Kernel bootstrap/discoverReleasePackage/identity/issueGrant/plan/startProfile/context.require/inspect/shutdown operations. Each runtime has freshly discovered identities and new grant UUIDs bounded by the same original authorization lifetimes and current metadata expiry. No grant/handle is loaded from storage, extended or renewed. Expired grants remain truthfully FAILED before a clean stop; a later explicitly authorized successful start obtains fresh grants, not revived grants.

Installation and same-revision start now share one fixed readiness method: the original profile's actual public startProfile plus direct echo and unchanged-consumer echo calls and ACTIVE inspection. A spawn receipt is never RUNNING. Status asks the active owner for a fresh public inspection, including grant validity/audit state. A completed start may report FAILED if grants have already expired; it is never replaced with a cached RUNNING assertion.

## Failure and timeout behavior

Verification retains 300000 ms; activation/readiness retains 30000 ms; cleanup retains 30000 ms; admin admission/connection retains 30000 ms, max eight connections and 65536-byte frames. No new ceiling. Start may outlive its client connection while verification continues; disconnect/timeout is not cancellation, rollback or permission to replay. Concurrent operations conflict rather than queue a mutation.

Any successor validation/activation/readiness/durability failure is deliberately sticky, even if a later cleanup looks clean: no automatic or explicit retry permission is minted in this slice. Failed successor validation discards the cached selection response; the existing frozen schema has no unknown-selection envelope, so the connection closes without an invented sequence/digest. This is conservative loss of response availability, not a new wire schema. Later status/start also closes while selection is uncertified. With an already known running selection, forced death/uncertain stop reports NEEDS_OPERATOR where a truthful frozen envelope is available; start remains DENIED. Accepted bytes are not rolled back or rewritten on either path.

As before, Linux scheduling/uninterruptible IO is not hard-real-time. A pending syscall may complete after a deadline/signal; no force kill proves descendant cleanup. The custodian closes admission and retains the fence/uncertainty. A readable file, later owner exit, residue removal by an out-of-scope compromised same UID, or marker does not create supported restart authority.

## Separate owner decisions

See [R1-ADMIN-OWNER-DECISION-BRIEF.md](R1-ADMIN-OWNER-DECISION-BRIEF.md). Write-half-close remains an extra unresolved requirement, not silently approved length-framing semantics. Unknown accepted selection still lacks a truthful frozen response. The brief supplies compatible alternatives, exact proposed semantic/schema/version-routing changes, unchanged ceilings, and required tests. It is a draft only; no proposed v2 schema/endpoint exists in this checkpoint. Restricted transport is NOT declared fully conformant.

## Changed-source allowlist

Only these exact source/test paths are transferred in either direction:

- tools/g7-cell.mjs
- tools/g7-cell-owner.mjs
- tools/g7-release.mjs
- tools/g7-supervisor.py
- tests/g7/supervision.test.mjs
- tests/g7/clean-start-block.mjs

The last is test-only: actual blocking FIFO opens and faults AFTER actual rename effects; no fake Kernel/death/readiness reports or clocks. Original custody/seven supervision tests (including parent-death regression), Cell tests and full regressions remain required. Disposable test signing uses only the already-existing fixture signer and newly generated ephemeral fixture keys; no production/custody signing or key access occurs.

## Qualification limits retained

Trusted development Node/Python/native runtime only; no candidate-runtime assembly/SBOM or two-host qualification. No grant renewal/continuous-readiness guarantee. No upgrade/reinstall, general postcrash restart, repair/reconciliation, backup/restore, lock release to offline mutation, production signing, service migration or G7 acceptance. Full 300-second external verification expiry, distinct-UID negative credential test, and direct expiry of the prior in-process Cell cleanup timer remain unqualified unless separately recorded in the execution results. This checkpoint does not erase those older gaps.

Execution results, exact source/log hashes, transfer/preservation receipts and any blockers are recorded in `evidence/g7/clean-start/` and the accompanying execution record. No commit/push, delegation worker, scheduled job, new toolchain, other-profile edit, or licensing/protected-host operation is performed.
