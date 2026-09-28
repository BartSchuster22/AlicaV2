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

A new, lean capability-oriented substrate: **Kernel → ACAP → SDK**.

## Phase 3 status

**PHASE 3 — COMPLETE / FROZEN / OWNER ACCEPTED**

[Owner Acceptance](https://github.com/BartSchuster22/AlicaV2/blob/phase3-hermes-v1.0.0-accepted/docs/phase3/OWNER-ACCEPTANCE.md) records the Project Owner's decision within the documented scope. The [technical release](https://github.com/BartSchuster22/AlicaV2/tree/phase3-hermes-v1.0.0) remains immutable; `phase3-hermes-v1.0.0-accepted` records governance only. Phase 1 and Phase 2 remain frozen. That acceptance did not authorize subsequent implementation; the later Phase4 authorization and candidate status are recorded below. No Phase5 is authorized.

## Phase 4 Decision Service

**PHASE 4 — COMPLETE / FROZEN / OWNER ACCEPTED**

[Project Owner Acceptance](https://github.com/BartSchuster22/AlicaV2/blob/phase4-jev-v1.0.0-accepted/docs/phase4/OWNER-ACCEPTANCE.md) records the subsequent formal governance decision. The technical tag `phase4-jev-v1.0.0` and all its evidence remain frozen; `phase4-jev-v1.0.0-accepted` records acceptance only. Historical technical-review statements below describe the earlier delivery, not the current owner-acceptance status. No Phase5 or additional development is authorized.

The subsequently authorized Revision1.1 Decision Service + TypeSafe Jev adapter now has genuine Noul/Choice/Score/mixed evidence through the public Host, an unchanged SDK/Catalog-only external author, and exact-source offline reproduction. The provider-neutral contract was independently admitted to an EXPERIMENTAL Catalog snapshot; frozen foundations and original release tags are unchanged.

- [Acceptance matrix and pending delivery steps](docs/phase4/ACCEPTANCE.md)
- [Actual evidence, retained failures and bounded recovery](docs/phase4/EVIDENCE.md)
- [Safe offline reproduction — no API key or provider calls](docs/phase4/REPRODUCE.md)
- [Decision Service entry point and architecture](services/decision/README.md)
- [Completion/release status](docs/phase4/PHASE4-COMPLETION.md)

Live authority is **CLOSED:6/6 consumed,0remaining**. Never replay live/diagnostic/init/continuation entry points. [Independent parent technical review](docs/phase4/FINAL-PARENT-REVIEW.md) accepted publication, NOT owner acceptance. Public implementation commit `be8079bc7e0c5a60c6887b5905ca1f2f7735d018` passed clean committed-source offline reproduction:54/54 tests and both packed public Host fixtures,0authenticated calls. [The final release declaration](docs/phase4/PHASE4-COMPLETION.md) selects immutable `phase4-jev-v1.0.0`; it becomes effective upon exact tag/main public readback, not an unobserved push claim. No Phase5 follows.

## Public Phase1 and Phase2

This repository is public. [Phase1 completion](https://github.com/BartSchuster22/AlicaV2/blob/phase1-v1.0.0/docs/PHASE1-COMPLETION.md) is frozen at `phase1-v1.0.0`.
The [Phase2 Capability Catalog](https://github.com/BartSchuster22/AlicaV2/tree/phase2/catalog/docs/phase2) delivers C1–C15 independently of the frozen Kernel/ACAP.
See its [completion status](https://github.com/BartSchuster22/AlicaV2/blob/phase2/catalog/docs/phase2/PHASE2-COMPLETION.md), [architecture](https://github.com/BartSchuster22/AlicaV2/blob/phase2/catalog/docs/phase2/ARCHITECTURE.md), [author guide](https://github.com/BartSchuster22/AlicaV2/blob/phase2/catalog/docs/phase2/AUTHOR-GUIDE.md), and [executed evidence](https://github.com/BartSchuster22/AlicaV2/blob/phase2/catalog/docs/phase2/EVIDENCE.md).
The linked Phase1/Phase2 completion records remain authoritative for their frozen scope; the subsequent Phase3 owner decision is recorded above. Historical G7 acceptance is unchanged and is not resumed by Catalog work.

## Historical stage (preserved)

The following records describe the earlier private-repository gate history, not current public availability or authorization.

G3, G4 and [G5](docs/gates/G5-OWNER-ACCEPTANCE.md) are accepted by the owner. For the public SDK and external developer experience: see [G5 delivery and limitations](docs/gates/G5.md), the [empty-directory tutorial](docs/sdk/TUTORIAL.md), [SDK API](docs/sdk/API.md), and [mock differences](docs/sdk/TESTKIT.md). G2 progression uses the [owner-approved manual gate](docs/gates/G2-OWNER-DISPOSITION.md); GitHub remains private. [G6 authenticated IPC](docs/gates/G6.md) has implemented runtime, recovery, confinement and qualification evidence; [G6 owner acceptance](docs/gates/G6-OWNER-ACCEPTANCE.md) records accepted candidate `79702d1`, successful authenticated foundation CI and owner approval under the existing manual control. [G7](docs/gates/G7.md) implementation is authorized: OS-environment probes and online custody setup are complete, and operator trust-bootstrap tooling is implemented with component tests. Real initial trust signing and public-Kernel verification are complete. Concrete G7 contract review and packaging/Cell/qualification work remain pending. G7 is not accepted; G8 and higher-level services are not started. Existing V1 artifacts are references, not runtime dependencies.

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
