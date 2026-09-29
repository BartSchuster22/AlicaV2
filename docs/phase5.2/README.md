# Phase5.2 Doghouse + ACAP Adapter — frozen candidate for final independent review

Status: IMPLEMENTED / LOCALLY QUALIFIED / EXPERIMENTAL Catalog admission. NOT technically published, NOT Owner Accepted. Final independent review is mandatory before publication/tag. This is not production adoption, hostile-code isolation, recovery authority or Phase5.3 authorization.

## Contract and use

The native assurance domain is services/doghouse/core.mjs; bounded store is store.mjs; public Host/SDK adapter is adapter.mjs; native.mjs validates explicit configuration and composes them. There is no Docker/systemd/daemon/LLM requirement. No operational Doghouse module is imported or executed. This is a new native assurance extraction using historical semantic mapping, NOT a loader for old Doghouse incident directories/JSON/Markdown.

Import `nativeAssurance` from services/doghouse/native.mjs in an operator-owned native composition:

```js
const {domain,service}=nativeAssurance({directory: isolatedOwnedDirectory},{targets,actors});
await service.plugin.activate(publicContext); // accepted operator-owned native resource bridge
// Consumer uses SDK require + get/list/acknowledge, not domain/store imports.
const health=service.selfHealth();            // local service ownership, not public health transport
await service.stop();
```

`publicContext` must be an existing verified Host identity with declared capability/event and exact current Host grants; see services/doghouse/tests/public-fixture.mjs for the actually exercised signed-shell retirement/child-scope topology inherited from Foundation. Native resources are operator-trusted; untrusted signed modules do not receive filesystem imports. Target registrations contain principal/instanceId/generation/scope/target, all matched against trusted broker envelope; actor registrations separately map principal/instanceId/hostScope to exact data scope, local actor and read/acknowledge permissions. Imported identities never populate either map. Config is restart-only; no user-facing registry administration API.

For non-ACAP native use, call domain.open(), supply already-authenticated isolated observations through the operator integration, query via operation() with independently established caller mappings, then domain.close(). Direct native APIs are a trusted composition boundary, NOT an authentication transport. Do not pass arbitrary network payloads as trusted broker envelopes.

Only public operations: get, list, acknowledge. Signal event: io.alica.assurance.signal. Current rule availability-v1/1.0.0: FAIL opens/increments, exact duplicate is idempotent, acknowledged failure remains active, newer RECOVER resolves, subsequent FAIL creates a new incident. No annotation/manual-resolution, active probe, control/restart/kill/executor, notification, scheduler or HTTP endpoint.

## Persistence and portability

Store owns assurance.json, assurance.pending and .writer inside the explicitly supplied isolated directory. Commit groups observations/incidents/dedupe/ack requests, fsyncs temporary bytes, atomically replaces and fsyncs directory. No silent corrupt-store reset, authoritative eviction or power-loss certification. After uncertain post-rename failure the instance fails closed. After crash, ownership is conservatively retained: a proven-dead writer's .writer may be cleared OFFLINE by the isolated operator; automatic stale-lock breaking is deliberately absent. Crash tests explicitly wait for their own child to exit before fixture clearance. No operational recovery was executed.

Export while quiescent with domain.export(); import text only into a fresh empty opened target with domain.import(text). Output is canonical assurance.exchange/v1, richer than the ACAP projection and distinct from store generation. It excludes current mappings/grants/credentials/paths, retains historical provenance and replay/continuation identities, and validates schema and relationships. COMPATIBLE exact rule can continue only after independent current authorization. HISTORICAL_ONLY unavailable-rule evidence remains queryable but cannot be acknowledged or automatically reassessed/continued. Invalid state rejects atomically. Canonical exchange is not backup. Required stopped-store copy/restore was separately exercised; cross-version migration NOT_TESTED, manifest same-schema-only.

## Limits and assurance claims

See immutable approved DESIGN.md plus DESIGN-FREEZE.md. Local budgets: operation/ingestion1000ms, pending ingestion wait250ms, shutdown drain2000ms. Cooperative native I/O only; blocking fsync may exceed budgets, timeout after commit does not prove no write, and incomplete shutdown retains ownership. The tests distinguish a responsive measured shutdown timeout from injected delayed-commit outcomes; no hard-preemption or process-termination bound.

Self-health concerns store, local subscription registration/receipt/freshness, rejected/dropped work and registered-target coverage, never fleet recovery. Public broker delivery is best effort; producer `emit` admission is not a persistence receipt. There is no public broker liveness/health transport or delivery acknowledgement added. Silent producer/subscription loss is bounded only by freshness becoming unknown/stale; no instantaneous external liveness guarantee. Unregistered targets are not fleet coverage. Store/map resources are locally trusted, not a filesystem sandbox.

## Reproduction

Use exact toolchain.lock.json Node24.21.0/npm11.19.0, not default Node22. Install pinned dependencies with `npm ci --ignore-scripts`, then `npm run build`. Inherited build-generated Catalog schema copies stay untracked; frozen packages/Catalog/Foundation are not repaired. Source requires its included docs/phase5.2/design JSON contracts; copy the complete source tree, not just four .mjs files.

Run from repository root:

```sh
unshare -Urn node --experimental-vm-modules --test --test-timeout=30000 services/doghouse/tests/*.test.mjs
node --experimental-vm-modules --test docs/phase5.2/proof/*.test.mjs
node catalog/proposals/assurance-incidents/admit.mjs --admit-experimental
```

First command executes50 tests including independent offline-packed public-only consumer, native store, real public Host event/ACAP, restart, stopped backup, fresh canonical roundtrip/continuation, authority/negative/fault/capacity/deadline cases. The admission command verifies original hash-bound23-test D13 packet before deterministic existing-record readback; it does not manufacture a new independent review or renew any grant. Tests use fresh temporary state; no production inputs. `unshare -Urn` proved available here and denies external network. No docker/systemd invocation or binary-absence certification.

Read EVIDENCE.md for actual logs, regression commands, inherited failures and preparatory failures. Read GATES.md for criterion states. Design review raw JSON and initial CHANGES_REQUIRED review are preserved under review/. Final review request: FINAL-REVIEW-REQUEST.md. Public release/tag/anonymous verification remain pending; eventual authorized technical tag phase5.2-doghouse-v1.0.0 must not be confused with an unauthorized acceptance tag.
