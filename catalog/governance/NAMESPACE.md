# Namespace governance v1

Canonical form: acap://authority/domain/capability@major. Lowercase ASCII authority,
kebab-case domain/capability, positive major without leading zero. No aliases,
percent encoding, query/fragment or case folding. Descriptor dotted identity is
explicitly mapped, not inferred from URI. URI major must match definition and
executable contract version. Duplicate URI/version and conflicting descriptor
identity ownership fail deterministically.

Three distinct checks:
1. Syntax/major: identity parsing and definition schema.
2. Release inclusion/ownership: versioned local governance/namespaces.json.
3. Authenticity: trusted acquisition of the policy/release, outside the hash check.
A self-written policy or matching hash is NOT proof of domain ownership or release
authority. No DNS/online service, key infrastructure or production trust ceremony.

Only alica.io is first-party; `core` is reserved to it. Vendor namespaces require
an explicit owner/domain policy entry. Private authorities end `.private` and
remain local unless explicitly included in a reviewed release. Each definition
owner must match policy and the URI must appear in its release allowlist.
Namespace policy updates and release inclusion require maintainer review, not a
capability self-grant. No ownership claims are made about fixture vendor domains.
Aliases are unsupported in v1: propose a new canonical identity with migration
guidance instead of silently redirecting an existing contract.
