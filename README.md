# ALICA V2

A new, lean capability-oriented substrate: **Kernel → ACAP → SDK**.

## Current stage

G3 is [accepted by the owner](docs/gates/G3-OWNER-ACCEPTANCE.md). G4 ACAP contract runtime and compiler tooling is delivered as a technical acceptance candidate: see [G4 delivery, commands, tests and limitations](docs/gates/G4.md). G2 progression uses the [owner-approved manual gate](docs/gates/G2-OWNER-DISPOSITION.md); GitHub remains private. No higher-level ALICA services are integrated. Existing V1 artifacts are references, not runtime dependencies.

- [Initiation assessment and building plan](docs/planning/ALICA_V2_Assessment_and_Step1_Building_Plan.md)
- [Gate status](docs/gates/STATUS.md)
- [Owner authorization and boundaries](docs/decisions/IMPLEMENTATION-AUTHORIZATION.md)
- [Pinned V1 reference inventory](docs/references/v1-baseline.lock.json)

Each phase is committed and pushed separately. Gate completion requires executed evidence; proposed architecture is not a working runtime.

## Normative review

- [Specification index](specs/README.md)
- [G1 delivery and approval request](docs/gates/G1.md)
- [Threat model](docs/architecture/THREAT-MODEL.md)
- [Author design reviews](docs/gates/G1-REVIEW.md)
- [Executed design checks](evidence/g1/execution.json)

Run design validation on the development VPS:

```bash
python3 tests/design/test_specifications.py
```

These are historical design checks, not Kernel runtime tests. Use `npm run check` with the locked development setup for the complete design, engineering and runtime suites.

## G1 normative baseline

The completed design-validation delivery is indexed by [G1 gate](docs/gates/G1.md) and [six review records](docs/gates/G1-REVIEW.md). The original G1 delivery/acceptance history remains in its gate record. G3 now implements the qualified minimal in-process subset; it does not claim every later-phase feature or production service integration.

## Engineering foundation (G2)

See [development setup](docs/development/SETUP.md), [testing](docs/development/TESTING.md), [host controls](docs/operations/G2-HOST-SECURITY.md), and [G2 gate](docs/gates/G2.md). Toolchain and dependency locks support a clean build without V1 services. Formal gate status is tracked honestly, separately from local test success.
