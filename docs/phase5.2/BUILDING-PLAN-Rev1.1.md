# ALICA V2 --- Phase 5.2

# Doghouse + ACAP Adapter --- Building Plan

## Revision 1.1

**Status:** Revised pre-implementation execution specification.\
**Normative rule:** These Revision 1.1 amendments supersede conflicting
language in the retained v1.0 plan.

# REVISION 1.1 --- NORMATIVE AMENDMENTS

## R1 --- Repository Findings Are Unverified Until D1--D2

Prior Doghouse findings from documentation/read-only review are
hypotheses until exact source is pinned and statically verified. No
REUSE/ADAPT/REFACTOR disposition is final before D1--D2.

## R2 --- D4 Requires a Proven Public Signal Path

A documented interface gap is not D4 PASS. D4 requires:

``` text
authorized isolated reference source
→ accepted public ALICA surface
→ Doghouse signal adapter
```

If absent: record a governed Foundation/Catalog gap, STOP Phase 5.2,
resolve through governance, then resume. No private Kernel shortcut.

## R3 --- Formal Design Freeze Before Refactoring

No Doghouse domain/product refactor may begin until D5--D8 all pass:

``` text
D5 Canonical Assurance Model
D6 Incident/Dedupe/Temporal/Continuation Contract
D7 Minimum Capability Design → PROPOSED
D8 ServiceManifest Structural + Semantic Validation
→ DESIGN FREEZE
```

## R4 --- PROPOSED != EXPERIMENTAL

Catalog sequence:

``` text
Proposal → Review → PROPOSED (design approved)
→ implementation → contract/conformance evidence
→ EXPERIMENTAL admission
```

Add post-implementation gate **D13b**: implemented capability must be
admitted EXPERIMENTAL before technical release.

## R5 --- Canonical Continuation Contract

D5/D6 must define exactly which state is portable for an OPEN incident,
including as needed:

``` text
incident identity
occurrence history
last distinct observation
correlation key
bounded dedupe event IDs/equivalent
window anchors
rule ID/version
recovery state
```

Only minimal continuity state moves; arbitrary caches do not.

Rule compatibility after import:

``` text
COMPATIBLE      → continuation allowed
HISTORICAL_ONLY → preserve/query; no automatic continuation
REJECTED        → unsafe import rejected
```

Missing rule semantics never trigger silent reassessment under a newer
rule.

## R6 --- Imported Provenance Is Not Authority

Imported producer/observer/target/scope identities are historical
evidence only.

Import MUST NOT transfer or activate:

``` text
credentials
ACAP grants
probe registrations
privileged targets
sockets
Docker/systemd access
executor/restart authority
```

Current local identities and authorization are resolved independently in
the target environment.

D6/D16 must also define idempotent handling of an event processed before
export and redelivered after import.

## R7 --- Adapter-Specific Failure Cases Are Conditional

D17 always tests domain failures such as forged/unauthorized signals,
cross-scope correlation, duplicate redelivery, recurrence,
stale/out-of-order signals, overload, evidence limits,
persistence/crash/restart and import/continuation failures.

HTTP/network-probe cases such as redirects, probe timeout or target
rejection are required only if D4 selects an active probe adapter.
Otherwise mark them `NOT_APPLICABLE` with rationale. Do not build a
probe merely to satisfy the matrix.

## R8 --- Freeze Annotation / Manual Resolution Scope

D6 must explicitly decide whether `Annotation` and `Manual Resolution`
are IN or DEFERRED. Later schema, capabilities and tests must follow
that decision.

## R9 --- Qualification Must Be Production-Isolated

Qualification MUST NOT use:

``` text
production endpoints
production service IDs as probe targets
production credentials
production state directories
production Docker socket
production systemd
operational Doghouse timers
operational restart/kill/cutover paths
```

Only isolated authorized reference sources/fixtures are permitted.

## R10 --- No-New-Regression Wording

D19 means:

> **No new regression against the accepted Phase-1--5.1 baselines.
> Existing accepted failures remain explicitly identified and unchanged;
> they are neither reported as passing nor reopened by Phase 5.2.**

## R11 --- Executed Conformance Must Be Truthful

D13 evidence must enumerate what actually ran, e.g.:

``` text
startup              PASS
signal ingestion     PASS
incident lifecycle   PASS
persistence/restart  PASS
self-health          PASS
shutdown/cleanup     PASS

backup execution     NOT TESTED
migration execution  NOT TESTED
```

Declarations do not imply executed qualification.

## R12 --- Clarified Non-Claim

Replace ambiguous "not Doghouse V2 implementation" language with:

> Phase 5.2 does not authorize replacement or cutover of the currently
> operational Doghouse deployment and does not complete any separate
> future Doghouse-generation roadmap beyond the scoped ALICA V2
> integration.

## R13 --- Independent Final Review Is Mandatory

After all acceptance evidence including D13b:

``` text
freeze candidate
→ independent finite review
→ blocking acceptance defects only: fix + targeted re-evidence
→ optional improvements: future work
→ freeze final candidate
→ publish technical release
→ immutable annotated tag
→ anonymously verify exact public source/documents
→ STOP for Owner Acceptance
```

Reuse hash-bound evidence where valid. Final review is not an
unrestricted hardening phase.

# REVISED ACCEPTANCE MATRIX

  ----------------------------------------------------------------------------
  ID                                  Requirement
  ----------------------------------- ----------------------------------------
  D0                                  Charter/safety/production-isolation
                                      frozen

  D1                                  Exact baseline reconciled without
                                      starting operational Doghouse

  D2                                  Evidence-backed feature/authority
                                      disposition complete

  D3                                  Assurance and recovery/control authority
                                      separated

  D4                                  Concrete authorized public signal path
                                      proven; unresolved gap cannot PASS

  D5                                  Canonical Assurance Model approved

  D6                                  Incident/dedupe/temporal/continuation
                                      contract approved, including
                                      optional-domain scope

  D7                                  Minimum capability design reviewed and
                                      PROPOSED

  D8                                  ServiceManifest passes
                                      Structural/Semantic Validation; D5--D8
                                      Design Frozen

  D9                                  Domain separated from deployment/control
                                      adapters

  D10                                 Persistence preserves required
                                      restart/continuity state

  D11                                 Selected signal adapter preserves
                                      identity/provenance/scope

  D12                                 ACAP adapter executes approved slice

  D13                                 Native no-container Executed Conformance
                                      passes with exact executed claims

  D13b                                Implemented capability admitted
                                      EXPERIMENTAL

  D14                                 Canonical export passes

  D15                                 Fresh isolated import passes without
                                      authority transfer

  D16                                 Semantic round-trip, compatible
                                      continuation, incompatible-state
                                      handling and post-import duplicate
                                      idempotency pass

  D17                                 Failure/security matrix passes;
                                      inapplicable adapter cases explicitly
                                      documented

  D18                                 External consumer uses public
                                      implementation-independent contract

  D19                                 No new regression; inherited accepted
                                      failures preserved

  D20                                 Purity/scope/production-isolation audit
                                      passes

  D21                                 Public
                                      documentation/evidence/reproducibility
                                      package complete
  ----------------------------------------------------------------------------

# REVISED EXECUTION ORDER

``` text
PRE-CODE
01 D0 Charter
02 D1 Baseline reconciliation
03 D2 Feature/authority inventory
04 D3 Assurance↔Recovery ADR
05 D4 Proven public signal path

DESIGN FREEZE
06 D5 Canonical Assurance Model
07 D6 Incident/Dedupe/Temporal/Continuation Contract
08 D7 Capability → PROPOSED
09 D8 ServiceManifest + Semantic Validation
10 DESIGN FREEZE

IMPLEMENTATION
11 D9 Domain extraction
12 D10 Persistence/store boundary
13 D11 Selected signal adapter
14 D12 ACAP adapter
15 D13 Native Executed Conformance
16 D13b Catalog → EXPERIMENTAL

PORTABILITY
17 D14 Canonical export
18 D15 Fresh import
19 D16 Round-trip/continuation

QUALIFICATION
20 D17 Failure/security matrix
21 D18 External consumer
22 D19 Offline regression
23 D20 Purity audit
24 D21 Documentation/evidence
25 Candidate freeze
26 Independent finite review
27 Resolve blocking findings only
28 Technical publication + immutable tag
29 Anonymous exact-source/document verification
30 STOP for Owner Acceptance
```

# ADDITIONAL ANTI-LOOP RULES

Do not: - treat an unresolved D4 interface gap as completion; - refactor
before Design Freeze; - promote PROPOSED directly to EXPERIMENTAL
without implementation/conformance evidence; - convert imported
historical identities into local authority; - build an adapter merely to
satisfy an inapplicable test; - turn independent final review into
open-ended optimization; - poll production services during
qualification; - repair inherited accepted failures merely to make
regression output green.

------------------------------------------------------------------------

# RETAINED PHASE-5.2 v1.0 PLAN

The original comprehensive plan follows for traceability. Where it
conflicts with Revision 1.1 above, Revision 1.1 is authoritative.

# ALICA V2 --- Phase 5.2

# Doghouse + ACAP Adapter --- Comprehensive Building Plan

**Status:** Proposed execution specification\
**Precondition:** Phase 5.1 must be frozen/Owner Accepted before
implementation.\
**Safety:** Existing watchdog/control paths must not be started for
discovery. No operational restart/kill/cutover is authorized.

## 1. Mission

Establish Doghouse as ALICA's **cross-service assurance,
health-observation and incident-management service**:

``` text
OBSERVE → DETECT → CLASSIFY → CORRELATE → RECORD → EXPOSE
```

Doghouse is not automatically a supervisor, orchestrator, scheduler or
autonomous remediation agent.

> **Observation authority does not imply recovery authority.**

## 2. Non-Negotiable Architecture

**A. Assurance Domain First:** Doghouse owns observations, incidents,
incident lifecycle, classifications, acknowledgements, annotations,
resolutions, evidence references and minimal continuity state.

**B. Facts != Assessments:** preserve signal producer, observer, target,
observation, rule and derived incident separately.

**C. Health != Reachability != Incident State:** Doghouse never
overwrites another service's authoritative health report.

**D. Recovery Authority Separate:**

``` text
Incident → optional Recovery Request → Policy/Permission → Runtime Authority
```

No remediation in the initial slice.

**E. Core-first / Adapter-out:**

``` text
Health/Event Adapter ─┐
Runtime Observer ─────┼─ Doghouse Domain → Store Port
HTTP Adapter ─────────┤
ACAP Adapter ─────────┘
```

Docker/systemd/notifications/recovery are adapters or deployment
concerns.

**F. Native-first:** core qualification with Docker/Podman/socket
unavailable.

**G. Portable Assurance Data:** durable history belongs to ALICA
Assurance Domain, not V1 storage.

**H. Existing operational Doghouse no-touch.**

## 3. Existing Doghouse --- Assessment Basis

Read-only assessment found documented service registry, HTTP checks,
classification, counters, incident writer/dedupe, diagnostics, devtask
monitoring, audit, shadow mode, cutover/soak/QA/security tooling,
notification outbox, Host Executor, systemd integration, restart
policy/cooldown, active-task guard, destructive-action confirmation,
executor audit/hash chain and controlled restart drills. Historical
`kill` remained disabled.

These are candidates for disposition, not automatic Phase-5.2 scope.

## 4. Preliminary Disposition

  ---------------------------------------------------------------------
  Existing area                      Direction
  ---------------------------------- ----------------------------------
  Incident model                     REUSE / MAP

  Deduplication                      REUSE / ASSESS

  Health checks                      REUSE / REFACTOR

  Classification                     REUSE / MAP

  Diagnostics                        REUSE / SANITIZE

  Audit / evidence                   REUSE / MAP

  Shadow mode                        REUSE conceptually

  Soak / QA / security tooling       REUSE or DEFER as qualification
                                     tooling

  Service registry                   MAP/REPLACE with ALICA discovery
                                     where possible

  HTTP probes                        ADAPT as Observer Adapter

  systemd timers                     DEPLOYMENT concern

  Host Executor                      SEPARATE / REFACTOR

  Restart                            DEFER from Doghouse core

  Kill                               KEEP DISABLED

  Cutover manager                    DEFER operational tooling

  Devtask watchdog                   Observer Adapter candidate

  Notifications                      Adapter candidate

  Filesystem persistence             ASSESS

  Canonical Assurance Exchange       BUILD

  ACAP Assurance Adapter             BUILD

  Service Foundation conformance     BUILD
  ---------------------------------------------------------------------

## 5. Authority / Security

Doghouse owns only its assurance domain. Define separately who may
submit signals, configure targets, query incidents/evidence,
acknowledge, annotate and resolve. Correlation must not cross scopes
unless explicitly governed.

Active probes must constrain target registration,
destinations/protocols, redirects, credentials/redaction, polling rate,
timeout, payload and target load. Do not create arbitrary network
access. Docker socket access is privileged host authority.

## 6. Signal Provenance

Every observation preserves enough to distinguish:

``` text
producer
observer
target
scope
observation type/id
occurred_at
received_at
observed_at where relevant
provenance
sanitized evidence
rule_id / rule_version
```

Authorized submission does not make every claimed source/target
trustworthy.

## 7. Public Interface Gap Analysis

Before implementation determine whether frozen ALICA exposes:

``` text
public callable health
event subscription/delivery
operation outcomes
runtime signals without control authority
```

A Service Foundation health declaration alone is not proof of transport.
Missing generic interfaces require a governed Foundation/Catalog gap
proposal; no private Kernel shortcuts.

## 8. Incident / Resolution Semantics

Minimal incident:

``` text
id, type, target, scope, classification,
first/last observed, status, occurrence_count,
evidence refs, rule id/version, acknowledgement, resolution
```

Keep lifecycle minimal: `OPEN`, `ACKNOWLEDGED`, `RESOLVED`.

Distinguish acknowledgement, observed recovery and manual resolution.
Silence, observer failure or missing events never imply recovery.
Recovery is rule-specific.

## 9. Duplicate / Temporal Semantics

Distinguish event redelivery, distinct repeated failure, correlation
into open incident and recurrence after resolution. Define event
idempotency key, correlation key/window and reopen/new-incident policy.

Define event/receipt/observer time, out-of-order/stale handling,
clock-skew tolerance, threshold/recovery hysteresis and restart
continuity. Keep rules explainable; no stream-processing platform.

## 10. Bounded Behavior / Self-Health

Freeze measurable limits for targets, concurrent probes, deadlines,
polling, queues, overload, evidence size, correlation keys/history,
pagination and shutdown/cancellation.

Doghouse self-health exposes store/observer/event-consumption health,
freshness, coverage and dropped/delayed signals. Fleet health is
separate.

## 11. Evidence Policy

Evidence is bounded and sanitized: operational facts, summaries,
references, hashes and rule provenance. No unrestricted log collection,
MemoryV4 content copying or secret-bearing payload retention.

## 12. Canonical Assurance Model / V1→V2 Integrity

Define provider-independent `Observation` and `Incident`; add
Acknowledgement/Annotation/Resolution/EvidenceReference only if
demonstrated.

``` text
ACAP Assurance Capability
!= Canonical Assurance Model
!= Doghouse Store Model
```

Classify AUTHORITATIVE/PORTABLE, DERIVED, EPHEMERAL and EVIDENCE state.

Portable candidates: incident/observation IDs, type, target/scope,
timestamps, lifecycle, acknowledgements, annotations, resolution,
provenance, retained evidence, occurrence history, rule ID/version and
minimal correlation continuation state.

Historical V1 classifications are preserved with rule provenance; V2 may
add reassessment but not silently rewrite history.

Canonical Exchange is not backup.

Required proof:

``` text
isolated source
→ canonical export
→ fresh isolated target
→ import
→ semantic round-trip
```

Validate IDs, timestamps, producer/observer/target, scope, rule
provenance, occurrences, acknowledgements, annotations, resolution,
evidence and required continuation state.

An OPEN incident must continue coherently after import. Future cutover
follows single-writer: V1 authoritative / V2 shadow → switch → V1
read-only / V2 authoritative.

## 13. Service Foundation / Catalog

Doghouse must satisfy Phase-5.0 ServiceManifest, lifecycle mapping,
health, config/secrets, Data Authority, persistence, events,
backup/migration declarations, Structural/Semantic/Executed Conformance,
native qualification and external-consumer workflow.

Do not pre-create broad `doghouse.*`. Select the real slice and use
Catalog Proposal → review → PROPOSED → EXPERIMENTAL. Recovery/control
capabilities are separate from assurance capabilities.

## 14. Initial Vertical Slice

``` text
authorized reference source
→ health/event
→ provenance/scope recorded
→ deterministic rule opens one incident
→ duplicate delivery idempotent
→ distinct matching signal updates incident
→ public consumer queries
→ unauthorized consumer denied
→ acknowledgement recorded
→ rule-specific recovery evidence
→ incident resolves
→ restart
→ incident/dedupe state preserved
```

No Docker, LLM, private runtime interface or remediation authority
required.

# 15. Mandatory Pre-Code Work Packages

**No Doghouse product/runtime code changes until D0--D4 pass.**

### WP0 --- Charter / Safety Freeze

Freeze scope, exclusions, read-only/no-control rule, acceptance matrix,
anti-loop rules and release sequence.

**D0:** charter frozen.

### WP1 --- Source / Runtime Baseline Reconciliation

Read-only: pin repository revisions; identify deployed relationship if
safely observable; inspect startup paths/timers/entrypoints; identify
startup-triggered control; inventory config/state/persistence/deployment
drift; select source baseline.

Outputs: `BASELINE-RECONCILIATION.md`, `SOURCE-BASELINE.md`,
`RUNTIME-REFERENCE.md`.

**Do not start Doghouse.**

**D1:** baseline pinned; dangerous paths documented.

### WP2 --- Feature / Authority Inventory

Statically inspect modules/config/tests/docs. For each feature record
entry point, dependencies, reads/writes/control authority, tests, and
`REUSE/ADAPT/REFACTOR/REPLACE/DEFER`.

**D2:** evidence-backed disposition inventory complete.

### WP3 --- Assurance / Recovery Authority Separation ADR

Map observation, incident, executor, restart, kill, cutover,
notifications, devtask and runtime authority. Define what remains
Doghouse core and what becomes adapter/future recovery authority.

Output: `ASSURANCE-RECOVERY-AUTHORITY-ADR.md`.

**D3:** no implicit service-control authority remains in the target
Doghouse domain.

### WP4 --- Public Health / Event / Runtime Interface Reconciliation

Inventory actual frozen ALICA public surfaces; prove what Doghouse can
consume without private Kernel access or control authority. File
governed gaps where needed.

**D4:** initial signal path is based only on accepted public surfaces.

# 16. Design Work Packages

### WP5 --- Canonical Assurance Model

Map existing incident/dedupe/evidence semantics to portable
Observation/Incident model and data classification.

**D5:** provider-independent canonical model frozen for implementation.

### WP6 --- Incident / Dedup / Temporal Contract

Specify idempotency, correlation, recurrence, recovery, manual
resolution, time semantics, restart continuity and bounded limits.

**D6:** deterministic incident semantics frozen.

### WP7 --- Minimum Assurance Capability Proposal

Derive minimum generic capabilities from the slice; Catalog governance
only.

**D7:** EXPERIMENTAL contract approved.

### WP8 --- Doghouse ServiceManifest

Identity/version, provides/requires, lifecycle mapping,
health/self-health, config/secrets, Data Authority, persistence, events,
backup/migration and justified UI metadata.

**D8:** Structural + Semantic Validation pass before runtime refactor.

# 17. Core Refactor / Build

### WP9 --- Extract/Clarify Doghouse Domain

Separate observations, rules, correlation, incidents, evidence,
acknowledgement/resolution from probes, systemd, executor, notifications
and deployment.

**D9:** domain callable independently of Docker/systemd/control.

### WP10 --- Persistence / Store Port

Assess existing file persistence; define minimal store boundary
preserving incident identity, lifecycle, acknowledgements, evidence and
dedupe/continuity state. Do not introduce a database merely for fashion.

**D10:** restart-safe domain persistence proven.

### WP11 --- Observer Adapters

Adapt only required initial public signal path. Optional HTTP/native
observers remain bounded. Docker observer is not required for core
acceptance.

**D11:** authorized signal enters domain with provenance/scope and no
control authority.

### WP12 --- ACAP Assurance Adapter

Expose approved EXPERIMENTAL capabilities; enforce scopes/grants;
normalize errors; never bypass domain.

**D12:** public external consumer executes the slice.

### WP13 --- Native Service Foundation Conformance

No Docker/Podman/socket. Prove Structural/Semantic/Executed Conformance,
self-health, persistence, shutdown/cleanup and bounded overload/failure
behavior.

**D13:** native conformance passes.

# 18. Portability / Continuity

### WP14 --- Canonical Export

Export portable authoritative assurance state; backup remains separate.

**D14:** deterministic validated export.

### WP15 --- Fresh-Store Import

Import into fresh isolated target.

**D15:** no hidden V1 storage dependency.

### WP16 --- Semantic Round Trip / Active Incident Continuation

Validate portable semantics and prove an OPEN incident plus
dedupe/occurrence continuity survives import and continues coherently.

**D16:** semantic equivalence and continuation pass.

# 19. Qualification

### WP17 --- Failure / Security Matrix

At minimum: malformed/forged signal; unauthorized producer/target;
cross-scope correlation attempt; duplicate delivery; distinct
recurrence; stale/out-of-order event; observer timeout; queue overload;
evidence oversize/redaction; store failure; crash/restart; stale handle;
export/import failure; recovery evidence mismatch; manual-resolution
authorization; probe target rejection.

No production fault injection.

**D17:** deterministic, bounded and authority-preserving.

### WP18 --- External Consumer

Public SDK/Catalog only; no Doghouse internals/store imports.

**D18:** consumer implementation-independent.

### WP19 --- Offline Regression

Run accepted Phase-1--5.1 offline regressions plus safe Doghouse tests.
Do not start historical operational watchdog/control paths or reopen
live authorities.

**D19:** no new regression.

### WP20 --- Purity / Scope Audit

Expected:

``` text
Kernel structural changes               0
ACAP structural changes                 0
silent Service Foundation changes       0
MemoryV4 changes                        0
operational Doghouse changes            0
mandatory Docker dependency             0
LLM dependency                          0
implicit Host Executor authority        0
kill enablement                         0
new generic supervisor/orchestrator     0
```

**D20:** purity passes.

### WP21 --- Documentation / Reproducibility

Publish baseline, disposition, authority ADR, interface mapping,
canonical model, incident contract, capabilities, ServiceManifest,
persistence, adapters, portability, security/failure evidence, limits,
non-claims and exact revisions.

**D21:** independent engineer can reproduce from public source plus
isolated fixtures.

# 20. Acceptance Matrix D0--D21

  -------------------------------------------------------------------------
  ID                               Requirement
  -------------------------------- ----------------------------------------
  D0                               Charter/safety/no-control boundary
                                   frozen

  D1                               Source/runtime baseline reconciled
                                   without starting operational Doghouse

  D2                               Evidence-backed feature/authority
                                   disposition complete

  D3                               Assurance vs recovery/control authority
                                   explicitly separated

  D4                               Public health/event/runtime signal path
                                   proven or governed gaps recorded

  D5                               Canonical Assurance Model
                                   provider-independent

  D6                               Incident/dedup/temporal/recovery
                                   semantics deterministic and bounded

  D7                               Minimum Assurance capability follows
                                   Catalog governance

  D8                               ServiceManifest passes Structural +
                                   Semantic Validation

  D9                               Doghouse domain separated from
                                   deployment/control adapters

  D10                              Persistence preserves required
                                   restart/continuity state

  D11                              Initial observer path preserves
                                   identity/provenance/scope safely

  D12                              ACAP adapter executes approved slice
                                   without domain bypass

  D13                              Native no-container Executed Conformance
                                   passes

  D14                              Canonical export passes

  D15                              Fresh isolated import passes

  D16                              Semantic round-trip + active incident
                                   continuation pass

  D17                              Failure/security matrix
                                   deterministic/bounded

  D18                              External consumer uses
                                   implementation-independent public
                                   contract

  D19                              No new regression; historical
                                   control/live paths remain unexecuted

  D20                              Purity/scope audit passes

  D21                              Public
                                   documentation/evidence/reproducibility
                                   complete
  -------------------------------------------------------------------------

# 21. Anti-Loop / Scope-Control Rules

Every task maps to unfinished D0--D21 with task, criterion, reason,
artifact/test and stop condition. No criterion → no work.

Do NOT: - start operational Doghouse merely for assessment; - execute
restart/kill/cutover drills; - enable kill; - modify production
timers/services; - build Kubernetes/service mesh/APM/SIEM/log
platform; - build generic supervisor/orchestrator/scheduler; - add LLM
anomaly detection to core acceptance; - add autonomous remediation; -
create arbitrary network-probe capability; - broaden Catalog
speculatively; - silently modify frozen foundations; - start
UniUI/AInbA; - continue optional hardening after D0--D21 pass.

# 22. Explicit Non-Claims

Completion does not prove production cutover, Docker observer
qualification, systemd deployment equivalence, autonomous remediation,
generic restart authority, Kubernetes, AI anomaly detection, all future
incident rules, hostile-code isolation, universal backup portability or
Doghouse V2 implementation.

It proves the scoped ALICA-native assurance service, authority
separation, deterministic incident semantics, native Service Foundation
conformance and portable assurance-data continuity.

# 23. Release / Owner Acceptance

When D0--D21 pass:

``` text
freeze implementation
→ offline regressions
→ evidence reconciliation
→ purity audit
→ PHASE5.2-COMPLETION.md + EVIDENCE.md
→ public technical publication
→ immutable technical tag
→ STOP for Project Owner review
```

Recommended technical tag:

`phase5.2-doghouse-v1.0.0`

After separate Owner Acceptance:

`phase5.2-doghouse-v1.0.0-accepted`

Do not begin Phase 5.3 UniUI without explicit authorization.

# 24. Recommended Execution Order

``` text
PRE-CODE
01 Charter
02 Baseline reconciliation
03 Feature/authority inventory
04 Assurance↔Recovery authority ADR
05 Public health/event/runtime interface reconciliation

DESIGN
06 Canonical Assurance Model
07 Incident/dedup/temporal contract
08 Capability proposal
09 ServiceManifest

CORE
10 Doghouse domain extraction
11 Persistence/store boundary
12 Observer adapter
13 ACAP adapter
14 Native conformance

PORTABILITY
15 Canonical export
16 Fresh import
17 Semantic round-trip / active-incident continuation

QUALIFICATION
18 Failure/security matrix
19 External consumer
20 Offline regression
21 Purity audit
22 Documentation/evidence
23 Technical publication/tag
24 STOP
```

# 25. Boundary After Phase 5.2

Phase 5.3 UniUI is not authorized by this plan.

Production adoption/cutover of the new Doghouse path is also not
implicitly authorized by technical Phase-5.2 acceptance. Any operational
migration or recovery-authority enablement requires separate review and
explicit authorization.
