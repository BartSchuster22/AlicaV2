# Phase5.2 Doghouse + ACAP Adapter — independently cleared; publication blocked

LATEST: same-reviewer ACCEPT_FOR_TECHNICAL_PUBLICATION_WITH_CAVEATS for47e88349; R1/R2 CLOSED. [Genuine closure](review/final-closure.md) and referenced raw logs archived verbatim. [Release disposition](PHASE5.2-COMPLETION.md): D21 is blocked by local repository write authentication, not review. Nothing published/tagged; no Owner Acceptance. Earlier status below is historical and superseded only as stated.

Status: R1/R2 CORRECTED AND RE-EVIDENCED; SAME-REVIEWER CLOSURE PENDING, publication BLOCKED. See QUALIFICATION-SUPPLEMENT-R1-R2.md; original independent BLOCKED review is preserved. Historical status: IMPLEMENTED / LOCALLY QUALIFIED / EXPERIMENTAL Catalog admission. NOT technically published, NOT Owner Accepted. Final independent review is mandatory before publication/tag. This is not production adoption, hostile-code isolation, recovery authority or Phase5.3 authorization.

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

For R1's mandatory unavailable-container prerequisite, run `sudo -n /usr/bin/python3 -I services/doghouse/tests/no-container.py`: disposable allowlisted filesystem, new mount/network/PID namespaces, chroot and unprivileged Node, inside-fixture absence checks, then61 core/public/continuity tests. No production sockets copied or probed. The network-only command below is NOT that prerequisite proof. Revalidate frozen admission using its original source revision; do not rerun original source-hash receipt admission against corrected runtime bytes.

Run from repository root:

```sh
unshare -Urn node --experimental-vm-modules --test --test-timeout=30000 services/doghouse/tests/*.test.mjs
node --experimental-vm-modules --test docs/phase5.2/proof/*.test.mjs
node docs/phase5.2/verify.mjs
```

First command selects62 tests (original50 plus12 R2 cases); current evidence executes61 core/public tests in the stronger chroot and the independent offline-packed consumer separately (1/1). The verifier checks the current supplementary hashes, including original immutable receipts. No admission reissue or grant renewal. All tests use fresh temporary state; no production inputs. Network-only unshare is not filesystem isolation; R1's separate chroot command above supplies the missing unavailable-container qualification.

Read EVIDENCE.md for actual logs, regression commands, inherited failures and preparatory failures. Read GATES.md for criterion states. Design review raw JSON and initial CHANGES_REQUIRED review are preserved under review/. Final review request: FINAL-REVIEW-REQUEST.md. Public release/tag/anonymous verification remain pending; eventual authorized technical tag phase5.2-doghouse-v1.0.0 must not be confused with an unauthorized acceptance tag.
