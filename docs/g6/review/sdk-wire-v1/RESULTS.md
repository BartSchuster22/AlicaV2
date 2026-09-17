# Execution receipt — private-wire review candidate v1

Status: REVIEW ONLY, NOT APPROVED FOR IMPLEMENTATION; runtimeQualification=false.
Base revision: `3de792997e62f5c28f2f623e9d210993e589ac50`.
Executed on the dedicated ALICA V2 development target using pinned Node v24.21.0
and existing hash-locked `.tools/python` validation dependencies.

## Actual results

1. `python3 docs/g6/review/sdk-wire-v1/build_candidate.py --check`: exit 0;
   standalone candidate exactly matches its deterministic generator.
2. `python3 docs/g6/review/sdk-wire-v1/test_review.py`: exit 0;
   **23 tests passed, zero failures/errors**. These are unittest schema/model
   methods, some containing multiple explicit vectors. No runtime test count
   is inferred from those vectors.
3. The test verified SHA-256 equality for **63 protected input files**, including
   approved G6 frames/carrier/ADR/profile, frozen G1 schemas, SDK/kernel source,
   native source/toolchain record, active generator, package scripts and lock.
4. Full root `npm run check`: exit 0 on unchanged baseline implementation:
   - 169 baseline JavaScript tests passed;
   - 193 specification tests: OK;
   - 135 active G6 frame-schema checks passed;
   - 30 active G6 design-model tests: OK;
   - 48 native/wire/scheduler/reap-helper/boundary component tests passed;
   - build, format, typecheck, schema synchronization, import boundaries,
     secrets/dependencies, isolated conformance, SDK API and external SDK checks
     passed as part of the same pipeline.
5. Before staging, `git diff --name-only` was empty. The only new task artifacts
   were under docs/g6/review/. Existing untracked runtime logs and preservation
   archive were retained, not committed/deleted/recreated by this task.

## Exact receipt hashes

| File | SHA-256 |
|---|---|
| frames.schema.json | `6beec43c5ddade5fc4165e5e57dc61a9d184388cce6de400404df94dbb7fb857` |
| review-tests.log | `05c4e2995168129b88094b7a9ac0de2776b5b66508c0529974f35cb6babae6a7` |
| baseline-check.log | `77dd6cd1911de1e3f810753aba8c30edaba890fc045f87cf700eabf0c6a6f285` |

The logs are in this directory. The candidate was not put in the root pipeline;
its test command was executed separately and is opt-in for review.
No fresh-host/clean-checkout repeat or independent GitHub CI is claimed for this
document-only task. Prior component checkpoint clean-checkout evidence remains
separate and does not validate new candidate runtime semantics.

## One corrected command error, no tool-approval bypass

After a successful scoped SCP, a separate SSH `true` check accidentally named
`UserKnownHostsFile=/home/alica-dev/.ssh/../.ssh/alica_v2_known_hosts` on the local
host. It exited 255: `No ED25519 host key is known for 167.233.135.142 and you
have requested strict checking. Host key verification failed.` The command was
corrected to the established `/home/herman/.ssh/alica_v2_known_hosts`; strict
host-key checking stayed enabled. No host key was replaced/accepted afresh, no
approval configuration changed, no denied operation bypassed and no retry loop
or preservation command was used. Subsequent target checks succeeded as above.
Local editor diagnostics reported unavailable validator type information and
inferred dynamic-dict type warnings; pinned-target execution above is the actual
verification, not an editor diagnostic claim.

## Explicit non-results

No active wire-schema/runtime/SDK/Host/native change, no transport activation,
no synthetic IPC SDK provider, no unchanged-consumer transport equivalence,
no native authentication or process-cleanup qualification for the new messages.
The model uses trusted endpoint values, simulated state/time and model reap;
its passing assertions are design checks, not OS evidence. Full G6 remains
incomplete and requires approval of this exact review candidate before coding.
