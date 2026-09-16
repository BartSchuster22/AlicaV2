# ALICA V2 — Kernel, ACAP & SDK — Step 1 Building Plan

**Fresh-VM, from-scratch implementation plan — Kernel, ACAP & SDK only**  
**Date:** 16 September 2026

> **Scope boundary:** This plan covers strategic Step 1 only. Step 2 is Hermes harness integration. Step 3 is the rebuild/adaptation of MemoryV4, Doghouse, UniUI and other services as ALICA V2 plugins.

> **Lean-kernel rule:** If a function can live above the Kernel without compromising trust, lifecycle integrity, scope isolation or capability resolution, it does not belong in the Kernel. Complexity is introduced only where it creates a clear functional or security benefit.

## Executive Summary

This plan rebuilds ALICA V2 **from scratch** while using ALICA DSH 1.0 code, release artifacts and documentation as reference material, behavioral evidence and migration input.

The migration is deliberately substrate-first:

1. freeze and inventory V1;
2. specify Kernel and ACAP;
3. implement the Kernel;
4. implement SDK and conformance;
5. prove plugin/capability composition with synthetic providers;
6. prove standalone Cell packaging and trust;
7. only then adapt or migrate V1 services;
8. run V1 and V2 in controlled coexistence;
9. cut over by capability/domain;
10. retire V1 only after recovery and rollback criteria are satisfied.

The primary rule is: **do not port services into V2 before the V2 substrate is independently valid.**

## 1. Program Objectives

- Deliver a clean V2 codebase with no architectural dependency on V1 internals.
- Preserve V1 operational guarantees that remain valuable.
- Convert implementation-specific integration into ACAP contracts.
- Avoid a “big rewrite plus big migration” event by separating substrate construction from service migration.
- Make every migration reversible until final cutover.
- Use adapters at the V1/V2 boundary rather than contaminating the V2 Kernel with compatibility logic.

## 2. Workstreams

| Workstream | Responsibility |
|---|---|
| WS-A Architecture & Specs | Kernel, ACAP, manifests, scopes, lifecycle, trust specifications |
| WS-B Kernel Runtime | Registry, broker, resolver, lifecycle, scopes, events, policy, trust |
| WS-C SDK & Tooling | SDK packages, generators, manifests, testkit, conformance |
| WS-D Transport | In-process, IPC/container, later remote |
| WS-E Cell & Supply Chain | packaging, signatures, offline bundle, SBOM/provenance, acceptance |
| WS-F V1 Analysis | behavioral inventory, data authorities, contracts, migration facts |
| WS-G Adapters | V1-to-ACAP and ACAP-to-V1 bridges |
| WS-H Service Migration | post-substrate migration of higher-level services |
| WS-I QA/Security | negative tests, threat model, fuzzing, lifecycle and compatibility |
| WS-J Operations | install, upgrade, backup, restore, observability and rollback |

## 3. Phase 0 — Freeze the V1 Reference Baseline

### Deliverables

- Pin the exact V1 release/commit set used as migration reference.
- Archive D6 manifest, release docs, acceptance matrix, schemas and operator/security/privacy docs.
- Produce a component/data-authority inventory.
- Record current contracts, dependencies, persistent data and backup order.
- Mark V1 code as **reference**, not a V2 dependency.

### Acceptance Gate G0

- Every V1 component has an owner, current contract, data authority, persistence class and external dependency entry.
- The exact baseline can be rebuilt or retrieved reproducibly.
- No V2 package imports V1 source.

## 4. Phase 1 — Normative Architecture Specifications

Write the normative specs before implementing production Kernel code.

### Required specifications

- `ALICA-KERNEL-API-v1`
- `ACAP-CORE-v1`
- `ACAP-ERRORS-v1`
- `ACAP-EVENTS-v1`
- `ACAP-SCOPES-v1`
- `ACAP-SECURITY-v1`
- `ACAP-TRANSPORT-INPROC-v1`
- `ALICA-PLUGIN-MANIFEST-v1`
- `ALICA-BUNDLE-v1`
- `ALICA-PROFILE-v1`
- `ALICA-TRUST-POLICY-v1`
- `ALICA-SDK-CONFORMANCE-v1`

### Required design reviews

1. Capability identity/versioning review.
2. Scope and authority review.
3. Lifecycle/reversibility review.
4. Security/grant review.
5. Transport-neutrality review.
6. Offline/Cell-independence review.

### Gate G1

No production service migration begins until all normative V1 substrate specs have approved schemas and executable conformance examples.

## 5. Phase 2 — Repository and Engineering Foundation

Create a new repository or clearly isolated V2 root.

```text
alica-v2/
  specs/
  packages/kernel/
  packages/acap-types/
  packages/plugin-sdk/
  packages/provider-sdk/
  packages/consumer-sdk/
  packages/manifest/
  packages/testkit/
  packages/conformance/
  packages/transports/
  cli/
  examples/
  tests/
  docs/
```

Establish CI for formatting, type checking, unit tests, contract tests, dependency/license checks, SBOM generation and signed release candidates.

### Gate G2

A clean checkout can build and test the empty substrate without V1 source, databases or application services.

## 6. Phase 3 — Kernel Minimum Viable Runtime

Implement only the minimum trusted core:

1. bootstrap and Cell identity;
2. canonical manifest parser;
3. plugin loader;
4. capability registry;
5. deterministic dependency resolver;
6. scope manager;
7. lifecycle manager;
8. event fabric;
9. policy/grant engine;
10. trust verifier;
11. secret-reference broker;
12. audit root;
13. in-process transport.

Use a synthetic `echo` capability as the only functional demonstration.

### Gate G3

- two different echo providers satisfy one consumer;
- provider selection is deterministic and inspectable;
- missing capability blocks activation;
- unloading removes all owned effects;
- scope teardown removes child registrations;
- denied grants fail closed;
- incompatible versions fail before ACTIVE.

## 7. Phase 4 — ACAP Core and Contract Toolchain

Implement descriptor schemas, version negotiation, feature negotiation, error normalization, deadlines, cancellation, idempotency metadata, event envelopes and contract digests.

Build `alicac` commands:

```text
alicac capability init
alicac capability validate
alicac capability generate-client
alicac capability generate-provider
alicac plugin validate
alicac bundle validate
alicac profile validate
alicac conformance run
```

### Gate G4

An independently written provider can pass ACAP conformance without importing Kernel internals.

## 8. Phase 5 — SDK and Developer Experience

Implement:

- `definePlugin()`;
- `ctx.provide()`;
- `ctx.require()`;
- `ctx.optional()`;
- owned effects/disposers;
- typed event helpers;
- scoped secret access;
- structured logging;
- mock Kernel/test context;
- failure injection;
- generated clients/providers.

Create an external-developer tutorial that starts from an empty directory and builds a provider/consumer without knowledge of Kernel internals.

### Gate G5

A developer can build, test and package a plugin using only public SDK/spec surfaces.

## 9. Phase 6 — IPC/Container Transport and Location Transparency

Implement the second transport after in-process semantics are stable.

Requirements:

- authenticated provider identity;
- schema/version handshake;
- deadlines and cancellation across boundary;
- backpressure for streaming;
- health and disconnect semantics;
- normalized ACAP errors;
- no authority widening;
- deterministic reconnect policy.

### Gate G6

The same consumer test suite runs unchanged against an in-process provider and a container/IPC provider.

## 10. Phase 7 — Trust, Packaging and Standalone Cell

Translate proven V1 release properties into V2 packaging:

- immutable package digests;
- signed manifests;
- SBOM and provenance;
- contract descriptor digests;
- checksum-bound offline bundle;
- local secret references;
- clean-host online install;
- disconnected offline install;
- reproducible profile resolution;
- no central runtime dependency for standalone profile.

Create a minimal V2 profile containing Kernel + SDK runtime + synthetic providers only.

### Gate G7

Two clean hosts pass the same acceptance matrix, one online and one disconnected, with identical accepted profile bytes and no central runtime dependency.

## 11. Phase 8 — V1 Behavioral Decomposition

Only now begin detailed service migration design.

For each V1 component answer:

- What behavior is externally observable?
- Which behavior is product-specific?
- Which behavior is a reusable capability?
- What data does it own?
- What events does it produce/consume?
- What permissions/secrets does it require?
- Which operations need streaming/cancellation/idempotency?
- Which scopes apply?
- Can it first be wrapped by an adapter?
- Does it need a rewrite, reuse, split or retirement?

Do **not** create an ACAP capability merely because a V1 HTTP endpoint exists.

### Gate G8

Each migration candidate has an approved capability decomposition and a data migration/rollback plan.

## 12. Phase 9 — Compatibility Adapter Layer

Build adapters outside the Kernel. The preferred migration pattern is:

```text
V2 Consumer -> ACAP -> V1 Adapter -> existing V1 service
```

or, where V1 must consume a new provider:

```text
V1 Consumer -> compatibility shim -> ACAP -> V2 Provider
```

Adapter rules:

- adapters are temporary, versioned and observable;
- adapters cannot receive privileged Kernel access merely because they bridge V1;
- every adapter has a removal criterion;
- compatibility code never enters ACAP Core or Kernel packages;
- adapters preserve V1 data authority until an explicit data migration occurs.

### Gate G9

At least one non-trivial V1 service is consumed through ACAP with zero direct V1 dependency in the V2 consumer.

## 13. Phase 10 — Recommended Migration Order

The order below is based on dependency risk, not product importance.

### Wave A — Infrastructure-facing adapters

- identity adapter around Keycloak/OIDC;
- structured logging/health;
- generic storage adapter only where justified;
- edge/ingress remains Cell infrastructure rather than Kernel logic.

### Wave B — Memory boundary

Wrap MemoryV4 behind implementation-neutral ACAP contracts before considering a rewrite. Validate that another mock/simple memory provider can satisfy the same contracts. This is the strongest test that the capability was not accidentally designed as “MemoryV4 over ACAP”.

### Wave C — Agent runtime boundary

Wrap the existing Hermes-based runtime as an ACAP provider/consumer. Separate:

- agent runtime;
- model inference;
- tool registry/execution;
- sessions;
- workspace/files;
- prompts/policy;
- agent loop.

Do not encode Hermes-specific concepts in the Kernel. Hermes becomes an adapter/provider or later a profile composition.

### Wave D — Herman

Express Herman through the same generic capability families. Differences belong in profile, loop, tool, permission and policy composition rather than a separate Kernel API.

### Wave E — Doghouse

Map observations, health and incidents to observability/assurance capabilities. Keep detection logic above the Kernel.

### Wave F — UniUI / Unify

Decompose Unify responsibilities rather than porting `unify-api/v1` as one monolithic V2 capability. UI becomes a consumer/composer of application capabilities.

### Wave G — AInbA

Define the V2 application/bundle model only after the substrate and several migrated providers prove the composition model. AInbA should become a bundle/profile of capabilities, plugins, UI and policy rather than a privileged special case.

## 14. Current V1 Component Migration Matrix

| V1 component | First V2 action | Long-term target | Data migration |
|---|---|---|---|
| Caddy | keep external | Cell infrastructure/profile | config only |
| UniUI | keep V1 during substrate build | UI plugin/bundle consumer | normally stateless |
| Unify Core | analyze responsibilities | split into capability providers/consumers | PostgreSQL authority-specific |
| Keycloak | OIDC adapter | external identity provider | preserve realm/users until explicit migration |
| PostgreSQL | keep as infrastructure | implementation behind storage/domain providers | native DB migration/backup |
| Alica Runtime | Hermes adapter | generic agent profile/runtime plugins | preserve native state until migrated |
| Herman Runtime | adapter after generic agent contracts | profile on common runtime substrate | preserve Herman state |
| MemoryV4 | ACAP adapter first | replaceable memory provider | dedicated memory migration/backup |
| AInbA Anchor | defer | application bundle/profile | AInbA-owned data |
| Doghouse Node | defer then observability adapter | assurance/observability bundle | Doghouse-owned state |
| alicactl | maintain V1 for V1 Cell; build V2 CLI separately | V2 Cell lifecycle CLI/admin | lifecycle state separate |
| operations-jobs | parallel V2 operations implementation | V2 Cell operations | job/audit state as required |

## 15. Data Migration Strategy

Data migration is authority-by-authority, never “copy the whole Cell”.

For each authority:

1. freeze schema version;
2. take verified backup;
3. export to a documented interchange format where possible;
4. transform using deterministic versioned migration code;
5. import into V2 authority;
6. validate counts, checksums and semantic invariants;
7. run shadow reads where feasible;
8. keep source read-only during validation;
9. cut write authority only after acceptance;
10. retain rollback artifact until the migration window closes.

The V1 D6 backup ordering (identity/unify PostgreSQL, MemoryV4, Alica state, Herman state, AInbA, Doghouse, lifecycle) should be treated as migration evidence, not automatically reused as the V2 restore model.

## 16. Coexistence and Shadow Operation

During migration, V1 and V2 can coexist at explicit boundaries.

Allowed patterns:

- V2 reads from V1 through an adapter;
- V2 mirrors selected events for comparison;
- V2 performs shadow calculations with results excluded from production decisions;
- dual-read validation compares semantics;
- controlled dual-write only where idempotency and conflict rules are formally defined.

Avoid uncontrolled bidirectional synchronization. Each data domain must have exactly one authoritative writer at any moment.

## 17. Cutover Strategy

Cut over by capability/domain rather than by entire product.

For a capability:

1. V1 adapter is primary; V2 native provider is shadow.
2. Compare behavior and performance.
3. V2 provider becomes canary for selected scopes.
4. Expand canary.
5. V2 becomes primary; V1 adapter remains fallback.
6. Freeze fallback writes.
7. Remove adapter after stability window and backup validation.

A cutover is accepted only when rollback has been tested, not merely documented.

## 18. Rollback and Forward Recovery

Every migration wave must define:

- last reversible state;
- authoritative data owner;
- rollback trigger;
- maximum acceptable divergence;
- backup required for rollback;
- schema downgrade feasibility;
- forward-recovery path if downgrade is unsafe.

Kernel/ACAP package upgrades should prefer forward-compatible rolling replacement over destructive schema mutation.

## 19. Security Test Program

Required negative tests include:

- unsigned/tampered plugin;
- valid signature from untrusted publisher;
- contract digest mismatch;
- undeclared secret request;
- scope escape attempt;
- capability operation not present in grant;
- provider impersonation;
- stale/expired grant;
- malicious dependency cycle;
- event subscription outside visibility scope;
- remote transport disconnect during stream;
- unload with outstanding calls;
- plugin attempting to retain a handle after scope destruction;
- profile attempting to override immutable Kernel trust policy.

## 20. Performance and Reliability Targets

Before service migration, establish budgets for:

- Kernel cold boot;
- plugin activation;
- local capability-call overhead;
- IPC/container call overhead;
- event dispatch;
- scope creation/destruction;
- resolver performance with large provider catalogs;
- memory footprint of minimal profile;
- failure detection and quiesce time.

Performance optimizations must not bypass policy, trust or lifecycle ownership.

## 21. Documentation Deliverables

Maintain:

- architecture decision records;
- normative ACAP specs;
- SDK API docs;
- plugin author guide;
- provider/consumer tutorials;
- security model and threat model;
- Cell operator guide;
- offline installation guide;
- migration runbooks per V1 authority;
- compatibility matrix;
- conformance test catalog.

## 22. Definition of Done for ALICA V2 Substrate

The substrate is complete when it can demonstrate all of the following without migrated production services:

- verified standalone Cell boot;
- deterministic profile resolution;
- signed plugin load and rejection paths;
- two interchangeable providers;
- scopes and grants;
- typed events;
- lifecycle with complete cleanup;
- in-process and IPC/container transport equivalence;
- SDK-generated provider/consumer;
- conformance suite;
- offline install and recovery;
- auditable Kernel state.

Only after this point should “ALICA V2 service migration” be considered the main program.

## 23. Definition of Done for 1.0 → 2.0 Migration

Migration is complete when:

- all retained V1 business capabilities have native V2 providers or intentionally supported external adapters;
- no V2 component depends on V1 implementation APIs;
- all authoritative data has an accepted V2 owner;
- V1 adapters have been removed or explicitly classified as long-term external integrations;
- standalone V2 acceptance passes online and offline;
- backup/restore and disaster recovery pass;
- upgrade and rollback/forward-recovery procedures are tested;
- V1 runtime can be shut down without loss of required ALICA functionality.

## 24. Indicative Milestone Sequence

| Milestone | Result |
|---|---|
| M0 | V1 reference frozen and inventoried |
| M1 | Kernel/ACAP normative specification set |
| M2 | Minimal Kernel + in-process ACAP |
| M3 | SDK + conformance + synthetic interchangeable providers |
| M4 | IPC/container transport |
| M5 | Signed/offline standalone V2 Cell |
| M6 | V1 decomposition and adapter framework |
| M7 | Memory boundary migrated |
| M8 | Agent runtime/Hermes boundary migrated |
| M9 | Herman and observability boundaries migrated |
| M10 | Unify/UI/AInbA migrated or redesigned |
| M11 | V2 primary, V1 fallback only |
| M12 | V1 retirement and V2 independent acceptance |

Dates should be assigned only after M1 has frozen the scope of the normative substrate.

## 25. Immediate Next Actions

1. Create the clean `alica-v2` repository.
2. Import this concept and plan as architecture documents.
3. Pin the exact ALICA DSH 1.0/D6 reference baseline.
4. Write `ACAP-CORE-v1` and `ALICA-KERNEL-API-v1` first.
5. Define JSON Schema (or equivalent) for Capability Descriptor and PluginManifest v1.
6. Build an in-memory Kernel prototype using only an Echo capability.
7. Implement two independent Echo providers and prove substitution.
8. Add scope/grant negative tests.
9. Add lifecycle disposal tests.
10. Only after those pass, begin IPC/container transport.

## References

- ALICA Community DSH: https://github.com/BartSchuster22/Alica-DSH
- D6 release manifest: https://raw.githubusercontent.com/BartSchuster22/Alica-DSH/main/release/d6-candidate/manifest.json
- D6 Independent Acceptance: https://github.com/BartSchuster22/Alica-DSH/blob/main/docs/D6-INDEPENDENT-ACCEPTANCE.md
- ALICA Operator Guide: https://github.com/BartSchuster22/Alica-DSH/blob/main/docs/OPERATOR.md
- ALICA Data and Privacy: https://github.com/BartSchuster22/Alica-DSH/blob/main/docs/DATA-PRIVACY.md
- DeepSeek Harness: https://github.com/deepseek-ai/deepseek-harness
- Cordis Primer: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md
