# Versioning (C5, C6)

Catalog release, capability contract, ACAP protocol, ALICA platform and plugin
versions are independent. A Catalog release can include experimental contracts;
release number 1.0.0 does not automatically promote their maturity.

Capability versions are numeric major.minor.patch. The Catalog URI's @major,
metadata version and companion ACAP descriptor version must agree. The Catalog
URI maps explicitly to descriptor identity/version/digest; it does not replace
or extend ACAP manifest grammar.

- Major: incompatible contract; new URI major, proposal and review. Preserve old
  accepted history and document migration.
- Minor: compatible extension; added operations on stable history require it.
- Patch: compatible clarification/fix, not a way to change a released contract
  at the same version. Semantic clarifications require explicit review.

Stable major meaning is immutable. Compare the accepted previous entry with the
new validated entry and record lifecycle evidence before release inclusion.
Contract digest is the existing ACAP canonical digest, not a provider identity or
signature. Local namespace policy authorizes inclusion; hashes establish integrity,
not authenticity. See COMPATIBILITY.md and LIFECYCLE.md for executable boundaries.
