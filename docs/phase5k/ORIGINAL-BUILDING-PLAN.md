# ALICA V2 --- Phase 5.K

# Hermes Kanban + ACAP Adapter --- Comprehensive Building Plan

**Status:** Proposed pre-implementation execution specification\
**Phase identifier:** `5.K` remains provisional until deliberately
frozen. Existing frozen phases/tags MUST NOT be renumbered.\
**Preconditions:** Phase 5.2 remains frozen/accepted; Phase 5.3 UniUI
has not started.\
**State authority:** Hermes Kanban remains the sole authoritative
Kanban-state provider.\
**Initial claim:** Durable Kanban-state integration, not full
execution-orchestration qualification.

## 1. Mission

Prove:

``` text
ALICA Consumer
→ Public ACAP Kanban Contract
→ Hermes Kanban Adapter
→ Supported Hermes Business/API Boundary
→ Hermes-owned Authoritative State
```

Do NOT build a second Kanban database, universal orchestration service,
ALICA Kanban Service, dispatcher replacement, worker supervisor or
generic DAG/workflow/swarm engine.

## 2. Hard Architecture Rules

1.  **One state authority:** Hermes owns
    board/task/dependency/run/lifecycle truth.
2.  **No direct SQLite integration.**
3.  **Provider-neutral contract does not equal provider-neutral state
    authority.**
4.  **Kanban remains method-specific:** use `orchestration/kanban/*`,
    not premature `work.*`.
5.  **Hermes implementation details stay private:** SQLite schema, PIDs,
    filesystem, profiles, dispatcher internals and CLI/dashboard
    semantics are not ACAP standards.
6.  **Adapter disposal must not stop Hermes or terminate backend-owned
    work.**
7.  **Provider B is future validation, not a completion dependency.**

## 3. State Integration vs Execution Control

Separate:

``` text
DURABLE STATE
board/task/dependency/comment/review/event state

EXECUTION CONTROL
dispatch/claim/spawn/retry-launch/terminate/provision
```

A mutation may indirectly make work dispatchable. For every mutation
record side effects, dispatch eligibility, automatic dispatcher reaction
and required authority.

**Default:** dispatch, termination, worker provisioning and
execution-launching retries are DEFERRED.

## 4. Default Initial Slice

### IN

-   read one authorized board;
-   create/read/list tasks;
-   selected task updates/transitions with known side effects;
-   comments/handoffs;
-   dependencies only if K10 can freeze semantics;
-   selected lifecycle events with bounded replay/reconciliation;
-   worker/run read visibility only if required;
-   authorization/conflict/idempotency/restart/disposal proof.

### DEFERRED

-   dispatch trigger;
-   run termination;
-   worker/profile provisioning;
-   automatic execution-launching retry;
-   workspace creation;
-   arbitrary artifact access;
-   swarm helpers;
-   dispatcher tuning;
-   bulk administration;
-   provider replacement/live migration;
-   Doghouse integration;
-   UniUI implementation.

## 5. Supported Backend Boundary

Before implementation pin and prove exact Hermes revision/component,
supported callable/API entry points, compatibility expectations,
lifecycle/authorization behavior and
initialization/dispatcher/state/config side effects.

An importable function is not automatically a supported public boundary.

If a required operation has no acceptable interface:

``` text
record gap
→ classify owner: Hermes / Adapter / Catalog / Service Foundation
→ STOP dependent implementation
→ separately govern resolution
```

Never fill gaps with SQL, private module calls, dashboard scraping or
undocumented filesystem manipulation.

## 6. Lifecycle / Task-Run Semantics

Freeze task states/transitions, prerequisites, side effects, dispatch
eligibility, completion/blocked/review semantics and deletion/archive
policy.

Distinguish Task from Run/Attempt. Define multiple-attempt behavior,
which run determines task status, retry semantics and failed-run vs
failed-task semantics.

Do not claim semantics stronger than Hermes proves.

## 7. Concurrency / Retry / Ambiguous Outcomes

Freeze stale-update/conflict behavior, idempotency key/scope/retention,
concurrent transitions and dependency conflicts.

Timeout is not automatically failure. If commit may have happened,
return an explicit ambiguous/unknown outcome until reconciled. Define
read-after-timeout and safe retry.

Cancellation must distinguish stop-waiting, cancel-adapter-work,
cancel-backend-operation and terminate-execution. Execution termination
is deferred by default.

## 8. Dependencies / Review / Deletion

If dependencies are IN, define direction, satisfaction, cycles,
cross-board references, missing-target behavior, authorization and
dispatch effects. Otherwise DEFER.

Decide whether work-complete, review-requested, review-approved and
final-complete are separate facts.

Freeze deletion as supported, archive-only or deferred.

## 9. Identity / Authority

Effective permission:

``` text
ALICA Principal + Scope + Grant
AND
backend-permitted operation
```

Define originating-principal representation, adapter service identity,
attribution, board/task/run lookup without existence leaks, cross-board
references, worker visibility vs worker-use authority, workspace access
and artifact-reference access.

Caller-supplied identity is not authority. If Hermes lacks equivalent
per-principal controls, document the adapter as trusted enforcement
boundary.

## 10. Event Delivery Contract

Freeze event ID/schema/provenance, board/task/run identity, ordering
scope, duplicate behavior, replay cursor, retention/expired cursor,
reconnection/missed-event reconciliation, subscription auth/revocation,
backpressure, payload limits and cleanup.

A stored history is not proof of subscription transport. Bounded
supported incremental polling is allowed if described truthfully with
freshness/gap semantics.

## 11. Adapter Metadata

No competing domain persistence. Narrow durable metadata such as replay
cursor, bounded identity mapping or reconciliation state is allowed only
if required, with explicit purpose, retention and recovery semantics.

Prefer stateless operation. Do not build a generic adapter DB.

## 12. Single-Host Truth

Do not imply distributed consensus, multi-host ownership, cluster
locking, HA replication, cross-host transactions or distributed worker
leases. Hermes-local PID/process semantics remain provider-specific.

## 13. Portability Scope

Distinguish:

1.  provider-neutral public contracts --- REQUIRED;
2.  historical semantic mapping --- optional bounded scope;
3.  canonical export/import --- separately selected;
4.  active-execution continuation --- DEFERRED by default.

Import must never launch work or restore PIDs, leases, credentials,
workers, dispatch or runtime authority.

## 14. Catalog / Service Foundation

Use minimum `orchestration/kanban/*` capabilities only.

Catalog lifecycle:

``` text
Proposal → Review → PROPOSED
→ implementation/conformance
→ EXPERIMENTAL
```

STABLE requires later evidence, ideally Provider B.

Create adapter ServiceManifest/plugin declarations for identity/version,
provides/requires, lifecycle, health, config/secrets, adapter-owned
metadata/persistence if any and events.

# 15. Mandatory Pre-Code Gates

**No adapter product code until K0--K7 pass.**

### K0 --- Charter / Identifier / Safety Freeze

Freeze identifier, scope, exclusions, Hermes authority,
execution-control deferral, isolation, acceptance matrix and anti-loop
rules. Do not renumber frozen phases.

### K1 --- Hermes Baseline

Pin repository/Kanban/runtime/config/state/dispatcher/worker/event
revisions. Treat prior backend claims as unverified until here.

Outputs: `HERMES-KANBAN-BASELINE.md`, `RUNTIME-REFERENCE.md`.

### K2 --- Feature / Authority Inventory

For each relevant function record entry point, supported/public status,
reads/writes, side effects, dispatch effects, authority, persistence,
events, tests, compatibility and `REUSE/ADAPT/INTERNAL/DEFER`.

### K3 --- Supported Backend Boundary Proof

Prove supported Hermes surfaces for every candidate operation without
operational dispatch discovery. Missing required surface → STOP/govern
gap.

### K4 --- Public ALICA Binding Reconciliation

Prove frozen public ALICA surfaces for adapter registration, invocation,
principal/scope/grants, events, lifecycle/disposal and errors/deadlines.
No private Kernel shortcut.

### K5 --- Exact Initial Slice

Mark every candidate `IN` or `DEFERRED`, classify `READ/MUTATE/CONTROL`,
and record indirect execution effects. Control deferred by default.

### K6 --- Qualification Isolation

Create isolated board/state/identities/fixtures and prove selected
mutations cannot reach operational queues/workers. If transitions can
dispatch, safely isolate/disable dispatcher or choose non-launching
transitions.

### K7 --- Portability Scope

Freeze `PUBLIC CONTRACTS ONLY`, `+ HISTORICAL MAPPING`, or
`+ BOUNDED CANONICAL EXCHANGE`. Active-execution continuation deferred
by default.

# 16. Design Freeze Gates

**No implementation until K8--K13 pass.**

### K8 --- Lifecycle / Task-Run Contract

Freeze task lifecycle, side effects, task/run, review/completion and
delete/archive semantics.

### K9 --- Concurrency / Retry / Ambiguous Outcome Contract

Freeze conflicts, idempotency, timeout, reconciliation, retry and
cancellation.

### K10 --- Dependency Contract

Freeze dependency semantics if IN; otherwise record DEFERRED.

### K11 --- Identity / Authority Contract

Freeze principal/service identity, attribution, lookup isolation, worker
visibility/use and workspace/artifact boundaries.

### K12 --- Event Delivery Contract

Freeze
schema/identity/order/duplicates/replay/retention/reconnect/reconciliation/auth/backpressure/cleanup.
Unsupported required transport → STOP/revise scope or govern gap.

### K13 --- Capability Proposal + ServiceManifest

Derive only minimum generic capabilities. Catalog to `PROPOSED` only.
Run Structural + Semantic Validation.

**K13:** K8--K13 DESIGN FROZEN.

# 17. Implementation

### K14 --- Adapter Core

Implement ACAP ↔ supported Hermes mapping without duplicate Kanban
authority.

### K15 --- Authority Enforcement

Implement scopes/grants, attribution and existence-leak protections.

### K16 --- Mutation Safety

Implement exact conflict/idempotency/ambiguous-outcome behavior.

### K17 --- Event Adapter

Implement selected delivery/replay/reconciliation; if incremental
polling is used, expose freshness/gaps truthfully.

### K18 --- Metadata Boundary

Implement only approved bounded adapter metadata, otherwise stateless.

### K19 --- Lifecycle / Restart / Disposal

Prove adapter restart, safely isolated Hermes restart if included,
reconciliation and clean disposal. Disposal never stops Hermes/backend
work.

### K20 --- Executed Conformance

Run isolated/native qualification for exactly the selected slice.
Deferred control is not claimed. Enumerate what actually ran.

### K20b --- EXPERIMENTAL Admission

After implementation/contract/conformance evidence, transition
implemented capabilities from PROPOSED to EXPERIMENTAL through Catalog
governance.

# 18. External / Failure / Regression Qualification

### K21 --- External Consumer

Separate public-SDK consumer; no Hermes internals, SQLite, private
Kernel or testkit dependency.

### K22 --- Failure / Security Matrix

Always test unauthorized/cross-scope lookup, stale/conflicting mutation,
duplicate/idempotent retry, ambiguous timeout, restart/reconciliation,
event duplicate/replay/expired cursor, backpressure/limits, malformed
data, adapter metadata corruption if applicable and clean disposal.

Adapter/control-specific tests apply only if selected. Do not add
dispatch/control just to test them.

### K23 --- No-New-Regression

Run accepted offline Phase-1--5.2 regressions plus safe Hermes/Kanban
tests.

Normative rule: existing accepted failures remain failures; they are
neither reported as passing nor reopened merely to green the phase.

### K24 --- Purity Audit

Expected:

``` text
Kernel structural changes             0
ACAP structural changes               0
Hermes Kanban duplicate authority     0
direct SQLite integration             0
production board/worker interaction   0
unapproved dispatch/termination       0
ALICA Kanban Service                  0
generic orchestration framework       0
UniUI/Doghouse changes                0
```

### K25 --- Documentation / Reproducibility

Publish baseline, supported-boundary proof, slice, contracts, capability
proposal/admission, ServiceManifest, adapter mapping, event semantics,
metadata, isolation, failure evidence, exact executed conformance,
non-claims and exact revisions.

# 19. Acceptance Matrix K0--K25

  ----------------------------------------------------------------------------------------
  ID                                  Requirement
  ----------------------------------- ----------------------------------------------------
  K0                                  Charter/identifier/safety/state-authority boundary
                                      frozen

  K1                                  Exact Hermes/Kanban baseline pinned

  K2                                  Evidence-backed feature/authority inventory complete

  K3                                  Supported Hermes integration boundary proven

  K4                                  Public ALICA binding path proven

  K5                                  Finite initial slice and READ/MUTATE/CONTROL effects
                                      frozen

  K6                                  Isolated qualification prevents operational
                                      worker/control effects

  K7                                  Portability scope explicitly frozen

  K8                                  Lifecycle/task-run/review/delete contract frozen

  K9                                  Concurrency/idempotency/timeout/retry/cancellation
                                      contract frozen

  K10                                 Dependency contract frozen or explicitly deferred

  K11                                 Identity/authority contract frozen

  K12                                 Event delivery/replay/reconciliation contract frozen

  K13                                 Minimum capabilities PROPOSED; ServiceManifest
                                      Structural/Semantic PASS; Design Frozen

  K14                                 Adapter core uses supported Hermes boundary and no
                                      duplicate authority

  K15                                 Scope/grant/attribution/existence-leak enforcement
                                      passes

  K16                                 Mutation safety/ambiguous outcomes pass

  K17                                 Event adapter passes selected delivery contract

  K18                                 Adapter metadata is absent or narrowly
                                      bounded/non-authoritative

  K19                                 Restart/reconciliation/disposal passes without
                                      stopping backend work

  K20                                 Executed Conformance passes for exact selected scope

  K20b                                Implemented capabilities admitted EXPERIMENTAL

  K21                                 External public consumer passes

  K22                                 Failure/security/limits matrix passes

  K23                                 No new regression; inherited accepted failures
                                      preserved

  K24                                 Purity/state-authority/production-isolation audit
                                      passes

  K25                                 Public documentation/evidence/reproducibility
                                      complete
  ----------------------------------------------------------------------------------------

# 20. Independent Review / Release

After K0--K25 including K20b:

``` text
freeze candidate
→ independent finite review
→ blocking acceptance defects only: fix + targeted re-evidence
→ optional improvements: future work
→ freeze final candidate
→ technical publication
→ immutable annotated tag
→ anonymous exact-source/document verification
→ STOP for Owner Acceptance
```

Independent review is not an unrestricted hardening phase.

Recommended provisional tag if identifier remains 5.K:

`phase5k-hermes-kanban-v1.0.0`

Final tag naming should be frozen in K0.

# 21. Anti-Loop Rules

Every task maps to an unfinished K criterion with task, necessity,
artifact/test and stop condition. No criterion → no work.

Do NOT: - build an ALICA Kanban Service; - create a second synchronized
Kanban DB; - integrate through SQLite/private Hermes internals; -
broaden to DAG/workflow/swarm/event orchestration; - add
dispatch/termination/provisioning unless K5 explicitly includes them; -
touch production boards/workers; - build Provider B; - start
UniUI/Doghouse integration; - promote capabilities to STABLE; - add
canonical migration unless K7 selects it; - continue optional hardening
after acceptance passes.

# 22. Explicit Non-Claims

Completion does not prove: - full execution-orchestration qualification
if control is deferred; - distributed/multi-host Hermes semantics; -
Provider B compatibility; - ALICA-owned Kanban state; - production
cutover; - universal Kanban migration; - active-run continuation; -
generic DAG/workflow/swarm semantics; - UniUI integration; - Doghouse
integration.

It proves the selected provider-neutral Kanban contract against Hermes
as initial state authority through supported boundaries and isolated
evidence.

# 23. Roadmap Boundary

Phase 5.3 UniUI remains separate and requires explicit authorization
after Phase 5.K Owner Acceptance.

A future ALICA Kanban Service is a separate architecture decision after
Provider B evidence.

------------------------------------------------------------------------

## Source Review Incorporated

The Phase 5.K Architecture Review requires state-vs-execution
separation, a hard supported-backend gate, frozen
lifecycle/concurrency/ambiguous-outcome semantics, a real event-delivery
contract, narrowly bounded adapter metadata, tighter identity mapping,
proportionate portability, a narrower initial slice and independent
release gates. These requirements are normative in this Building Plan.
