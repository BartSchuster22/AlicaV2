# Lifecycle (C4)

The public `@alica/catalog/governance` API accepts validated Catalog entries,
not untrusted raw definitions. First call `validateDefinition` for both entries.
`transition(previous, proposed, evidence)` compares the actual accepted previous
entry; passing null means a new proposal, never permission to erase history.

Allowed edges:

- proposed → experimental
- experimental → experimental or stable
- stable → stable or deprecated
- deprecated → deprecated or retired
- retired → no further state

`proposed` and `rejected` are proposal dispositions, not released definition
maturities. A rejected review cannot supply release evidence. Retired contracts
remain in versioned history; do not delete them from old releases.

Every transition requires an accepted complete proposal review, a proposal draft
matching the target Catalog URI, a reference and a maintainer matching the
namespace-authorized definition owner. Initial experimentation, experimental
updates and stable promotion require implementation and conformance references.
Deprecation and retirement require migration and replacement guidance (including
explicit no-successor guidance when appropriate).

A history edge preserves exact URI and owner, cannot regress the version, and
cannot mutate contract content at the same version. Stable/deprecated histories
and promotion to stable reject BREAKING changes; REVIEW_REQUIRED needs explicit
compatibilityReview evidence. Added operations on those edges require a minor
increment. An incompatible new major is a separate proposal and identity, not an
in-place history mutation. Maintainers retain the previous major and migration
path.

Records and evidence references are local governance inputs. The API checks
structure and consistency, not reviewer identity, evidence truth or authorization
through signatures. Maintainers must inspect referenced evidence and commit the
accepted record together with its source. No production signing service is
implied. Permission vocabulary never grants runtime authority.
