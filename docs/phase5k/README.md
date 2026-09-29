# Phase 5.K — Hermes Kanban / ACAP

Technical release candidate; EXPERIMENTAL, isolated nonlaunching qualification only. NOT Owner Acceptance, STABLE admission, production adoption or Phase5.3 authorization.

## Delivered boundary
`adapters/hermes-kanban/index.mjs` binds the pinned Hermes normal authenticated REST/WS server through the public ALICA SDK. Hermes alone owns tasks/runs/events; no canonical replacement, database mirror, SQL, private router or dispatcher integration. Capability `acap://alica.io/orchestration/kanban@1` provides board/list/get/create/update/comment/events. Control/dependencies/assignment/transitions/provider/model/workspace knobs remain deferred.

Catalog and service: `catalog/proposals/hermes-kanban/catalog.yaml`, `snapshot.json`, `service.json`. Catalog release version0.5.20 is an artifact version, NOT Phase5.3. Design-time development snapshot is not admission: actual admission followed executed19/19 conformance, then the actual experimental snapshot/manifest were validated and consumed in another19/19 run. Identical snapshot digest is expected: the design generator modeled the prospective experimental snapshot but conferred no governance admission. `admission.json` records the real transition.

## Trust and credentials
Native trusted operator composition, not an untrusted plugin sandbox. Frozen Foundation supports ONLY `synthetic-test` secret reference for this fixture; manifest declares it, public Host issues a read grant and supplies a fresh disposable token via `syntheticSecret`. No production token is read, and production credential integration is UNSUPPORTED/unqualified. Exact caller principal+instance+scope mapping is trusted operator state; payload identity is rejected. Consumer has only public SDK imports and no adapter/Kernel/testkit resolution.

## Guarantees and non-guarantees
Read bounds:256 tasks,256KiB REST body,4 active operations. Oversize fails, never truncates into apparent completeness. Native WS buffers its message before the256KiB application check; this is not a hostile-peer memory quota guarantee. Selected pinned loopback backend only. Events are bounded unary observations over real WS, max32 per call, validated upstream batches<=200. Cursor advances over inspected prefix only. Replays duplicate; continuity ALWAYS UNKNOWN, including future/stale cursors. Reconcile through get/list; do not infer a complete log or transactional snapshot.

Create explicitly requests unassigned triage, empty dependencies and no execution configuration. Title/body update requires observed unassigned triage. Comments are informational in this isolated runtime. No operational queue adoption permitted. Request keys offer observed sequential best-effort replay, not cross-writer exactly-once. Updates are last-writer-wins, no CAS. Unknown writes are never automatically retried. APPLIED create/update carries `task:[currentTask]`; APPLIED comment and UNKNOWN carry `task:[]`. UNKNOWN create retains requestKey; others use empty string. Broker deadline/cancel/revocation after possible dispatch does NOT prove rollback: reconcile without retry. Mapping and secret authority are checked before I/O and before result delivery.

Health is initially UNAVAILABLE until successful backend observation, then READY; backend errors DEGRADED, disposal UNAVAILABLE. Dispose cancels owned calls/WS waiting, not already committed backend work. Task state survives adapter and real backend restart. No adapter-owned durable business store. Backup/migrations of external Hermes data are not claimed by this release.

## Reading order
DESIGN.md and DESIGN-FREEZE.json; GATES.md; EVIDENCE.md; REPRODUCE.md; original plan and architecture review. Design commit4d0d0361 preceded implementation/admission commit61ebcdbb. Prior failures are retained. Final independent review and publication receipts are separate gates, not implied by this README.
