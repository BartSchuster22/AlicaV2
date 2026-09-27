# Phase3 charter — authorized build, not completion

Owner approved the Hermes ACAP adapter building plan and finite slice. Phase3 ends before Phase4/JEV and services. G7 is not resumed.

## Frozen inputs

Phase2 tag `phase2-catalog-v1.0.0`: `736b37d03c82ca057e7a397644037ef5d1bed991`; tested executable parent `dc2a4b958ef09c69926ac1f1c7b45a83130f3487`. Phase1 remains `ab0273e8581fa70cbcf15c07f73e990b5dcc725e`. Existing default-main pointer: `50c3d8b5078a0e4139e6880b8070c8585aff990a`.

Authoritative author/test worktree: DEV `/home/alica-dev/AlicaV2-phase3`, branch `phase3/hermes`, created directly from the frozen Phase2 commit. Preserve all original worktrees, tags and G7 WIP.

## Finite approved slice

One request at a time; fresh request-scoped Hermes execution, no resume. Fixed approved model configuration; one trusted read-only fixture tool; actual Hermes agent loop and actual model endpoint. No shell, general filesystem, browser or other network tools, delegation, gateway, cron, persistent memory, desktop, services or community plugin activation. Model endpoint network is the sole required runtime exception. Dedicated execution home/workspace, never a live Hermes profile. Explicit control of ambient discovery, context, credentials, fallbacks and dispatch; reject unrepresentable restrictions. No malicious-plugin sandbox claim.

No live inference until a safe authorized credential reference, fixed endpoint/model and bounded inference budget are established. No automatic retries with uncertain side effects. Local cancellation/process cleanup does not imply provider-side cancellation or avoidance of billing.

## Milestones and gates

M1: H0–H3/H6 — pinned standalone baseline, all listed interfaces inventoried, topology/authority ADR.
M2: H4–H5 — frozen Catalog gap analysis, only necessary generic execution proposal and reference implementation.
M3: H7–H12/H14–H15 — real adapter lifecycle, authority, error normalization, cancellation, execution and bounded evidence.
M4: H13/H16–H17 — separate unchanged provider-independent consumer and controlled failure matrix.
M5: H18–H20 — regressions, purity, exact reproducibility evidence and public annotated freeze.

Kernel/ACAP/SDK remain frozen. Catalog additions follow frozen governance and do not mutate existing contracts/tags. Only adapter-internal cross-language glue; no new generic transport framework. Evaluate existing ACAP public transport/lifecycle before selecting topology. Stop for owner decision if materially broader authority/cost/foundation change is required.

## Anti-loop / closure

Before every task record task, unfinished H criterion, interface/use case, necessity, expected artifact/test and stop condition. Separate product acceptance, regression protection and optional backlog. No optional hardening, new test infrastructure or historical G7 gates. Reuse existing tests/CLI tools. Deterministic fault tests never count as real-model H12.

Publish tested milestones non-force, with minimal default-main README discoverability; no blanket staging or merge. Final H0–H20 acceptance requires Phase1/2 and relevant Hermes regressions, real external flows, purity diff, exact revision evidence, completion report and anonymously verified annotated `phase3-hermes-v1.0.0`. Then STOP before Phase4. Never claim source-only completion.

Status: charter prepared; no adapter, topology approval or acceptance completion is asserted here.
