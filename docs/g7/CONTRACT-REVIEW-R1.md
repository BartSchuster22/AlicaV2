# G7 concrete contract candidate R1

**Status: APPROVED by owner for R1 implementation; not a runtime qualification.** See [owner approval](R1-OWNER-APPROVAL.md). This closes the _description_ gap in ADR-009 with closed schemas and an executable reference model. Owner approval of this concrete candidate is separate from the already-given instruction to implement G7. No new approval of the overall project direction is requested.

Artifacts: [closed schemas](draft/contracts.schema.json), [exact limits](draft/limits.json), [proposed recovery dependency](draft/recovery-dependency.json), `tools/g7-contract-model.py`, `tests/g7/test_contract_model.py`. The generator must reproduce schema/limit bytes structurally; CI checks this. Existing normative schemas, Kernel API and signature domains are unchanged.

## Decisions submitted for review

1. **IPC-only first G7 profile**, consistent with the owner's actual signed policy. The earlier draft G7-01 matrix called for both in-process and IPC providers. That stronger draft requirement conflicts with the signed IPC-only authorization. Approve changing that row for this first profile to real IPC provider/consumer calls plus rejection of in-process activation. G6's accepted same-consumer in-process/IPC equivalence tests remain unchanged and mandatory in regression. If both modes are required in G7 instead, the owner must separately authorize a version-2 policy; do not silently widen version 1.
2. **Uncompressed bounded USTAR** for release transport. Larger transfers are the deliberate trade-off for excluding decompression bombs and extra decompressor dependencies. No gzip/xz/zstd, PAX, GNU extension, sparse entry or archive-supplied installer hook in this first profile.
3. **Standard age v1 encryption with an X25519 recipient** for application backup. Proposed upstream age version/asset digest is pinned in the dependency candidate, not yet downloaded/installed/qualified. Use the existing reserved recovery key, not new production keys. Include the verified age tool and its complete dependency/license inventory in offline delivery. Do not implement an original cipher/protocol or permit external age plugins. Standard key-format conversion and encrypted round trips require tests before production use.
4. **Stopped-source backup and same-identity restore.** No advertised hot backup. Restore requires externally approved current trust floors and proof that the original Cell is stopped, preventing an active identity clone. Missing current floors deny same-Cell recovery; do not guess that an old backup is latest.
5. **Local-only supervisor administration and explicit operator capability intents.** No network admin endpoint, service integration, automatic service installation or persistent serialized grant/handle authority. No secret/event grants in the minimal synthetic profile.

These approvals do not sign a release, waive two-host qualification, approve distribution licensing, or accept G7.

## Artifact paths and frozen-schema mapping

The bundle schema forbids `@` in paths. Therefore raw workspace `node_modules/@alica/...` trees cannot simply be archived. Do not relax the frozen pattern or smuggle symlinks into an archive. Build a deterministic flattened runtime/module layout using the already pinned TypeScript AST tooling to rewrite only resolved application import/export edges; reject unresolved/dynamic external dependencies. Preserve internal relative file relationships and record all source-to-output transformations in provenance. Actual executable output, worker location and native ABI must be tested on both hosts.

| Fixed path/prefix                                                       | Existing bundle artifact kind | Binding                                                            |
| ----------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `runtime/`                                                              | `runtime`                     | All Node/native/JS/runtime license bytes                           |
| `plugins/<id>/manifest.json`                                            | `manifest`                    | Raw bytes; canonical package index binds the same manifest         |
| `plugins/<id>/index.json`                                               | `manifest`                    | Raw inventory binding; canonical digest is package identity        |
| `plugins/<id>/code/`                                                    | `plugin`                      | Raw immutable code bytes                                           |
| `plugins/<id>/contracts/`                                               | `descriptor`                  | Raw bytes plus canonical descriptor identity                       |
| `profile/profile.json`                                                  | `profile`                     | Raw bytes plus canonical profile identity                          |
| `profile/lock.json`                                                     | `manifest`                    | Raw bytes plus canonical lock identity                             |
| `trust/policy.json`, `trust/revocation.json`, their detached signatures | `manifest`                    | Inventory-bound snapshots, never authority to override local trust |
| `schemas/`                                                              | `runtime`                     | Exact offline validators/schemas                                   |
| `sbom/sbom.json`                                                        | `sbom`                        | Complete shipped dependency coverage                               |
| `provenance/build.json`                                                 | `provenance`                  | Real source/build/input/output records                             |
| `docs/`                                                                 | `documentation`               | Operator and license notices                                       |

`bundle.json` and `bundle-signature.json` are the first two regular USTAR entries and are not self-inventoried. All subsequent entries correspond one-to-one to the signed artifact inventory; no extras, including non-executable extras. Inventory count <=4096; total entries <=4098. The detached signature uses the unchanged bundle domain. The bootstrap verifier/root pin is delivered independently, not trusted by loading the candidate Node executable.

Root/public trust records accompanying the candidate are evidence only. Current owner-approved trust metadata is separate and must authorize the immutable candidate policy/lock binding. A later policy version may require a newly resolved/signed profile/lock; never silently reuse an old policy digest. Root rotation and metadata renewal do not reset local floors.

## Numeric limits and extraction

`draft/limits.json` is authoritative for this candidate: 1 MiB JSON, depth 32; 1 GiB release tar and expanded bytes; 256 MiB per file; 240-byte ASCII paths and 16 components; 512 MiB free-space reserve; verification 300 s; activation/cleanup each 30 s. Backup plaintext is bounded at 2 GiB and ciphertext at 2 GiB plus 4 MiB framing allowance. Bound actual consumed bytes and final output, not only claimed sizes. The limits are ceilings, not performance guarantees.

USTAR headers must have valid checksums, regular-file type, empty link target, portable nonnegative octal size and supported `ustar` magic/version. Reject embedded NUL ambiguity, prefix/name aliasing, duplicate or case-colliding normalized paths, devices, directories, links, traversal and nonzero padding. Require exactly two zero EOF blocks and reject trailing bytes. Reconstruct directories locally. The full layout is checked before activation; no archive-provided code runs during verification.

Open the owner-only Cell/staging root with no-follow directory descriptors. Resolve each component descriptor-relative with no-follow semantics; verify owner, type and mode. New files use exclusive creation, size-limited streaming and raw SHA-256 verification. Stage on the same filesystem as publication. Reserve enough space for the staged target, retained prior release, journal and reserve; handle actual ENOSPC/short writes/fsync errors fail-closed. Do not report success merely because a preflight free-space check passed.

## Durable selection and journal

Closed schemas define `accepted`, `journal`, `authorization`, `adminRequest`, `adminResponse`, `backup`, and `recoveryApproval`. All unknown fields fail. JSON parsing also rejects duplicate object keys, unsafe integers, invalid Unicode, depth/size overflow. Schema validation is followed by semantic/cross-file validation.

- `accepted.sequence` is a Cell-global accepted revision. A transaction records `priorRevision` and `targetRevision=priorRevision+1`. Journal `sequence` is local to a transaction and starts at 1. These are intentionally different counters.
- Accepted selection binds the Cell/transaction, canonical bundle/profile/lock/policy and local authorization digests, and current trust floor. It contains no reusable grant/instance/scope-generation handles.
- Each journal envelope stores a SHA-256 checksum of the canonical record, previous-record checksum, immutable transaction identity and monotonically nondecreasing trust floor. Checksums detect corruption, not a malicious same-UID administrator.
- Each transaction has an exclusive directory and immutable numeric record files. Write a private temporary record, fsync it, atomically publish no-replace, then fsync the journal directory before the next effect. At most 4096 records of 16 KiB each. No silent truncation, skipping, compaction or overwrite; exhaustion requires reviewed retention/recovery.
- Persist each new trust floor before operations can depend on it. Keep Kernel-owned trust state intact and separate; do not rewrite its undocumented internal representation. G7 records its own monotonic floor from verified metadata and observed clock, and preserves the opaque Kernel state during stopped backup.
- After target files are verified and durable, publish the immutable content-addressed release directory and append VERIFIED. Quiesce/reap prior runtime, append ACTIVATING, start fresh target instances and run readiness plus actual synthetic calls. Only then fsync a new accepted record, atomically replace `accepted.json`, fsync its parent directory, and append COMMITTED.
- If accepted-record replacement or its directory fsync has uncertain outcome, return NEEDS_OPERATOR and stop admission. Reconciliation must inspect durable records after restart; the command must not pretend it knows which selection survived.
- Exact reinstall is checked before creating a transaction: all accepted bytes and current trust must still verify. No identity/secret/selection/floor reset. Trust verification can observe time, but a read-only/no-op path must not rewrite the persisted high-water file merely to claim a no-op.

Legal journal edges are STAGING -> VERIFIED -> ACTIVATING -> COMMITTED; any nonterminal forward state may enter RECOVERING; RECOVERING -> ABORTED or NEEDS_OPERATOR. Terminal records never reopen. Uncertain cleanup cannot become ABORTED/OK. Root rotation is a separate authenticated procedure, not a journal field substitution.

## Crash/recovery interpretation

| Durable observation after process restart                                                                 | Required disposition                                                           |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Valid early journal; accepted pointer still prior; actual reap established                                | ABORTED, STOPPED; prior selection remains; reactivation requires current trust |
| ACTIVATING or COMMITTED; accepted pointer matches target Cell/transaction/revision                        | COMMITTED, STOPPED; configuration survived, not proof of a running provider    |
| Target pointer before ACTIVATING; COMMITTED with prior pointer; unrelated selection; broken hash/sequence | NEEDS_OPERATOR; do not guess or replay                                         |
| Missing/currently invalid trust, backward clock or uncertain reap                                         | NEEDS_OPERATOR; no revival of revoked release                                  |

The reference model exercises these decisions but does not simulate fsync, process death or operating-system behavior. Qualification must kill real processes at every write/fsync/rename boundary and inspect state from a fresh process on the real filesystem. Restarts create new scopes, instances and grants; interrupted mutations are never replayed as idempotent calls.

## Supervisor and authorization

Use an owner-only local AF_UNIX socket, mode 0600, below the 0700 Cell directory. Validate peer UID through kernel credentials, not client JSON. The supervisor publishes an owner-only random incarnation record and start identity; requests bind that incarnation and the expected accepted revision. No provider work channel is reused. Same-UID compromise is explicitly outside confinement guarantees.

Frames are four-byte unsigned big-endian byte length plus UTF-8 closed-schema JSON, <=65536 bytes, depth <=32, no zero/oversized/trailing frames or duplicate keys. One request/response per connection; cap at 8 connections and 30000 ms from admission; mutation writer lock conflicts immediately. Errors return enumerated codes without private paths, tokens or secret values. A timeout is not proof of cancellation/rollback: inspect the durable operation outcome before retrying.

### Owner-approved A1+B1 admin amendment

The exact [admin owner approval](R1-ADMIN-OWNER-APPROVAL.md) supersedes historical proposal-only wording ONLY for A1+B1 of the preserved [decision brief](R1-ADMIN-OWNER-DECISION-BRIEF.md). Other proposals are not authorized. No numeric limit changes.

A request is sealed only by write EOF after exactly one complete length-prefixed body. The client MUST half-close its sending direction and retain its receiving direction. The server MUST NOT dispatch before EOF; incomplete, additional or trailing bytes invalidate the request without dispatch. The existing connection deadline runs from admission, is not reset by bytes or EOF, and closes an unsealed connection without executing the request. The server sends at most one response frame, then closes. Connection loss after dispatch is not cancellation or rollback. Invalid/unsealed transport closes without a response; no requestId or selection may be invented.

`supervision/admin.sock` retains the unchanged closed `adminRequest`/`adminResponse` v1 definitions. `supervision/admin-v2.sock` accepts only `adminRequestV2`, an exact clone of v1 except `schemaVersion=alica.cell-admin-request/v2`, and sends only `adminResponseV2` (`alica.cell-admin-response/v2`). Both sockets use the same custodian, actual kernel peer UID check, 0600 socket modes under 0700 directories, incarnation, custody, single mutation slot and aggregate eight admitted connections. There is no version autodetection, fallback, or replay; wrong-version requests close without dispatch. A client explicitly chooses its version/endpoint and validates that version and response binding. `tools/g7-admin.mjs` implements this one-attempt client.

V2 retains every required response field and disallows extras. Its sequence is the existing bounded integer or null, constrained to three variants: zero/null means KNOWN absence; positive sequence/digest means KNOWN selected revision; null/null means neither sequence nor digest certified and MUST have status NEEDS_OPERATOR and code CLEANUP_UNCERTAIN. Thus mismatched known pairs are forbidden in v2 without widening or tightening v1. CLEANUP_UNCERTAIN in the unknown variant means “safe lifecycle/selection disposition is uncertified,” not that a particular disposer was observed to fail. Unknown is never OK, STOPPED or RUNNING. V1 unknown selection still closes without response. No selection knowledge is inferred from expectedSequence, readable residue, a late exit or a replay. Uncertainty retains the lock/fence, denies successor admission and grants no restart, retry, custody-release or reconciliation authority.

The live channel only exposes status/verify/stop/start. Install/upgrade/recover/backup/restore operate under the same exclusive lock while the supervisor is stopped; the CLI must authenticate any stop and confirm actual reap before mutation. A single lifetime-writer lock prevents direct CLI mutation while the supervisor owns the Cell. Read-only planning opens existing state without creating identity, locks, sockets or grants. Stale sockets are removed only after verified old process/incarnation absence under the exclusive lock; PID absence alone is insufficient against reuse.

Capability authorization intent is an operator-owned local file, not candidate-provided grant data. Its canonical digest is bound in the local accepted selection, not the portable lock. Bind it to the exact profile, reject duplicate principal/scope/capability tuples, require selected principals/scopes and descriptor-declared operations. At each grant issuance intersect it with manifests, trust and parent authority; generate fresh instance/generation-bound grants with lifetime <=30 s. Any renewal rechecks the same authority and current trust; it never extends trust metadata. Empty secret/event intents are enforced for this profile.

## Backup and restore

Backup requires a stopped/reaped, consistent accepted Cell and no unfinished transaction. Encrypt standard uncompressed tar with age v1 to the separately approved X25519 recovery recipient. The runtime gets only the public recipient. Recovery private material is unlocked only through an explicit owner recovery operation, not stored in the Cell or distributable bundle.

The encrypted plaintext includes a closed backup manifest, the accepted release inventory, identity, operator authorization, local secrets, opaque Kernel trust state, G7 floor and sealed latest journal. Exclude sockets, process IDs/incarnations, temporary files, live grants, signing keys and unrelated custody directories. Manifest lengths/raw digests cover every payload file; reject duplicate paths, unexpected paths and totals above limits. Bind backup Cell identity, accepted selection and current floor consistently. No restored code executes during decoding.

A separately delivered owner recovery approval binds ciphertext digest, Cell identity, authorization digest, source-stopped assertion and minimum trust floor. Independently verify that the source really is stopped. Require currently valid root-signed metadata and take nondecreasing floors across approval, backup and any existing destination. A backup cannot supply its own current approval. Offline recovery cannot prove absence of a newer undisclosed policy; its honest boundary is the latest independently approved checkpoint. If that cannot be established, fail same-Cell recovery rather than silently reset trust.

Decrypt only to protected staging with bounded input/output; authenticate the entire stream before publication. Wrong key, truncation, extra content or any digest/schema mismatch leaves the destination unaccepted. Restore into a clean, separate destination; retain the source backup and source filesystem unchanged. Generate fresh runtime identities/handles, then verify actual calls and teardown before declaring recovery passed.

## Review and evidence limitations

Actual initial root policy/revocation signatures have been checked by both Python Ed25519 verification and the public production Kernel bootstrap API. `evidence/g7/initial-trust.public.json` contains only public material. The one-shot verifier uses isolated temporary state, not a candidate installation or acceptance-host root ceremony. Bootstrap commit a894246 has successful exact-revision GitHub foundation run 35265226631.

Contract tests cover closed shapes, required/unknown fields, all modeled journal edges, corruption, monotonicity, selected crash dispositions and authority restrictions. They do not yet validate all tar/parser/backup semantics or prove durable IO/reap/encryption. The actual G7 acceptance matrix remains unexecuted. No version of this draft can be used as evidence that G7 is complete.
