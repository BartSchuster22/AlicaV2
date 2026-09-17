# R1 implementation checkpoint — incomplete, NOT G7 acceptance

Baseline: `6c9530adace11fb235a52d838ac10bc1dbf22ae2`. R1 is owner-approved; no renewed R1 approval is requested. Existing local R1-OWNER-APPROVAL, CONTRACT-REVIEW-R1 and ACCEPTANCE-MATRIX edits are retained.

## Executable components delivered

- `tools/g7-archive.mjs`: bounded, regular-file-only USTAR reader and deterministic explicit-input writer. Checks actual consumed payload, checksums, exact two-block EOF, portable octal, padding, type/link fields, ASCII paths, canonical prefix splitting, duplicates, case/parent aliases, entry/file/total limits. Opens source no-follow, hashes in bounded chunks, and rechecks descriptor identity metadata and read bytes. No extraction, candidate execution, signing, or archive hooks.
- `tools/g7-release.mjs`: detached Ed25519 verification with unchanged signature domains; externally supplied current root policy/revocation/floor checks; IPC-only `org.aquiero.alica` authority; closed normative schemas and strict public parser; inventory/package/profile/lock cross-bindings; deterministic mandatory dependency resolution and cycle/contract-conflict rejection. Assembler consumes explicit byte maps and already supplied signature envelopes; it cannot sign. Inspection never bootstraps a Kernel, advances a floor, or creates Cell state.
- `tools/g7-inspect.mjs`: real read-only command with bounded no-follow operator JSON reads and redacted failure codes. `npm run g7:inspect -- ARCHIVE OPERATOR_TRUST_JSON OPERATOR_FLOOR_JSON`. These operator files must come from an independent current authority, not from the archive. Invalid arguments return failure. This is not an install/start/status command.
- `tools/g7-durable.mjs`: real Linux descriptor-relative private-root traversal, owner/mode/type checks, exclusive temporary writes, actual short-write loops, file and directory fsync, no-replace link publication, and atomic replacement. Enforces the R1 free-space reserve. These are primitives, not a completed journal or Cell mutation engine. Caller must already hold the lifetime writer lock; this module does not implement it.
- `tests/g7/r1-implementation.test.mjs` and `durable-worker.mjs`: adversarial executable tests, including real SIGKILL of writers at open/write/file-fsync/rename/directory-fsync boundaries and separate-process readback. Uses disposable temporary directories and ephemeral in-memory test keys. No production custody access.

`npm run test:g7-implementation` runs the new tests with an explicit test timeout. The existing `npm run check` reaches them through `test:g7-bootstrap`'s G7 test glob. Build/typecheck continue to cover the existing TypeScript packages; these new JavaScript tools are formatted, boundary-checked and executed in tests, not falsely described as TypeScript-typechecked.

## Reproduced hard public-admission boundary

The test named `public Kernel admission boundary: release-wide signature is not a per-package signature` builds and signs a real disposable R1 release inventory, successfully inspects it, then calls the existing **public** `bootstrap` / `Host.discover` interfaces. `discover` returns `CONTRACT_MISMATCH`.

At this baseline, `packages/kernel/src/trust.ts:375-379` requires `bundle.artifacts.length === index.files.length + 1`. The same method expects flat package-relative artifact paths, a `package-index.json` artifact, and exactly the package files in `SignedPackage.files`. R1 instead binds the full standalone release, with `plugins/<id>/index.json`, all packages, runtime, profile, lock, trust snapshots, SBOM, provenance and documentation in the signed bundle inventory. Passing the release-wide bundle unchanged fails; stripping/rebuilding its manifest invalidates its Ed25519 signature. Supplying new per-package signatures without an actual signer would be fabrication. Passing an externally "verified" package around Kernel verification would weaken the boundary.

The current public `SignedPackage` admission representation therefore does not compose with the approved standalone layout. No frozen schema, import allowlist, Kernel check, per-package resource ceiling, confinement setting, or signature domain has been weakened. A secure admission integration must preserve full release authentication plus package-local bounds and identity, rather than treating this component inspector as Kernel authority. This checkpoint leaves that integration unresolved; it is not a request to approve R1 again.

## Precisely not delivered

- No full build-layout AST rewrite or self-contained runtime/native/dependency delivery. The explicit-byte archive assembler is not a complete application builder.
- No dependency-complete SBOM/provenance generation or validation. Inspection checks their inventory binding and strict JSON presence only, and always returns `qualification: NOT_QUALIFIED`. Parser fixtures explicitly label themselves fixtures, not build evidence.
- No staged Cell install/upgrade/recover, immutable release publication, closed durable journal/reconciliation, complete transaction crash matrix, writer lock, grant-intent enforcement, supervised runtime, peer-credential admin socket, or actual G7 synthetic readiness/reap proof.
- No age adapter, stopped-source backup, external recovery approval enforcement, clean-root restore, or encrypted round-trip result from this implementation. During the run, the parent supplied `G7-PARENT-NOTES.md` and `evidence/g7/age-parent-dependency-probes.json`, with verified dependency binaries at `/home/herman/g7-age-review/bin/`. Local `sha256sum` independently matched both supplied binary digests; raw output is in `age-supplied-digests.log`. The attempted explicit transfer/extraction into the development-only `.tools/g7-age-r1` path was stopped by the tool's `pending_approval` archive-extraction security gate, so no transfer or Ubuntu24 adapter run is claimed. That tool-level gate is not a renewed request for R1 owner approval. Parent evidence records successful dependency-only round trips and a SIGSUM proof check with upstream-HTTPS key sourcing, **not independently owner-provisioned proof-key authentication**. It also records partial plaintext on failed/truncated/appended streams. No parent evidence is relabeled as Cell backup/restore evidence.
- No production candidate or signing request is ready. No automatic G7 acceptance or protected-host qualification occurred.

The SIGKILL tests establish only process-crash behavior of a metadata replacement primitive on the development filesystem; they do not establish power-loss durability, transaction recovery, application process reap, or two-host qualification. Residue after an interrupted no-replace link can have multiple links and is intentionally rejected by the private-file reader; no reconciliation is silently fabricated.

## Parent follow-up verification

The parent independently reran `npm run test:g7-implementation` and `git diff --check` on the development host: exit 0; all 41 component tests passed. See `parent-independent-targeted.log`. The parent subsequently completed the explicitly scoped age transfer to `.tools/g7-age-r1`, verified both executable digests against the dependency receipt, and executed `age --version` on Ubuntu24: `v1.3.2`. The prior worker transfer gate is resolved; this does not establish a Cell age adapter or restore.

## Source documents

Requested `PHASE-PLAN.md`, `specs/12-standalone-cell.md`, `specs/13-packaging-distribution.md`, `specs/14-backup-recovery.md`, and `docs/adr/009-g7-administrative-contract-review.md` are not present at this baseline. The repository's linked equivalents are `docs/planning/ALICA_V2_Assessment_and_Step1_Building_Plan.md`, `specs/ALICA-BUNDLE-v1.md`, `specs/ALICA-PROFILE-v1.md`, `specs/ALICA-TRUST-POLICY-v1.md`, `specs/ALICA-NORMATIVE-BASELINE-v1.md`, `docs/adr/ADR-009.md`, and the approved `docs/g7/CONTRACT-REVIEW-R1.md` / `draft` schema and limits. Historical unapproved headings do not override the recorded R1 authorization.

## Unsigned candidate and eventual owner signing requirements

There is currently **no signable complete standalone candidate**. Before requesting owner signing: complete secure public admission integration and all missing runtime/transaction/backup components; record actual deterministic module transformations and shipped native/runtime bytes; generate real complete dependency/license inventory and build provenance; validate exact profile/index/lock/policy bindings; qualify actual calls, cleanup and recovery on the approved hosts; deliver independently authenticated verifier/root material and an actually verified age executable/dependency inventory.

The eventual detached release signature must sign exactly ASCII `ALICA-BUNDLE-v1\n` followed immediately by the canonical final bundle manifest. Raw artifact digests/lengths cover exact final bytes; package/profile/lock/policy identities remain canonical digests. Production signing is exclusively a separate owner action using current independently approved trust metadata and the existing custody process. No clock/floor reset, new production key generation or private custody access is part of this checkpoint.

## Execution evidence

Real command logs are under `evidence/g7/r1-implementation/`. They describe development regression/component runs only. The final results and exact file hashes are recorded alongside the logs after execution. No clean baseline evidence is overwritten.
