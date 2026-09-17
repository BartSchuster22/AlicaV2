# R1 Cell preparation candidate — historical worker handoff

> Superseded execution status: see [parent execution review](R1-CELL-PREPARATION-PARENT-REVIEW.md). The text below preserves the original worker handoff and its limitations.

Baseline: `728d335a08a2e7402852a54edb1e355a22348528`. Existing R1 authorization applies; no contract reapproval is requested. No commit/push was made. Frozen R1 schemas, limits, governing specs, public Kernel APIs and existing admission tests were not changed.

## Exact status

This is an **unqualified source candidate**, not a functioning/tested Cell release or completed lifecycle milestone. The implementation was bounded to preparation before activation. The required development-host transfer returned `pending_approval`, `pattern_key=tirith:raw_ip_url`. The exact attempted command and tool disposition are retained in `evidence/g7/cell-lifecycle/transfer-blocker.json`. It was not retried through a different route. No transfer/build/test success is inferred from the prior read-only SSH connection.

The read-only SSH check established that `/home/alica-dev/AlicaV2` had the requested HEAD and Node v24.21.0. Unrelated untracked G6 evidence was observed and left alone. Locally, Node is v22.22.2, no repository node_modules or .tools directory was present, and the pinned compiler archive is unavailable. `npm run test:g7-cell` failed before tests at the missing compiler archive. `npm run check` failed at the pinned toolchain check. Both original failed outputs are preserved. Local JS/Python syntax and formatting checks are not runtime tests.

## Proposed implementation boundary (not execution claims)

- `native/g7/ownership.c`: small host-only N-API Linux flock bridge. Locks the already no-follow-opened 0700 owner directory itself with `LOCK_EX|LOCK_NB`, before shared mutation. No stale PID file or lock-file creation race. Each Cell object owns a separate open-file description. Close/process death releases ownership. Library mutations additionally exclude concurrent calls on the same object.
- `tools/build-g7-native.py`: no downloads, services or new libraries. Reuses G6's pinned Zig 0.15.2 archive and Node headers, verifies archive digest/length and compiler version, and records source/header/compiler/output hashes and command in `native/g7/build/receipt.json`. Linux x86_64 development profile only. The addon is not a plugin import/export.
- `tools/g7-cell.mjs`: private-root initialization, status, staged install preparation and pre-activation recovery. Uses existing durable primitives and the exact approved JSON Schema definitions via existing pinned Ajv (already a contracts/Kernel dependency). No substitute accepted/journal/authorization contract. Bounded parser rejects malformed JSON before validation.
- Initialization requires an empty, existing owner-only root and separately supplied current signed trust/floor. Identity is random and written once. Dirty/incomplete initialization cannot mint a replacement. G7 floor is durable before dependent operations; Kernel's high-water file is preserved as opaque state, never rewritten by Cell code or reinitialized on restart.
- Staging independently inspects the complete signed archive, checks explicit local intent and binding, writes exclusive private files below the bundle digest, then independently calls public `Host.discoverReleasePackage`. It issues fresh bounded intent-derived grants **before** public planning and requires an exact lock match. No candidate-provided grants, callback verification bypass, clock override or hidden force flag.
- Real numeric immutable journal files use frozen envelopes/checksums, sequence/hash links, legal transitions, immutable transaction identity, monotonic floor and bounded record sizes. STAGING and VERIFIED are durable on the proposed path. Failure poisons the open writer rather than continuing after ambiguous IO.
- Recovery only transitions never-activated preparation journals to RECOVERING/ABORTED. Current trust and Kernel digest/version continuity are checked first. Unknown/corrupt journals, post-activation states, accepted selections, dirty Kernel writes and unsafe root files deny instead of guessing. Status reports `accepted:null`, `runtime:UNAVAILABLE`, never RUNNING or a claimed reap.

The CLI accepts only:

```
node --experimental-vm-modules tools/g7-cell-cli.mjs initialize ROOT TRUST_JSON FLOOR_JSON
node --experimental-vm-modules tools/g7-cell-cli.mjs status ROOT
node --experimental-vm-modules tools/g7-cell-cli.mjs stage ROOT ARCHIVE TRUST_JSON AUTHORIZATION_JSON
node --experimental-vm-modules tools/g7-cell-cli.mjs recover ROOT TRUST_JSON
```

Trust/floor/authorization files supplied through the CLI must be owned regular 0600 single-link files below a 0700 owner directory, with no followed path components. The library caller is a trusted local operator, not a plugin or RPC peer. There is **no admin socket or network endpoint**. `stage` returning VERIFIED is specifically not install success. These commands remain unexecuted candidates pending the build/test gate.

## Precise gaps and fail-closed restrictions

1. No install/upgrade completion, accepted-record publication, activation or running supervisor. CLI install/upgrade/verify/start/stop/backup/restore are explicitly unavailable. An existing `accepted.json` causes rejection without rewriting it. Thus this candidate cannot upgrade an existing accepted Cell and does not establish accepted revision/transaction reconciliation.
2. No Cell IPC activation, unchanged-consumer execution, readiness, G6 reap/pidfd integration or recovery of interrupted active processes was performed. Existing admission/G6 suites remain unchanged, but their prior results are not claimed as new Cell evidence. No reusable handles/grants/actions are persisted or replayed.
3. Release files are exclusive, durable, content-addressed preparation files, not atomically published accepted release directories. Interrupted staging residue is retained; repeating the same content-addressed candidate fails rather than deleting/overwriting it. Atomic directory publication, retention and reviewed reclamation are remaining work. Extra internal path prefixes may reject archives near the frozen path limit; no limit was widened.
4. Only initial accepted revision zero and root-scope mandatory capability intents are supported. Child-scope/optional-only intents fail closed rather than widening authority. Full selected descriptor-operation intersection remains to be exercised and reviewed.
5. No same-UID authenticated admin protocol/incarnation/replay implementation. No persistent runtime start/stop ownership. Preparation recovery is not proof of old-runtime reap and must not be extended to ACTIVATING by treating flock release as worker-death evidence.
6. No reinstall no-op semantics for an accepted release; no source-stopped backup/restore, age invocation, owner-signed release, complete runtime/SBOM/provenance, portable assembly or two-host qualification. Age availability was not reopened as a blocker.
7. No executed ENOSPC/short-write/fsync-failure injection, expired-authority integration test, permission/alias test, external crash test or complete regression for this candidate. Tests are written but **not passed**. No before/after accepted-publication crash test exists because publication is unavailable.
8. The test-only syscall observer pauses after real syscalls for an external SIGKILL. It is outside production code and has no activation callback or production crash flag. Even when executed, these tests would not be power-loss or complete Cell qualification.

## Proposed tests and exact remaining execution

`tests/g7/cell-preparation.test.mjs` proposes separate-process staging/status/recovery, flock contention and release after SIGKILL, kills at STAGING/VERIFIED durable journal boundaries, partial hardlink publication and floor rename, source corruption, unsafe root/identity/floor paths, wrong root/floors/intents, journal corruption/unknown shapes/illegal edges and explicit unavailable-operation behavior. `cell-fixture.mjs` creates disposable signatures with real compiled package bytes; fixture runtime/SBOM/provenance files expressly do not represent a shipped release.

After the parent resolves the tool transfer gate, the explicit final file list is in `evidence/g7/cell-lifecycle/source-hashes.json`. Note that `package.json` and later local source corrections were not in the original blocked command. In the development repository, the executable test sequence is:

```
cd /home/alica-dev/AlicaV2
export PATH="$PWD/.tools/node/bin:$PATH"
npm run test:g7-cell
npm run test:g7-implementation
npm run check
```

These are rerun instructions, not a claim they ran. Preserve the original failures, record the native build receipt, and rerun corrected code without relaxing assertions. Parent review must resolve any newly revealed failure before treating even this preparation subset as functioning. `source-hashes.json` binds source bytes only, not build or runtime success.
