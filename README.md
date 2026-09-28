# ALICA V2

## Phase5.0 Service Foundation — technically qualified release

The subsequent explicit owner authorization permits **Phase5.0 ONLY under
Revision1.1**. Earlier “No Phase5” statements below record the prior frozen Phase4
boundary; they do not cancel this later authorization. No Phase5.1 is authorized.

[Service standard and public author workflow](https://github.com/BartSchuster22/AlicaV2/tree/phase5.0-service-foundation-v1.0.0/service-foundation)
| [Actual evidence](https://github.com/BartSchuster22/AlicaV2/blob/phase5.0-service-foundation-v1.0.0/docs/phase5.0/EVIDENCE.md)
| [Reproduction](https://github.com/BartSchuster22/AlicaV2/blob/phase5.0-service-foundation-v1.0.0/docs/phase5.0/REPRODUCE.md)
| [Technical release declaration](https://github.com/BartSchuster22/AlicaV2/blob/phase5.0-service-foundation-v1.0.0/docs/phase5.0/PHASE5.0-COMPLETION.md).

Implementation candidate `9b4ec08dac0bf41a3f6dec2e3905e788d86eb426` passed actual
fresh anonymous-public-clone, pinned offline build and native isolated qualification:
41/41 tests plus separately installed public author/operator, unchanged consumer,
normal persistence, completed-write crash/restart and cleanup. Independent parent
technical review approved scoped publication. This commit declares the technical
release phase5.0-service-foundation-v1.0.0; tag transport/readback is verified after
push, not presumed by this declaration. No Owner Acceptance or Phase5.1. All earlier
source/tag evidence and closed live authorities remain unchanged. Historical phase
records below are preserved verbatim.

## Phase 4 Decision Service — technical release

**PHASE 4 — COMPLETE / FROZEN / OWNER ACCEPTED**

[Project Owner Acceptance](https://github.com/BartSchuster22/AlicaV2/blob/phase4-jev-v1.0.0-accepted/docs/phase4/OWNER-ACCEPTANCE.md) is recorded at documentation-only commit `396f4e1f17e0818d0905ddb888170dc784ad85bb`, tagged [`phase4-jev-v1.0.0-accepted`](https://github.com/BartSchuster22/AlicaV2/tree/phase4-jev-v1.0.0-accepted). The original technical release and evidence remain unchanged.

The independently reviewed Decision Service and TypeSafe Jev adapter are published at immutable annotated [phase4-jev-v1.0.0](https://github.com/BartSchuster22/AlicaV2/tree/phase4-jev-v1.0.0), release commit `003a9f7ce0a1e9845e7bf80d53ecb15c6aede30f`. Origin and anonymous HTTPS tag/object/source readback verified the release. This README-only pointer does not merge release code into main or change prior phase acceptance.

- [Release declaration and limitations](https://github.com/BartSchuster22/AlicaV2/blob/phase4-jev-v1.0.0/docs/phase4/PHASE4-COMPLETION.md)
- [J0–J26 qualification](https://github.com/BartSchuster22/AlicaV2/blob/phase4-jev-v1.0.0/docs/phase4/ACCEPTANCE.md) and [independent parent technical review](https://github.com/BartSchuster22/AlicaV2/blob/phase4-jev-v1.0.0/docs/phase4/FINAL-PARENT-REVIEW.md)
- [Reproduction guide](https://github.com/BartSchuster22/AlicaV2/blob/phase4-jev-v1.0.0/docs/phase4/REPRODUCE.md), [evidence](https://github.com/BartSchuster22/AlicaV2/blob/phase4-jev-v1.0.0/docs/phase4/EVIDENCE.md), and [exact committed-source proof](https://github.com/BartSchuster22/AlicaV2/blob/phase4-jev-v1.0.0/docs/phase4/evidence/COMMITTED-VERIFICATION.json)

Committed-source offline build/typecheck,54/54 tests and both packed public Host fixtures passed with0authenticated calls. The final release differs only in docs/evidence from the tested implementation. Real Noul/Choice/Score/mixed qualification is preserved; live authority is CLOSED6/6, with no replay/init/retry permitted. Original failures and diagnostics remain evidence. The subsequent Project Owner Acceptance records governance only; no Phase5 or additional integration is authorized. STOP at this boundary.

## Phase 3 Owner Acceptance

**PHASE 3 — COMPLETE / FROZEN / OWNER ACCEPTED**

[Owner Acceptance](https://github.com/BartSchuster22/AlicaV2/blob/phase3-hermes-v1.0.0-accepted/docs/phase3/OWNER-ACCEPTANCE.md) records the Project Owner's formal decision within the documented scope. The [original technical release](https://github.com/BartSchuster22/AlicaV2/tree/phase3-hermes-v1.0.0) is unchanged. The annotated [owner-accepted tag](https://github.com/BartSchuster22/AlicaV2/tree/phase3-hermes-v1.0.0-accepted) records governance only. Phase 1 and Phase 2 remain authoritative and frozen. That acceptance did not authorize further Phase-3 work or Phase4; the separately authorized Phase4 technical release is recorded above.


A new, lean capability-oriented substrate: **Kernel → ACAP → SDK**.

## Published product phases

This repository is public. [Phase1 Kernel/ACAP/SDK](https://github.com/BartSchuster22/AlicaV2/tree/phase1-v1.0.0) is frozen. [Phase2 Catalog completion and limitations](https://github.com/BartSchuster22/AlicaV2/blob/phase2-catalog-v1.0.0/docs/phase2/PHASE2-COMPLETION.md) and [executed evidence](https://github.com/BartSchuster22/AlicaV2/blob/phase2-catalog-v1.0.0/docs/phase2/EVIDENCE.md) are published at the annotated `phase2-catalog-v1.0.0` release tag. Phase3 Hermes ↔ ACAP delivery is published on [phase3/hermes](https://github.com/BartSchuster22/AlicaV2/tree/phase3/hermes): [reproduction guide](https://github.com/BartSchuster22/AlicaV2/blob/phase3/hermes/integrations/hermes/README.md), [H0–H20 acceptance evidence](https://github.com/BartSchuster22/AlicaV2/blob/phase3/hermes/docs/phase3/ACCEPTANCE.md), and [completion/release status](https://github.com/BartSchuster22/AlicaV2/blob/phase3/hermes/docs/phase3/PHASE3-COMPLETION.md). The original real task passed on historical source; tested implementation `dd6ae758` has clean committed MOCK reproduction, not a new live run. The completion report records the final release/tag state and limitations without asserting owner acceptance. JEV/services remained outside that Phase3 scope; the separately authorized Phase4 release is recorded above. These pointers do not merge release code into frozen main.

## Historical stage (retained baseline)

The following stage description is historical, including its private-repository and gate-status statements; the published product phase pointers above are current.

G3, G4 and [G5](docs/gates/G5-OWNER-ACCEPTANCE.md) are accepted by the owner. For the public SDK and external developer experience: see [G5 delivery and limitations](docs/gates/G5.md), the [empty-directory tutorial](docs/sdk/TUTORIAL.md), [SDK API](docs/sdk/API.md), and [mock differences](docs/sdk/TESTKIT.md). G2 progression uses the [owner-approved manual gate](docs/gates/G2-OWNER-DISPOSITION.md); GitHub remains private. The [G6 IPC baseline](docs/gates/G6-BASELINE-APPROVAL.md) is approved for design preparation; implementation remains gated on ADR and frame-schema review. G7–G8 and higher-level services are not started. Existing V1 artifacts are references, not runtime dependencies.

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
