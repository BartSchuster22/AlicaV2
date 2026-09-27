# Capability Catalog (Phase 2)

Status: M1 foundation under execution; not a Phase2 completion claim.

CapabilityDefinition v1 adds governance to existing executable ACAP descriptors.
`contract` explicitly maps Catalog URI to ACAP identity/version/canonical digest
and a local descriptor path. Operations, input/output schemas, modes, features
and idempotency live ONLY in that descriptor. Event references use existing ACAP
event descriptors. No duplicate manifest grammar or Kernel changes. References
are relative to the Catalog root, not the definition directory. Remote, absolute,
parent-directory and symlink-escaping references fail; ACAP's bounded schema
vocabulary has no unresolved network references.

Definitions include metadata, semantic guarantees, scopes, permission vocabulary,
events and capability-only dependencies. Dependencies use `^major.minor.patch`
within the named URI major; required dependencies must resolve in the selected
release. No provider/plugin selector or grant field exists. Candidate providers
belong in proposal evidence, not normative definitions. Permissions describe
required vocabulary; ONLY the existing Kernel/Policy can grant authority.

`catalog.yaml` uses JSON, a YAML subset, to reuse the strict ACAP parser (including
duplicate-key rejection) without a second parser dependency. Definitions plus
referenced contracts and governance are authoritative. Index/snapshots are derived.
Catalog release 0.1.0 deliberately contains capability 1.0.0, independent of
platform/plugin 0.0.0 and ACAP v1.

Public build-time API: `@alica/catalog` exports `validateDefinition`,
`validateDefinitions`, `validatePolicy`, `identity`, `localReader`, and the JSON
Schema. The package reuses `@alica/acap-contracts`; it has no Kernel dependency.
Packaged schemas are copied from catalog/schemas by tools/build.mjs.

Echo is a neutral bounded text round-trip motivated by external-author contract
interoperability. Its experimental status is not production qualification.
Idempotency vocabulary uses ACAP's existing `none`/`provider` semantics; no new
Catalog synonym changes protocol behavior.
