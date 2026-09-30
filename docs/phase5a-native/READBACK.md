# Native bootstrap publication and bounded DEV integration verification

## Published identity

- Accepted tag: `phase5a-native-bootstrap-v1.0.0-accepted`
- Annotated object: `c7c70862ba63e9ce04fbed9f13f424183eac8ff7`
- Commit: `3f161818bb919affdc9e90caa9195aeb0d98fcd2`
- Tree: `18f0d4ba1ff772be1f386df6d1ea7d4c610902ee`
- Candidate branch: `phase5a/native-activation-candidate`

Anonymous credential-disabled Git retrieval verified the tag object, exact commit/full Git tree and all ten candidate-changed files against the qualified hashes. The candidate tag and earlier release refs remain unchanged. `APPLICATION-PIN.json` selects this exact revision for DEV application composition; this is not a running service or production installation. Main remains release discovery/pin/evidence, not a merge of release code into the frozen main implementation.

## Actual public-source execution

Downloaded source was built/typechecked with import boundaries passing. Its 1,438 approved artifact entries matched the qualified material (candidate-root paths rebased to the public checkout for comparison). The published controls, signing helper, binding and probe were used, not local replacement tests.

- 23 real HTTPS/SDK/Host/Memory read, security and reconstruction checks PASS.
- 15 native admission, lifecycle and inventory controls PASS.
- 170 foundation/kernel/contracts/SDK regression tests PASS, zero skipped.
- Old handles/sessions rejected after reconstruction; new authorized session read the original record.
- Zero remaining dedicated UID996 processes; all application cleanup counters zero.
- Original database hash unchanged; private-copy tables unchanged except retrieval_events 2→14. No domain mutations, not zero database writes.

This was a **bounded public-source replay on DEV**, not a fresh dependency installation or a second-machine qualification. Existing hash-verified node_modules and the qualified Python venv were reused. A private mount namespace bound the anonymous public checkout read-only at the probe's expected candidate path; mountinfo proves the actual source was the public checkout. Original candidate source was not overwritten. Private network/loopback, non-root identity and no-new-privileges were retained.

## CI finding — not waived

[GitHub foundation run](https://github.com/BartSchuster22/AlicaV2/actions/runs/36701508250) failed in **Build and validate**. Public job metadata/annotations establish failure; anonymous full-log access returned HTTP403, so the cloud's precise failing subcommand is not claimed from those logs.

Local reproduction using the pinned Node/npm succeeds at the toolchain check, then `npm run format:check` fails:

- Candidate additions: `packages/kernel/src/index.ts`, `packages/kernel/src/native-activation.ts`.
- Already failing in the frozen baseline: `tools/test-external-hermes-cleanup.mjs`, `tools/test-external-hermes.mjs`, `tools/test-external-operator.mjs`.

These are formatting findings; they do not negate the separately executed functional results, but **repository-wide CI clearance is not established**. No workflow was disabled, check waived, frozen file reformatted or accepted tag moved. A separate corrective revision and its verification are required before claiming a fully green integration. See CI-DIAGNOSTIC.json and PUBLIC-REPLAY.json for actual receipts.

## Stop boundary

Browser authentication implementation and production deployment remain HOLD. No new browser/login implementation, public listener, production rollout, domain-mutation path or live inference authority is authorized. Publication/integration pinning is complete; the failed CI gate remains an explicit exception requiring correction, not a success claim.
