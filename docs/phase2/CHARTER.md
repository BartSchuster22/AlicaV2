# Phase 2 charter

Build the local-first, evolutionary ACAP Capability Catalog only. Phase 1 remains
frozen at phase1-v1.0.0. Catalog code imports public ACAP APIs, never Kernel
internals. Catalog standardizes contracts, not providers. It is not the active
Runtime Registry, a Plugin Catalog, orchestrator, marketplace or hosted service.

Scope: definition/model, namespace policy, proposal/review/lifecycle, conservative
compatibility, CLI lookup/index, immutable offline snapshots, external authoring,
neutral Echo proof, documentation/regression and freeze.

Excluded: Hermes, JEV, MemoryV4, Doghouse, UniUI, AInbA, MCP, federation and all
Phase-3 integration. No Kernel changes without reproduced blocking defect and
explicit owner approval. A Catalog release is independent of capability, ACAP,
platform and plugin versions. Stable major contracts carry compatibility rules.

## Acceptance and milestones

- M1: C1 independent architecture; C2 schema-validatable definition; C3 namespace
  enforcement; C5 independent versioning; C7 semantic dependencies; C8 vocabulary
  without grants. Early C13 public-interface feasibility.
- M2: C4 lifecycle; C6 conservative diff; C9 proposal/review.
- M3: C10 deterministic checkout validation; C11 reproducible index; C12 offline
  snapshot and integrity verification; CLI.
- M4: C13 separate external author via public APIs; C14 neutral complete workflow.
- M5: C15 docs, evidence, Catalog and Phase1 regression/external flow; completion
  report, public commit and phase2-catalog-v1.0.0 freeze. Then STOP.

## Binding execution discipline

Every work block records Task / C targets / Why / Expected artifact/test / Stop.
Separate product acceptance, regression protection and optional hardening. No
speculative capability families or infrastructure. Execute evidence, not merely
write tests. DONE -> commit -> next milestone. One focused correction per failed
approach, then expose the concrete blocker/change approach. No obsolete G7 gate
blocks Catalog acceptance. Optional improvements go to backlog.

When all C1-C15 pass: stop implementation, run Catalog/Phase1/external regressions,
verify generated outputs, write completion/limitations, commit/publish/freeze,
update status, stop continuation. Phase 3 requires separate owner authorization.
Future integrations may propose generic missing contracts through this Catalog;
they must not add private Kernel APIs.
