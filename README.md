# ALICA V2

A new, lean capability-oriented substrate: **Kernel → ACAP → SDK**.

## Current stage

Step-1 implementation authorized. G0 technical reference closure is delivered with owner EXIT acceptance pending; existing G1 design remains proposed. No higher-level ALICA services are integrated. Existing V1 artifacts are references, not runtime dependencies.

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

These checks use the host's existing Python/jsonschema installation and are not production runtime tests. No application tooling or service stack has been installed.

## G1 normative baseline

The completed design-validation delivery is indexed by [G1 gate](docs/gates/G1.md) and [six review records](docs/gates/G1-REVIEW.md). Owner normative-baseline acceptance remains the exit gate; no production Kernel or service integration exists.

## Engineering foundation (G2)

See [development setup](docs/development/SETUP.md), [testing](docs/development/TESTING.md), [host controls](docs/operations/G2-HOST-SECURITY.md), and [G2 gate](docs/gates/G2.md). Toolchain and dependency locks support a clean build without V1 services. Formal gate status is tracked honestly, separately from local test success.
