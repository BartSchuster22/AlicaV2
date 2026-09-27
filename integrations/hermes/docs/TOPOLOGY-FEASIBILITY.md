# H6 topology assessment — candidate, NOT accepted ADR

Historical assessment; superseded by the executed evidence and selected candidate in ARCHITECTURE.md. All four original probes and the public bridge now PASS. No broad public-surface insufficiency claim.

Task: test the smallest public ALICA route to a pinned Python agent without frozen-foundation edits. Stop: a verified supported topology, or reproducible public-surface constraint and minimal alternatives. No adapter architecture approval or H6 PASS is claimed yet.

## Observed public boundary

Frozen Phase2 736b37d03c82ca057e7a397644037ef5d1bed991:

- `@alica/kernel` exports `bootstrap`/`Host` from its public root. `Host.context(id)` returns an authenticated context only for a live instance (index.ts:1291+). Operator use is real, not a testkit-only feature; the shipped separate operator example uses it.
- `@alica/plugin-sdk.createPluginContext` wraps a supplied authentic context. It does not mint authority or add process/network access. `effect` owns cleanup, not arbitrary execution permission.
- Host activation uses inventory-verified modules and fixed public imports (index.ts:1182+; package-loader.ts). Static node:child_process imports are unsupported; dynamic imports are rejected. This trusted JS loader is NOT an OS hostile-code sandbox. Do not exploit ambient globals to escape its supported interface.
- A declared provider must stage its registration during activation (index.ts:1267+). Active context.provide rejects a duplicate same-instance/scope/descriptor registration (1450–1468). There is no documented handler-replacement injection hook.
- Child context.provide is allowed, but visible duplicate provider identity/version is rejected by resolution (742–799). A child scope is not a supported transparent replacement for the root registration.
- Existing HostIPC internally chooses process.execPath and packages/kernel/dist/g6/worker-entry.js plus fixed read paths (host-adapter.ts:133–137). No public Python executable/factory option was found. A container does not by itself create that missing public connection.
- Existing public events (`on`/`emit`, signed event declarations and event grants) and effects ARE supported. They must be assessed before claiming that ALL public solutions are insufficient.
- Public SDK docs state production secret adapter is synthetic-test only. Do not feed a real model credential through that test facility. The owner safe-reference/operator-configuration decision is separate and still open.

## Actual evidence / limitation

`npm ci --ignore-scripts --no-audit --no-fund` and `npm run build` succeeded on authoritative DEV using Node 24.21.0. `npm test`: 170 passed; `npm run test:catalog`: 15 passed. Existing tests actually cover rejected node:fs/private imports, duplicate visible provider conflict, staged visibility, scope authority, owned cleanup and revoked handles.

New focused `integrations/hermes/tests/topology.test.mjs` has four explicit public-Host probes (child_process import; deferred registration; active replacement; duplicate child registration with explicit grants). It has run on DEV, including reruns after fixture modifications: all four pass. No broad insufficiency claim.

## Bounded route comparison / next experiment

1. Direct Python spawn inside verified plugin: unsupported import route, reject.
2. Native Python on existing HostIPC: no supported executable option found; do not patch private transport.
3. Operator replaces handler through active context: constrained by registration/activation invariants above; focused reproduction passed.
4. Existing public event bridge: a signed adapter plugin provides execute and waits on bounded request/reply events; a separately trusted operator component subscribes through a real granted context, owns the Python process, and sends a normalized response. This route is now selected as the minimal implemented candidate; see ARCHITECTURE.md and lifecycle.test.mjs. Qualification must cover correlation isolation, exact caller metadata from OperationContext, event grants, cancellation/deadline, bounded queue/single in-flight request, cleanup/unload and late-result rejection. No credentials in events. Keep glue adapter-local, not a generic transport framework. Confirm operator authority is explicit and remains no broader than fixed process/fixture/model policy.
5. Only if those public routes fail: request owner approval for a minimal operator-owned activation/provider factory with authenticated context and tracked cleanup, or an explicitly approved external endpoint extension. Document reproducible failure first. No Kernel patch is authorized now.

Process cancellation can terminate local work after bounded grace; it cannot prove provider-side cancellation or refunded billing. No automatic retry after uncertain execution. No topology change authorizes gateway/services or a paid model call.
