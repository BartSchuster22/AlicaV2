# ALICA V2 --- Phase 5.0

# ALICA Service Foundation --- Building Plan

## Revision 1.1

**Status:** Revised pre-implementation execution specification\
**Revision basis:** Original Phase-5.0 plan plus the Project Owner
assessment.\
**Normative rule:** These Revision 1.1 amendments supersede conflicting
language in the retained v1.0 plan.

# 0. Revision 1.1 --- Normative Amendments

## R1 --- Three Distinct Conformance Levels

Tooling and evidence MUST distinguish:

### Structural Validation

Proves only that fields, types, formats and references are structurally
valid.

### Semantic Validation

Proves declarations correspond to the selected frozen Catalog context,
configuration schemas, supported bindings and dependency semantics.

### Executed Conformance

Actually proves selected runtime behavior: startup, invocation, existing
permission enforcement, health, dependency/failure behavior, native
execution, shutdown, cleanup and state persistence where promised.

A manifest declaration never proves runtime behavior and never grants
authority.

Example output:

``` text
STRUCTURAL VALIDATION   PASS
SEMANTIC VALIDATION     PASS
EXECUTED CONFORMANCE    PASS

Backup declaration      VALID
Backup execution        NOT TESTED
Migration declaration   VALID
Migration execution     NOT TESTED
```

## R2 --- Lifecycle Is Mapping, Not a New Engine

Phase 5.0 MUST NOT implement a parallel Service Lifecycle state machine.

The specification must map service concepts onto existing accepted
Host/plugin/runtime lifecycle and disposal primitives.

It must clarify: - observer knowledge vs actual runtime state; -
configuration validation vs lifecycle; - startup/active/stop mapping; -
whether restart reuses an instance or creates another; -
failure/disposal mapping.

`DEGRADED` is health, not lifecycle.

## R3 --- Lifecycle and Health Are Separate

A running/active service may independently report:

``` text
READY
DEGRADED
UNAVAILABLE
```

Health truth belongs to the service. Doghouse may later
observe/aggregate it but is not another service's health authority.

Health is not Docker HEALTHCHECK.

## R4 --- Exactly One Existing Runtime Binding for v1

The Phase-5.0 Charter MUST select one already demonstrated public ALICA
runtime binding and document the exact public Host/SDK surfaces used.

Phase 5.0 MUST NOT create: - generic RPC; - process supervisor; -
lifecycle broker; - capability resolver; - service registry.

Other bindings are future profiles.

## R5 --- Precise Native / No-Container Qualification

Core reference/external-author qualification runs in an isolated
environment where:

``` text
Docker executable          unavailable
Podman executable          unavailable
container socket           unavailable
remote container endpoint  unavailable
container startup          0
image download             0
container dependency       0
```

Do not uninstall shared infrastructure merely to satisfy this. Use an
appropriate isolated native environment.

Phase 5.0 claims native-first execution and deployment-independent
contract design, not multi-deployment equivalence.

## R6 --- Mandatory Stateless + Stateful References

Both are required.

### Stateless Reference

Proves manifest, Catalog correspondence, native binding, startup,
invocation, health, permission path, stop and cleanup.

### Tiny Stateful Reference

A neutral record store is sufficient. It proves: - authoritative vs
derived declarations; - `STATEFUL` classification; - config/data-schema
metadata; - state survives normal stop/start where promised; - backup
requirement/consistency declarations.

It MUST NOT become MemoryV4, a backup engine, migration engine or
generic database framework.

A valid backup declaration is not proof that backup/restore works.

## R7 --- Narrow Truth / Result Metadata

Do NOT freeze
`CURRENT / STALE / PARTIAL / FORBIDDEN / FAILED / EMPTY / UNSUPPORTED`
as one universal enum.

Reuse existing error semantics for access/operation failures.

Only standardize orthogonal successful-result metadata demonstrated by
the reference workflow, for example if actually needed:

``` text
freshness: CURRENT | STALE
completeness: COMPLETE | PARTIAL
content: EMPTY | NON_EMPTY
```

Normative rule:

> Absence of a successful result must never be represented as a
> successful EMPTY result.

## R8 --- Bound Data-Authority Claims

Conformance distinguishes:

1.  declaration consistency;
2.  behavior observed in the reference implementation;
3.  access/storage enforcement actually supplied by the selected
    existing runtime boundary.

Do not claim hostile-code storage confinement, universal filesystem
isolation or that arbitrary code can never write elsewhere unless
separately proven.

## R9 --- Real Catalog Correspondence

Semantic validation MUST use an identified frozen Catalog
snapshot/resolution context and check: - authoritative capability
identity/version syntax; - capability existence; - compatible version; -
required vs optional dependency declaration.

Availability and authorization remain runtime concerns handled by
existing ALICA mechanisms.

Do not create a parallel resolver or service registry.

Any genuinely new reference capability uses existing Evolutionary
Capability Catalog governance.

## R10 --- Tooling Must Be Additive

Prefer public accepted exports and supported extension points.

`alicac service ...` is a proposed interface, not an acceptance
requirement.

If adding it would require inappropriate modification of frozen SDK/CLI
foundations, use a separate tool such as:

``` text
alica-service validate
alica-service conformance
```

Functionality/evidence matter; command naming does not.

## R11 --- Phase-1--4 Regression Is Offline Only

Phase-4 TypeSafe/Jev authority remains permanently:

``` text
6/6 physical requests consumed
0 remaining
CLOSED
```

Phase 5.0 MUST NOT: - call model discovery; - execute Jev evaluations; -
run diagnostics; - retry/replay TypeSafe calls; - reset/replenish the
budget; - renew consumed Phase-3 protected live grants.

Use authorized offline/mock/fixture regression paths.

Existing accepted baseline failures remain explicitly identified and
unchanged. They are neither repaired nor reported as passing.

S19 means:

> **No new regression against the accepted Phase-1/2/3/4 baselines.**

## R12 --- Technical Freeze and Owner Acceptance Sequence

Use the established governance sequence:

``` text
Implementation
→ technical acceptance
→ publication
→ immutable technical tag
→ STOP for Project Owner review
→ separate documentation-only Owner Acceptance
→ accepted tag
→ STOP
→ explicit Phase-5.1 authorization
```

Technical completion does not imply Owner Acceptance.

## R13 --- Explicit Non-Implementations

Even where declarations exist, Phase 5.0 does NOT implement: - generic
process supervisor / restart policy; - secret resolver; - dependency
scheduler; - capability router; - general metrics backend; -
observability backend; - backup engine; - migration engine; - UI
renderer; - deployment-management system.

# 1. Revised Execution Order

``` text
01 Freeze Charter / S0–S20 / explicit exclusions
02 Inventory existing public ALICA authorities/primitives
03 Select exactly one existing public runtime binding
04 Define Service Foundation information model
05 Define Service identity/versioning
06 Define ServiceManifest v1
07 Define real Catalog correspondence
08 Define lifecycle mapping
09 Define separate health semantics
10 Define config / secret-reference declarations
11 Define bounded data-authority model
12 Define persistence classes
13 Define events / minimal operational declarations
14 Define backup/restore declarations
15 Define version/migration metadata
16 Define minimal UI metadata
17 Define only demonstrated result/truth metadata
18 Build mandatory native stateless reference
19 Build mandatory tiny native stateful reference
20 Build Structural Validation
21 Build Semantic Validation
22 Build Executed Conformance
23 Build external-author native workflow
24 Execute bounded failure matrix
25 Prove no-container qualification environment
26 Run Phase-1–4 OFFLINE regression only
27 Perform Foundation purity/complexity review
28 Produce docs/evidence/completion
29 Publish immutable technical tag
30 STOP for Owner review
```

# 2. Revised S0--S20 Acceptance Matrix

  -----------------------------------------------------------------------
  ID                                  Requirement
  ----------------------------------- -----------------------------------
  S0                                  Charter, scope, exclusions and stop
                                      boundary frozen

  S1                                  Exact existing ALICA authorities
                                      and lifecycle mappings documented;
                                      no duplicate engines

  S2                                  Service Foundation information
                                      model runtime/container-neutral

  S3                                  Service identity/version rules
                                      defined independently from
                                      capability/platform versions

  S4                                  Structural, Semantic and Executed
                                      Conformance are independently
                                      distinguishable

  S5                                  Provides/requires validated against
                                      a real identified frozen Catalog
                                      context

  S6                                  Lifecycle is a mapping to existing
                                      primitives; Health is separate

  S7                                  Health semantics generic and
                                      service-owned

  S8                                  Configuration and secret-reference
                                      declarations runtime-agnostic; no
                                      new resolver

  S9                                  Data-authority declarations
                                      explicit and evidence claims
                                      bounded

  S10                                 Persistence classification defined
                                      without storage-technology coupling

  S11                                 Event/minimal operational
                                      declarations defined without
                                      observability backend

  S12                                 Backup/restore declaration
                                      semantics exercised by stateful
                                      reference without backup engine

  S13                                 Version/data-schema/migration
                                      metadata exercised without
                                      migration engine

  S14                                 UI contribution metadata optional,
                                      permission-neutral, metadata-only
                                      and non-executable

  S15                                 Stateless + stateful references
                                      pass native qualification in
                                      defined no-container environment

  S16                                 Conformance tooling passes
                                      positive/negative structural,
                                      semantic and executed fixtures

  S17                                 External-author workflow passes
                                      using public surfaces and the
                                      selected existing runtime binding

  S18                                 Failure matrix
                                      deterministic/bounded;
                                      crash/restart remains test-harness
                                      action, not supervisor

  S19                                 No new regression against accepted
                                      Phase-1--4 baselines; regression is
                                      offline only and exhausted live
                                      authorities remain closed

  S20                                 Public reproducibility/evidence
                                      complete; immutable technical tag
                                      published; STOP for Owner review
  -----------------------------------------------------------------------

# 3. Purity Review

Before technical freeze ask of every field/tool:

> Is this required by demonstrated Phase-5.0 evidence, or are we
> predicting a future service?

Expected:

``` text
Kernel structural changes             0
ACAP structural changes               0
Hermes structural changes             0
Decision Service structural changes   0
mandatory Docker dependency           0
mandatory Podman dependency           0
new central runtime service           0
new lifecycle engine                  0
new service registry                  0
new capability router                 0
new supervisor                        0
new backup/migration engine           0
new UI renderer                       0
```

Remove/defer speculative elements.

# 4. Phase-5.0 Completion / Non-Claims

Technical Phase 5.0 is complete when S0--S20 pass and the immutable
technical delivery is publicly reproducible.

It does NOT prove: - MemoryV4 migration; - Doghouse migration; -
UniUI; - AInbA; - production container deployment; - deployment
equivalence across runtimes; - hostile-code confinement; - actual
backup/restore merely because declarations validate; - actual migration
merely because metadata validates; - all future service requirements are
known.

Recommended technical tag:

``` text
phase5.0-service-foundation-v1.0.0
```

After publication:

``` text
STOP
→ Project Owner review
→ separate Owner Acceptance commit
→ accepted tag
→ STOP
→ Phase 5.1 only after explicit authorization
```

------------------------------------------------------------------------

# RETAINED PHASE-5.0 v1.0 PLAN

The original plan remains below for traceability. Where it conflicts
with Revision 1.1 above, the Revision 1.1 amendments are authoritative.

# ALICA V2 --- Phase 5.0

# ALICA Service Foundation --- Comprehensive Building Plan

**Preconditions:** Phases 1--4 complete/frozen/accepted.\
**Purpose:** Define and prove the common foundation for ALICA V2
services before MemoryV4, Doghouse, UniUI and AInbA are individually
constructed.\
**Scope:** Standards, schemas, SDK/tooling support, conformance and
neutral reference services only.

## 1. Mission

Define:

> **What does it mean to be an ALICA V2 Service?**

Phase 5.0 is **not a new central runtime service**. It is a small,
versioned Service Foundation standard.

``` text
ALICA Service Foundation
├── Service Identity
├── Capability Declarations
├── Lifecycle
├── Health
├── Scope / Permissions
├── Configuration
├── Secrets
├── Data Authority
├── Persistence Classification
├── Events
├── Minimal Observability
├── Backup / Restore Declaration
├── Version / Migration Metadata
├── Optional UI Contribution Metadata
└── Service Conformance
```

MemoryV4 in Phase 5.1 becomes the first real production-service
validation.

## 2. Core Principle

> **ALICA services are capability-driven and runtime/container-agnostic
> by design. Process, container and infrastructure topology are
> deployment concerns, not service semantics.**

``` text
SERVICE SEMANTICS
 identity / capabilities / lifecycle / health / authority / data
            │
            ▼
RUNTIME BINDING
 native process / IPC / supported host boundary
            │
            ▼
DEPLOYMENT
 native / systemd / Docker / Podman / VM / future orchestrator
```

## 3. Mandatory Runtime-Agnostic Rules

### Container Agnosticism

No normative service contract may depend on Docker image/Compose name,
container hostname/network/volume/secret, Docker healthcheck or restart
policy.

### Native-First Qualification

Every conformant implementation must be testable without Docker or
Podman installed.

### Deployment Separation

`ServiceManifest != DeploymentManifest`.

### Deployment Equivalence

If multiple deployments exist, the same ACAP consumer uses the same
capability contract without deployment-specific consumer code.

## 4. Scope

### In

ServiceManifest v1; identity; provides/requires; lifecycle; health;
permissions; configuration; secret references; data authority;
persistence classification; events; minimal observability;
backup/restore declaration; version/migration metadata; optional
UI-contribution metadata; native reference service(s); conformance
tooling/tests; deployment-separation proof; external-author workflow;
Phase-1--4 regression; evidence/freeze.

### Out

MemoryV4, Doghouse, UniUI, AInbA implementation; mandatory Docker
packaging; Kubernetes; service mesh; orchestration/workflow/scheduler;
new central registry; new permissions/secrets/observability/backup
products; speculative future-service requirements.

## 5. Reuse Existing ALICA Authorities

Reuse ACAP, Capability Catalog, existing Host/Kernel scope+grants,
lifecycle primitives, secret-reference mechanisms and event semantics.

The Foundation describes how services participate; it must not duplicate
those systems.

## 6. Service Identity and Capability Model

Service identity is independent from capability identity.

``` text
Service: io.alica.example-memory

PROVIDES
  acap://alica.io/memory/search@1

REQUIRES
  acap://alica.io/model/embedding@1
```

Never use a product dependency where a generic capability exists.

``` text
Service version != Capability version != ACAP version != ALICA version
```

## 7. Proposed Repository Structure

``` text
service-foundation/
├── README.md
├── schemas/
│   ├── service-manifest-v1.schema.json
│   ├── data-authority-v1.schema.json
│   ├── lifecycle-v1.schema.json
│   ├── health-v1.schema.json
│   ├── persistence-v1.schema.json
│   └── ui-contribution-v1.schema.json
├── reference/
│   ├── stateless-service/
│   └── stateful-service/
├── conformance/
├── fixtures/
└── docs/

docs/phase5.0/
├── CHARTER.md
├── ACCEPTANCE.md
├── EVIDENCE.md
└── PHASE5.0-COMPLETION.md
```

No new daemon/database/central API.

## 8. ServiceManifest v1

Conceptual starting point:

``` yaml
apiVersion: alica.io/service/v1
kind: Service
metadata:
  id: io.alica.example
  version: 1.0.0
capabilities:
  provides:
    - acap://alica.io/example/read@1
  requires:
    - capability: acap://alica.io/example/dependency@1
      optional: false
scopes:
  supported: [cell, application, session]
permissions:
  declares: [example.read]
lifecycle:
  startup: supported
  gracefulStop: supported
health:
  supported: true
configuration:
  schema: ./config.schema.json
secrets:
  references: []
data:
  authority:
    domains: []
persistence:
  class: stateless
events:
  emits: []
  consumes: []
backup:
  required: false
ui:
  contributions: []
```

Minimize fields before freezing v1.

## 9. Lifecycle

Define the smallest useful semantics, mapped to existing lifecycle
primitives rather than duplicated:

``` text
DISCOVERED → CONFIGURED → STARTING → READY → STOPPING → STOPPED
                                  ↘ DEGRADED
                                  ↘ FAILED
```

Specify startup completion, readiness, graceful/bounded stop, cleanup,
repeated start/stop and dependency-unavailable behavior.

## 10. Health

Generic health states initially:

``` text
READY
DEGRADED
UNAVAILABLE
```

The service owns its health truth. Doghouse later observes/aggregates
it.

Health is not Docker HEALTHCHECK; deployment adapters may map generic
health into Docker/systemd semantics.

## 11. Configuration and Secrets

Configuration is runtime-agnostic: schema, defaults, required values,
reloadability/immutability and validation.

Secret values never enter ServiceManifest. Declare
references/requirements only; actual resolution stays with existing
ALICA/host mechanisms. No Docker Secret dependency in the contract.

## 12. Data Authority

Every stateful service explicitly declares:

``` text
authoritative data
derived/cache data
external-authority data
rebuildable data
```

Example:

``` yaml
data:
  authority:
    domains: [example.records]
  derived: [example.index]
```

This drives backup, migration, UI truth and service replacement.

## 13. Persistence

Minimum classes:

``` text
STATELESS
STATEFUL
DERIVED_STATE_ONLY
EXTERNAL_STATE_AUTHORITY
```

SQLite/PostgreSQL/Docker volumes remain implementation/deployment
concerns.

## 14. Events and Observability

Services may declare governed ACAP events. Avoid direct
product-to-product webhooks when ACAP events fit.

Minimum operational surfaces:

``` text
health
structured diagnostics
bounded metrics metadata where justified
audit-relevant events where justified
```

Do not build Doghouse or another observability backend here.

## 15. Backup / Restore Declaration

Stateful services declare whether authoritative state requires backup
and relevant consistency semantics. Phase 5.0 defines declaration
semantics, not a universal backup engine.

## 16. Versioning and Migration

Declare service version, supported capability versions, config schema
version, data schema version if stateful, migration requirement and
compatibility expectations. Migration implementation remains
service-owned.

## 17. UI Contribution Foundation

Define metadata only, not UniUI.

Potential concepts:

``` text
navigation contribution
view/action contribution
required capability
required permission
display metadata
truth-state semantics
```

Example:

``` yaml
ui:
  contributions:
    - id: example-search
      title: Search
      capability: acap://alica.io/example/search@1
      permission: example.read
```

Rules: - metadata never grants permission; - service works without UI; -
UniUI decides rendering; - no arbitrary executable frontend code in v1
without a later proven need.

## 18. Truth-State Semantics for Future UniUI

Standardize/reuse enough semantics to distinguish:

``` text
CURRENT
STALE
PARTIAL
UNAVAILABLE
FORBIDDEN
FAILED
EMPTY
UNSUPPORTED
```

Do not equate "no data" with "empty". Reuse existing ALICA semantics
where possible; do not create a competing error taxonomy.

## 19. Deployment Separation

A separate optional DeploymentManifest may later describe
native/systemd/container packaging, but it cannot alter service
semantics.

Phase 5.0 requires the separation principle; a full deployment platform
is not required.

## 20. Native-First Reference Services

Build at least one tiny neutral reference service; preferably two if
low-cost:

-   stateless reference;
-   tiny stateful reference demonstrating data authority/persistence
    declarations.

Requirements:

``` text
Docker absent
Podman absent
native execution
public SDK/spec only
```

No production business functionality.

## 21. Service Conformance

Extend existing tooling where possible:

``` text
alicac service validate <service>
alicac service conformance <service>
```

Validate identity, manifest, Catalog correspondence, capabilities,
permissions, lifecycle, health, configuration, secrets, data authority,
persistence, events, backup declaration, UI metadata, native-first
execution and cleanup.

Core conformance does not test Docker.

## 22. External Author Workflow

A separate service-author project using only public ALICA
SDK/spec/tooling must:

1.  author ServiceManifest;
2.  validate;
3.  provide a Catalog capability;
4.  start natively;
5.  serve an unchanged consumer;
6.  report health;
7.  stop cleanly;
8.  pass conformance.

No Kernel source imports. No Docker.

## 23. Failure Matrix

Test malformed manifest; unknown/incompatible capability; missing
dependency/config/secret; denied permission; startup failure; readiness
timeout; dependency disappearance; degraded/unavailable health;
graceful-stop timeout; stale handle; undeclared data authority; invalid
UI contribution; native process crash/restart; cleanup residue.

Every case deterministic and bounded.

## 24. Anti-Loop Policy

Every task maps to an unfinished `S0–S20` criterion:

``` text
Task:
Criterion(s):
Why necessary:
Expected artifact/test:
Stop condition:
```

No criterion → no work.

Separate Product Acceptance, Regression Protection and Optional/Future
work. Only Product Acceptance determines completion.

The agent MUST NOT start MemoryV4, Doghouse, UniUI or AInbA;
containerize merely because Docker exists; build Kubernetes, a central
registry, workflow engine, backup platform or observability backend;
reopen frozen phases for convenience; or expand v1 based on hypothetical
future needs.

When S0--S20 pass: regress → evidence → completion report →
commit/tag/freeze → terminate continuation jobs → **STOP** → request
Phase-5.1 authorization.

## 25. Step-by-Step Execution

1.  Freeze Phase-5.0 Charter and S0--S20.
2.  Inventory existing ALICA primitives to reuse.
3.  Define Service Foundation information model.
4.  Define Service identity/versioning.
5.  Define ServiceManifest v1 schema.
6.  Define capability provides/requires correspondence.
7.  Define lifecycle mapping.
8.  Define health semantics.
9.  Define config/secrets declarations.
10. Define data-authority model.
11. Define persistence classes.
12. Define events/minimal observability.
13. Define backup/restore declarations.
14. Define version/migration metadata.
15. Define minimal UI-contribution metadata.
16. Define/reuse truthful state semantics.
17. Build native stateless reference.
18. Build native stateful reference if justified.
19. Build `alicac service` validation/conformance.
20. Build external-author workflow.
21. Execute failure matrix.
22. Prove Docker/Podman are absent from core qualification.
23. Run Phase-1--4 regressions.
24. Perform Foundation purity/complexity review.
25. Write docs/evidence/completion.
26. Freeze/tag.
27. STOP.

## 26. Acceptance Matrix

  -------------------------------------------------------------------------
  ID                               Requirement
  -------------------------------- ----------------------------------------
  S0                               Charter, scope and stop boundary frozen

  S1                               Existing ALICA authorities reused; no
                                   duplicate Kernel/ACAP systems

  S2                               Service Foundation information model
                                   provider/runtime-neutral

  S3                               Service identity/version rules defined

  S4                               ServiceManifest v1 schema validates
                                   deterministically

  S5                               Provides/requires reference governed
                                   capabilities

  S6                               Lifecycle maps cleanly to existing ALICA
                                   primitives

  S7                               Health semantics generic and
                                   service-owned

  S8                               Configuration and secret-reference
                                   semantics runtime-agnostic

  S9                               Data-authority model explicit

  S10                              Persistence classification defined
                                   without storage coupling

  S11                              Event/minimal observability declarations
                                   defined

  S12                              Backup/restore declaration semantics
                                   defined

  S13                              Version/migration metadata defined
                                   without universal migration engine

  S14                              UI contribution metadata is optional,
                                   permission-neutral and non-executable

  S15                              Native reference service passes with
                                   Docker/Podman absent

  S16                              Service conformance tooling passes
                                   positive/negative fixtures

  S17                              External-author native workflow passes
                                   with public surfaces only

  S18                              Failure matrix deterministic/bounded

  S19                              No new regression against accepted
                                   Phase-1--4 baselines; foundation purity
                                   preserved

  S20                              Documentation/evidence/reproducibility
                                   complete; phase frozen and stopped
  -------------------------------------------------------------------------

## 27. Purity Review

Before freeze ask of every Foundation field/tool:

> Is this common to ALICA services based on demonstrated need, or are we
> predicting a future service?

Remove/defer speculative elements.

Expected architectural diff:

``` text
Kernel structural changes: 0
ACAP structural changes: 0
Hermes structural changes: 0
Decision Service structural changes: 0
Mandatory Docker dependency: 0
Mandatory Podman dependency: 0
New central runtime service: 0
```

Catalog additions, if genuinely required, follow existing governance.

## 28. Completion / Non-Claims

Phase 5.0 proves the common service contract and native-first
conformance model.

It does NOT prove: - MemoryV4 is migrated; - Doghouse is migrated; -
UniUI exists; - AInbA exists; - container deployment is
production-qualified; - all future service requirements are known; -
Kubernetes/orchestration is needed; - UI contributions are final for
every future application.

Recommended tag:

``` text
phase5.0-service-foundation-v1.0.0
```

Completion:

``` text
S0–S20 PASS
→ Phase-1–4 regression
→ native/no-container proof
→ purity review
→ PHASE5.0-COMPLETION.md + EVIDENCE.md
→ commit/tag/public verify
→ STOP
→ request explicit Phase-5.1 MemoryV4 authorization
```

## 29. Handoff to Phase 5.1 --- MemoryV4

Phase 5.1 must treat the frozen Service Foundation as a hypothesis to
validate against a real stateful service.

MemoryV4 assessment should determine:

``` text
reuse
adapt
refactor
rebuild
```

rather than assuming a full rewrite.

If MemoryV4 reveals a genuine Foundation gap:

``` text
reproduce real requirement
→ determine generic vs MemoryV4-specific
→ generic: governed Foundation revision proposal
→ specific: keep inside MemoryV4/adapter
```

Do not silently modify the frozen Foundation.

## 30. Strategic Roadmap

``` text
PHASE 5.0  Service Foundation
     ↓
PHASE 5.1  MemoryV4 + Adapter
     ↓
PHASE 5.2  Doghouse + Adapter
     ↓
PHASE 5.3  UniUI
     ↓
PHASE 5.4  AInbA Application Foundation
```

Each phase independently follows:

``` text
ASSESS → PLAN → BUILD → TEST → EVIDENCE → OWNER ACCEPT → FREEZE → STOP
```
