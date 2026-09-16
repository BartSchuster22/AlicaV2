# ALICA V2

A new, lean capability-oriented substrate: **Kernel → ACAP → SDK**.

## Current stage

Step-1 implementation authorized. G0 reference baseline is committed; G1 normative design is delivered and awaits owner acceptance. No higher-level ALICA services are integrated. Existing V1 artifacts are references, not runtime dependencies.

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
