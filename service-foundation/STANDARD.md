# Service Foundation v1 standard

Status: Phase5.0 technical candidate, not Owner Acceptance. Normative machine shape:
`schemas/service-manifest-v1.schema.json`. Normative consistency checks:
`tooling/validate.mjs`. ServiceManifest is a declaration, never an authority grant,
registry, provider resolver, lifecycle engine, supervisor, router or deployment spec.

## Identity and selected context

`apiVersion=alica.io/service/v1`, `kind=Service`. `metadata.id` uses the accepted
lower-case dotted/hyphenated identifier form, not a conceptual capability URI.
`metadata.version` is the service implementation version. Catalog reference `uri`
uses the actual Catalog URI (e.g. acap://alica.io/example/echo@1); its `identity`
is the distinct ACAP descriptor ID (io.alica.example.echo); `version` is the exact
selected definition version. Do not interchange these identifiers.

Manifest version, service version, capability contract version, selected Catalog
release version, configuration schema version and data schema version are separate.
The supported binding is exactly `public-host-inproc-v1`, the existing public Host
and SDK surface. This bounded compatibility profile is not a new platform-version
resolver. No container name/image/orchestrator is part of service semantics.

`catalog.version` AND `catalog.digest` must match the caller-supplied, independently
pinned snapshot. `consumeSnapshot` verifies its contents, definitions, namespace
policy, index and dependency graph; semantic validation substantively selects URI,
version, descriptor identity, scopes, permission declarations and required/optional
dependency correspondence. Integrity is not authenticity: trustVerified remains
false under the frozen local Catalog model. A digest read back from the same
untrusted manifest is not an independent deployment pin.

`capabilities.provides` has at least one entry. `requires` entries state `optional`
explicitly. Semantic matching does not establish that a provider is running.
The existing Host resolves providers, applies existing scopes/grants, and rejects
unavailable mandatory requirements at activation/require time. Runtime permission
tests must use public Host, not merely compare declarations. When an existing
plugin manifest is supplied to semantic(), identity, descriptor digests, required
and optional contracts and secret references are also compared.

## Three independent results

- STRUCTURAL: closed schema shape, syntax, bounded fields, no executable UI/inline secrets.
- SEMANTIC: selected Catalog context, local schemas/configuration and declaration
  consistency. PASS does not imply a running service, an available dependency or grant.
- EXECUTED: observations of the exact implementation/environment from a separate
  qualification harness. The validator/CLI always returns NOT_TESTED here.

A fixture-generated fault context is explicitly a fixture, not an admitted contract
or actual provider observation. Tests and evidence name their level separately.

## Lifecycle and health: reuse, do not create

| Service concept | Existing authority / native reference procedure |
|---|---|
| Discovery/initialization | Host.bootstrap then signed package Host.discover; no ServiceManifest loader |
| Starting | Host.activate; SDK definePlugin.activate(ctx); effect-owned resource open |
| Providing/consuming | ctx.provide / ctx.require and public SDK clientEndpoint |
| Ready | Only after native resource open + native registration; service-owned health READY |
| Dependency loss | Existing Host required-handle failure and instance cleanup; no new retry loop |
| Stop | Host.dispose or owned scope.dispose; effect disposer closes/drains resource |
| Full cleanup | Host.shutdown; inspect zero registrations/listeners/pendingCalls/effects |
| Restart | Operator creates a new instance/grants; same explicitly chosen data directory |
| Crash test | Qualification parent SIGKILLs only its ready child; starts a new operator |

The signed bootstrap shell and native attachment procedure are fully shown in
examples/external/operator.mjs and README. A granted public call retires its
placeholder registration and rejects UNAVAILABLE. Only after absence verification
is the native provider registered in the owned child. Two visible registrations
for the same identity cause CONFLICT; no frozen Host relaxation is made. Host
shell ACTIVE is NOT service READY. This is an explicit native operator topology,
not a generic newly exported lifecycle wrapper or independently signed native code.

`health.ownedBy=service` and states READY/DEGRADED/UNAVAILABLE are generic health,
not a second lifecycle state machine. The references mark ready on registration,
unavailable on stop/storage error, degraded on quota rejection. There is no new
health capability, monitoring backend or claim of automatic external liveness
supervision. A hung stop reports the existing timedOutResources/restartRequired;
it must not be relabeled clean.

## Configuration and secret references

`configuration` gives local JSON schema, independent version, reload=restart.
Configuration values are supplied explicitly by the operator; schema validation
rejects missing/wrong fields. References are local beneath the manifest directory,
including realpath/symlink containment. Schema $ref variants are rejected, never
fetched. Configuration/schema changes require revalidation and ordinary stop/start;
there is no hot-reload broker. No environment interpolation or credential resolver.

`secrets` contains names only. This demonstrated frozen Host profile supports the
existing synthetic-test reference ONLY, with actual declaration/existence/grant
checks. It is not production credential support. The successful declaration of a
reference neither grants access nor proves a value exists. Native code ownership
and ordinary OS file access are outside ACAP grants; no secret values in manifests,
logs, UI or evidence. All qualification keys/secret fixtures are fresh synthetic
material; historical protected paths are never used.

## Data, permissions and persistence

`permissions` and `scopes` declare consistency with selected definitions; the Host
remains authoritative for grants. `data` separates authoritative, derived, external
and rebuildable domains. Domains cannot overlap; rebuildable must be derived.
These are declaration consistency rules. The native reference additionally refuses
an undeclared authoritative domain. Neither check confines arbitrary hostile code.

| Persistence class | Required meaning |
|---|---|
| STATELESS | no owned data/schema/restart durability; no backup/migration work |
| STATEFUL | authoritative data, schema/version, survives normal restart, stopped backup declaration |
| DERIVED_STATE_ONLY | only derived data, all rebuildable; no authoritative backup claim |
| EXTERNAL_STATE_AUTHORITY | external authority, no local authoritative ownership |

Only STATELESS and STATEFUL are behaviorally demonstrated. Others are vocabulary,
not additional implementations or deployment-equivalence claims.

Tiny records use one operator-chosen directory, schema1 and at most32 records;
keys1..64 characters, values0..4096. Completed put replaces a key and survives
ordinary stop/start. get distinguishes missing from existing empty string. Failed
writes return UNAVAILABLE and retain the previous in-memory record; quota is
RESOURCE_EXHAUSTED. Corrupt JSON/shape causes startup FAILED_PRECONDITION and I/O
open failure causes UNAVAILABLE, never successful absence. These startup failures
are lifecycle failures, not new advertised operation outcomes. SDK/Host normalize
capability validation/permission/cancellation/deadline errors. Cancellation does
not promise rollback of an already started write. No transactions, fsync/crash
atomicity, search, database framework, backup execution or migration engine.

`backup.required`/`consistency` and `migration.required`/`compatibility` are checked
for consistency. Results must say declaration VALID, execution NOT_TESTED. The
stateful example requires stopped backup and same-schema-only; no upgrade/migration
claim is made. A future incompatible schema requires future authorized work.

## Events, diagnostics and UI

`events.emits/consumes` may refer only to event identities/versions in selected
provided/required Catalog entries. Existing ctx.events API/grants remain authority;
references need no new events and declare none. `diagnostics=sdk-safe-log-v1` uses
existing safe SDK logging only; no log/metrics service is introduced. Cleanup
inspection is operator/test evidence, not permission for backend state disclosure.

Optional `ui` is a bounded array of id/title/capability/permission metadata. It has
no scripts, URLs, components, routes or execution hook. Referenced capability and
permission must already be declared. It grants nothing and implies no rendering,
UniUI implementation, configuration writer or secret exposure. Omit it if unused.
No orthogonal result metadata was needed, so no speculative result contract added.

## Minimal developer path

Install frozen public packages and this additive package from pinned local tarballs;
see examples/external for exact offline author/operator separation. SDK provider
and unchanged consumer are in reference/services.mjs; optional native resource is
reference/file-records.mjs. Generated examples/stateless and examples/stateful each
contain manifest, selected snapshot, config schema/value, and stateful data schema.
Validate via `node service-foundation/tooling/cli.mjs validate MANIFEST SNAPSHOT PIN CONFIG`.
No change to the frozen SDK, CLI or Kernel is needed for branding.

No hosted registry, package-registry publish, service discovery server or background
process is delivered. See docs/phase5.0/REPRODUCE.md and FAILURE-MATRIX.md for proof
commands and boundaries. Native-first proof is not multideployment equivalence.
