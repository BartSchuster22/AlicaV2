# G1 design review and approval boundary

Status: DESIGN DELIVERED / OWNER ACCEPTANCE PENDING. G1 is NOT marked PASS. No production Kernel exists.

## Six required reviews (author assessment, not independent approval)

| Review | Finding | Qualification |
|---|---|---|
| Capability identity/versioning | Namespaced immutable descriptor, canonicalization, explicit features and deterministic numeric ranking specified | Cross-language vectors and runtime compatibility checking are later proof obligations |
| Scope/authority | Ancestor visibility, parent-bounded grants, generation revocation explicit | Design examples do not prove runtime enforcement |
| Lifecycle/reversibility | Staged activation, bounded quiesce and reverse cleanup specified | In-process uncooperative code requires restart; no sandbox claim |
| Security/grants | Trust zones, deny by default, grant interval/revision and broker-derived identity specified | Owner must accept threat boundary and custody model |
| Transport neutrality | Data-only schema subset, call/error envelopes, normalized cancellation specified | Per-frame IPC schemas and OS peer implementation before G6 |
| Offline/Cell independence | Independent pinned root, explicit freshness and separate local state specified | Actual two-host install/recovery remains G7 |

## Required owner acceptance

Accept or amend the proposed normative baseline and ADRs before production implementation, especially TypeScript/Node direction, trusted-only inproc, ancestor visibility, constrained JSON/schema vocabulary, no implicit rebinding, no delegation/wildcards and fail-closed offline freshness.

License and release-key custody decisions remain owner-owned. They do not prevent design or private foundation work after normative approval, but block release qualification. Numeric performance budgets follow an approved baseline before final qualification. Exact IPC frame schemas, rotation record/crypto vectors and lifecycle journal/recovery format are explicit preconditions for those implementations, not claimed complete here.

Tests are SCHEMA/DESIGN level: real executable validation of fixtures and illustrative rules, not a runtime, security audit, complete policy engine or transport. Six reviews above are author assessments; no independent reviewer or owner sign-off is fabricated.
