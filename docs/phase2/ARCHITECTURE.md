# Catalog architecture and boundaries

The Capability Catalog is a local-first collection of versioned ACAP contracts and
review policy. It standardizes contracts, not implementations. It is neither the
live Runtime Registry nor a plugin directory, orchestrator, marketplace or service.

## Source and derived artifacts

`catalog/catalog.yaml` is JSON (a YAML subset), parsed strictly without another
parser dependency. It selects definitions under `catalog/capabilities/`.
A CapabilityDefinition maps its URI and version to the existing executable ACAP
identity, version and canonical descriptor digest. Operations, payload schemas,
modes, features and idempotency remain in the ACAP descriptor, not a second grammar.
Local descriptor/event references are resolved relative to the Catalog root;
remote, absolute, parent-traversing and escaping symlink references fail.

Definitions contain metadata, semantic guarantees, scope, permission vocabulary,
events and capability-only dependencies. Dependencies select compatible semantic
versions within a URI major, not providers or plugins. Permission vocabulary grants
nothing: existing Kernel/Policy authority is unchanged.

Namespace policy and proposal/review artifacts live under `catalog/governance/`
and `catalog/proposals/`. Lifecycle transitions require explicit review; validation
does not promote maturity. Echo remains experimental. See [namespace policy](../../catalog/governance/NAMESPACE.md),
[lifecycle](../../catalog/governance/LIFECYCLE.md), [review](../../catalog/governance/REVIEW.md),
[compatibility](../../catalog/governance/COMPATIBILITY.md) and [versioning](../../catalog/governance/VERSIONING.md).

`catalog/generated/index.json` is derived lookup data, not the source of truth.
Snapshots embed selected definitions, executable descriptors, schemas, namespace
policy, index and compatibility metadata. Consumption is local and synchronous.
Integrity rejects inconsistent content but does not authenticate authorship.
A trusted out-of-band digest pin is required; `trustVerified` remains false.

## Package and runtime boundary

`@alica/catalog` depends on public ACAP contracts, never Kernel internals. Public
subpaths expose governance, release and CLI functions. `alicac catalog` provides
validation, lookup, comparison, index and snapshot commands; see [CLI](CLI.md).
The runner uses this existing CLI rather than weakening import boundaries.

Authors consume selected snapshots and public packages in a separate project.
Companion bindings check existing PluginManifest declarations against exact Catalog
entries; no manifest fields or runtime protocol have been added. The neutral author
example uses the public SDK testkit with explicit host grants. It demonstrates
provider-independent contract use, not production isolation or runtime discovery.
The separate Phase1 external SDK regression covers the actual Kernel-load path.

Catalog release 0.1.0, Echo capability 1.0.0, ACAP v1, plugin versions and the Phase2
milestone tag are independent version axes. Conservative compatibility can return
REVIEW_REQUIRED; a classification is not approval. Ambiguous selected historical
versions fail rather than silently choosing a latest version.

## Deliberate exclusions

No hosted registry, federation, integrations, new infrastructure or Phase3 work.
Kernel, ACAP and the Phase1 tag remain frozen. Historical G7 work and its acceptance
status are not changed by Catalog acceptance. Future integrations must propose
generic missing contracts through review, not introduce private Kernel APIs.
