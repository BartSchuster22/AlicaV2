# G6 correction — target execution checkpoint

Status: **CORRECTION VERIFIED; FULL G6 NOT YET QUALIFIED**.

Owner-approved private minor2 scope/cleanup correction executed on the dedicated
pinned target, branch `g6/host-integration-candidate`, based on `05c35d9`.
Transfer baseline/result and protected-path hashes were checked before formatting.
Frozen G1, publicSDK, historical review inputs, the parent's Host corrections and
all six original regression assertions remain unchanged.

## Actual execution

- Build/typecheck and generated-wire synchronization passed.
- Pinned schema/design checks and native build passed.
- Focused suite: **51 tests,51 passed,0 failed,0 skipped**.
- Full `npm run check`: **exit0**. IPC/native/component suite:
  **94 tests,94 passed,0 failed,0 skipped**.
- Boundary tests: **5 passed**, including exact importer/target enforcement and
  rejection of adjacent-test/plugin inheritance and extra external dependencies.

Receipts in `evidence/g6-runtime/`:
- `correction-focused-tests.log`: preserved original45/49 failure evidence.
- `correction-fix-build-typecheck.log`: build/typecheck.
- `correction-fix-focused-tests.log`: focused51/51.
- `correction-fix-full-check.log`: initial broader check stopped at test imports.
- `correction-fix-full-verified.log`: complete successful pipeline.

## Findings, not hidden assertion changes

The scheduler had a real premature-expiry bug from fractional timeout rounding.
It now rounds upward and rechecks/rearms against the original absolute end.
Wire tests now compare canonical values and separately verify safe null prototypes;
the hardened decoder was not changed.

Cancelling an unanswered mutating effect-release preserves the existing conservative
shared-session failure policy. Its test now explicitly proves failed cleanup and
FD closure rather than promising unsafe per-call isolation. A separate positive
real-worker test proves ordinary cancellation preserves unrelated live work.
All original six scope/callback regressions pass byte-for-byte unchanged.

The new qualification tests needed three explicit importer/target permissions:
`scope-correction.test.mjs` -> private Host adapter and native module;
`scope-wire.test.mjs` -> private wire codec. No folder-wide exemption was added.
Negative boundary assertions were extended to cover these exact permissions.

## Remaining full G6 gate

The original runtime matrix in QUALIFICATION.md still requires complete evidence
at its stated level, including native expired-queued-cleanup, hostile session
and recovery cases, resource measurements and clean-source requalification.
A component/model pass is not a substitute for end-to-end/runtime evidence.
This checkpoint is not permission to merge/deploy or declare G6 complete.
