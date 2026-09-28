# Phase 5.0 Service Foundation charter

Status: authorized implementation, not qualified, published or owner accepted.

Governing bytes: GOVERNING-PLAN-REV1.1.md, SHA256
5db75e8a114f17baa6155e191251431be683a887d9dc9aef2dd94fca8c704ae1.
The entire uploaded plan was read. R1–R13 and revised S0–S20 override retained
v1.0. The adopted earlier assessment was assistant-authored, not owner-authored.
Explicit owner authorization permits Phase5.0 implementation and technical delivery only.

Base: 396f4e1f17e0818d0905ddb888170dc784ad85bb, owner-accepted Phase4.
Worktree: /home/alica-dev/AlicaV2-phase50; branch phase5.0/service-foundation.
Pinned native toolchain: Node24.21.0/npm11.19.0 (both observed).

## Scope and allowed paths

Additive service-foundation/ standard, schemas, standalone tooling, references,
external-author qualification and tests; docs/phase5.0/ evidence and reproduction;
minimal README.md pointer. Necessary neutral Catalog proposals may be added only
under catalog/proposals/ with existing governance and independent parent review.
No baseline snapshot edits, blanket staging, registry publication or frozen SDK,
Kernel, ACAP, Hermes or Decision changes.

Exactly one binding: existing public Host inproc plugin binding demonstrated by
examples/sdk-tutorial/operator-run.mjs. Public operator export bootstrap from
@alica/kernel is permitted; internal Kernel imports are not. Public author surface
@alica/plugin-sdk definePlugin/context APIs; public contract and Catalog exports.
No Decision-specific handoff is generalized or asserted to be a generic public API.
Precise primitive mapping is recorded in INVENTORY.md.

Both native stateless and tiny stateful neutral record references are mandatory.
Structural, semantic and executed conformance remain independent. Declarations
never grant authority. Catalog pins, identity/version and dependency correspondence
are checked substantively. Runtime permission evidence must use the actual Host.
Backup and migration declarations can be VALID while execution is NOT TESTED.
Health is service-owned and independent of Host lifecycle. No lifecycle engine.

## Explicit exclusions and retained limits

No Phase5.1, MemoryV4, Doghouse, UniUI or AInbA implementation. No supervisor,
secret resolver, scheduler, registry, router, metrics/observability backend,
backup/migration engine, UI renderer or deployment manager. No container startup,
image download or shared-infrastructure alteration. Native isolated qualification
must exclude executables, sockets and remote container endpoints, not only PATH.
No hostile-code confinement or multi-deployment equivalence claim.

Phase4 TypeSafe/Jev authority permanently CLOSED: 6/6 consumed, 0 remaining.
Phase3 protected authority remains closed. No provider discovery, evaluation,
diagnostic, replay, retry, credentials/actual ledger access, initialization/reset
or protected runtime access. Regression is offline/mock/fixture only. Inherited
accepted @alica/catalog dependency-check FAIL remains FAIL, not repaired.
Phase4 experimental, trustVerified=false and local signed-shell limits unchanged.

## Execution discipline and stop

Each task states criterion, why, artifact/test and stop condition. Product criteria
control completion; optional future work is deferred. No subworkers or cron.
Worker uses inherited exclusive lease without reacquisition or manipulation.
Parent performs independent Catalog/final substantive reviews and continuity sync.
Worker checkpoints are UNSYNCED; no MemoryV4 recall/sync by worker.

Sequence: implement and exercise small slices, independent technical review,
exact-path commits/public source reproduction, immutable technical tag
phase5.0-service-foundation-v1.0.0, anonymous exact ref/tag/raw verification,
separate README-only main discoverability update, then STOP for owner review.
No accepted tag, self-owner-acceptance or Phase5.1 without new authorization.
Pending tool approval is a real gate and must not be bypassed.
