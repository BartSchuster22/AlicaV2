# G7 acceptance matrix — planned, not executed

Every row is **NOT RUN**. These are required future tests, not fabricated receipts.
The [design](DESIGN.md) and [prerequisites](PREREQUISITES.md) control entry.

Scope decision pending in [concrete R1 review](CONTRACT-REVIEW-R1.md): G7-01 below
includes both execution modes, whereas the actual owner-signed policy authorizes
IPC only. The proposed first-profile adjustment requires explicit review; no row
has been silently waived or marked passed. Design/model tests are not these host tests.

| ID    | Future test                                                  | Required evidence/result                                                                                                                              |
| ----- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| G7-01 | Fresh online install and synthetic calls                     | Clean O identity/OS inventory; exact candidate, profile/lock/policy digests; real signed IPC providers/consumer calls and teardown; in-process activation rejected under the approved IPC-only profile                    |
| G7-02 | Fresh disconnected install                                   | Independent clean D; same immutable bytes; all runtime dependencies included; network denial and failed egress observations; no package-manager fetch |
| G7-03 | Unsigned/tampered/wrong-length/missing/extra artifacts       | Reject before candidate code executes; prior accepted state unchanged                                                                                 |
| G7-04 | Wrong publisher/root substitution/cross-domain signature     | Independently pinned root honored; no archive-driven bootstrap or policy override                                                                     |
| G7-05 | Profile/lock mismatch and shuffled catalogs                  | Canonical digests/order stable; bad explicit pins denied without fallback; local identity/secrets absent from portable files                          |
| G7-06 | Path traversal/links/duplicate paths/special files and races | No write outside private staging; no code execution; no-follow/ownership enforcement                                                                  |
| G7-07 | Size/count/decompression/disk exhaustion                     | Enforced approved limits before unbounded work; no corrupt accepted state or leaked staging resources                                                 |
| G7-08 | Expired/stale/missing/future/backward-clock trust            | Offline and online activation/delivery fail closed; current trust expiry quiesces workers with bounded cleanup                                        |
| G7-09 | Root rotation/revocation and downgrade                       | Dual-root transition plus signed next policy; persisted monotonic versions/high-water times; invalid rotation rejected                                |
| G7-10 | Journal crash injection at every durability boundary         | Fresh-process restart reconciles only valid committed state; corruption/ambiguity fail closed; no half-published acceptance                           |
| G7-11 | Exact reinstall                                              | No changes to release selection, Cell identity/secrets or high-water state; current trust still checked                                               |
| G7-12 | Concurrent administrative actions                            | Exclusive writer, deterministic conflict; read-only commands cannot race into mutation                                                                |
| G7-13 | Failed activation/upgrade and last-known-good recovery       | Prior trusted release recoverable; revoked prior release NOT revived; fresh instances/handles; no mutation replay                                     |
| G7-14 | Stop/restart and noncooperative process                      | Actual reap governs reported outcome and capacity; uncertain cleanup remains failed/quarantined                                                       |
| G7-15 | Encrypted backup and clean restore                           | Independent restored environment, verified inventory and separate recovery material; real synthetic calls; source environment preserved               |
| G7-16 | Wrong/missing recovery keys and stale/tampered backups       | No secret disclosure or trust rollback; fail closed; explicit lost-root procedure                                                                     |
| G7-17 | SBOM/provenance/license coverage                             | Dependency-complete actual shipped inventory, OS boundary, real builder/source/inputs; no identity-only or invented reproducibility claim             |
| G7-18 | Bootstrap trust and unsupported host                         | Tampered verifier/runtime denied before execution; missing confinement/ABI prerequisites denied without security downgrade                            |
| G7-19 | Redaction and authority separation                           | Planted secrets absent from logs/profile/lock/provenance; signing/private recovery keys absent from distributable bundle                              |
| G7-20 | Operator guide and complete regression                       | Commands run verbatim on clean environments; existing G1–G6 gates unchanged and green; exact-source CI and owner acceptance recorded                  |

## Required receipt shape (design, not a generated result)

Each result identifies test ID, PASS/FAIL/BLOCKED/NOT RUN, immutable candidate
source and artifact digests, profile/lock/policy digests, host identity/platform,
bootstrap and toolchain identity, input/fault injection, actual command/exit code,
raw output reference/hash, timestamps and reviewer disposition. Redact secrets,
not failures. Keep build, component, deployment and recovery evidence distinct.
Capture online/offline same-byte comparisons, active network-denial proof and
actual cleanup/reap observations. A branch name or fixed summary flag is not
immutable runtime evidence. Reject release with incomplete mandatory coverage.
