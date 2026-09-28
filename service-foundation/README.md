# Service Foundation v1 — implementation WIP

Additive standard/tooling, not a runtime service. Governing Rev1.1 and acceptance
ledger live in docs/phase5.0. Source has not yet received pinned DEV qualification.

## First substantive slice

schemas/service-manifest-v1.schema.json is a closed small JSON Schema generated
by tooling/schema-source.mjs. tooling/validate.mjs returns independent STRUCTURAL,
SEMANTIC and EXECUTED outcomes. validate never claims executed behavior. Catalog
snapshots are consumed through the existing public Catalog API and an independently
provided digest pin, not a new resolver. trustVerified remains false.

Service id/version are independent of capability URI/descriptor identity/version
and Catalog version. Required vs optional dependencies are checked against supplied
frozen definitions, then actual runtime availability remains an existing Host task.
Manifest metadata is not a grant. Config schemas are local, no external $ref resolver.
Optional UI is text/identity/permission metadata only; it cannot grant or execute.

Backup and migration declaration VALID is distinct from execution NOT_TESTED.
No metrics backend, supervisor, secret resolver or lifecycle engine exists here.
No Phase5.1 implementation.

## Existing binding and honest boundaries

One binding: public-host-inproc-v1. Existing public Host bootstrap/discover,
activate/context, grant, require/call, dispose/shutdown primitives are reused.
Plugin definitions use public SDK definePlugin, effect, provide and require.
Health is owned by each reference and changes independently from the Host's actual
lifecycle. Restart creates a fresh instance; it does not revive stale handles.

The accepted SDK KernelContext has no filesystem API. Accepted package-loader
permits only public SDK/contracts/types or inventoried local modules; it rejects
Node builtin imports. The tiny file resource therefore remains explicitly operator-owned.
The native attachment test uses a declared signed bootstrap shell. A granted
public call disposes that temporary root registration and fails UNAVAILABLE (never
reports a successful business operation). Only AFTER verifying root registration
removal does the operator register native handlers through existing public
context.createScope()/provide in an owned child scope. This ordering is required:
the frozen Host rejects duplicate visible provider identities with CONFLICT.
Consumers are discovered in the child scope with explicit root and child grants.
Host activation requires declared providers to register; a no-op shell with
provides would fail. Shell ACTIVE is not native service READY. The35-test candidate
has passed this topology both on pinned DEV and in isolated native qualification;
external installed-author proof also passed for slice5 (raw native-slice5.log).
The expanded admitted-snapshot/example candidate still requires execution, so
this is not phase completion.
The resource is operator-owned native code, not a new public storage API.
Its bytes and
filesystem authority are NOT granted by ServiceManifest or sandboxed by signed
shell packaging. This topology must be proved with actual public Host tests; the
current SDK fixture tests cannot substitute. No hostile-code confinement claim.

Existing context.secret(ref) is grant-checked. The accepted Host implementation
supports only synthetic-test with its explicit test option, not production secret
resolution. This binding intentionally restricts secret declarations to that ref.
No secret value belongs in a manifest or diagnostic. Missing ref/grant behavior
still requires actual Host qualification, not shape-only testing.

## References and tests

reference/services.mjs: neutral stateless echo, tiny stateful records, unchanged
consumer. reference/file-records.mjs: single-owner bounded native file resource,
serialized writes,32-key limit, explicit normal restart persistence. No database,
backup, migration or generic storage subsystem. Records is a NEW Catalog proposal
under catalog/proposals/service-records, NOT admitted, no release snapshot created.
Do not publish it as conformant before parent review/admission and qualification.

Tests separate structural/semantic assertions and SDK fixture execution. Neither
is no-container/public Host qualification. Remaining acceptance includes actual
Host scope/grant/secret/failure matrix, separately installed author, native isolated
environment excluding executable/socket/remote container access, all offline
regression and committed-source public reproduction. Do not label WIP complete.

Preparation commands on DEV after source transfer and scoped ownership correction:
  export PATH=/home/alica-dev/AlicaV2/.tools/node-v24.21.0-linux-x64/bin:$PATH
  node service-foundation/tooling/schema-source.mjs
  node catalog/proposals/service-records/prepare.mjs
  node --test service-foundation/tests/*.test.mjs

These require existing public package builds and pinned dependencies. Inspect the
accepted offline build/bootstrap scripts before execution. Do not run live Phase3
or Phase4 scripts, access protected authority, or modify frozen source to fix tests.
CLI validation:
  node service-foundation/tooling/cli.mjs validate MANIFEST SNAPSHOT sha256:PIN CONFIG

Conformance command, public Host runner, external author and completed manifest
examples are not delivered by this initial slice; no stub claims otherwise.
