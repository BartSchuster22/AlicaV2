# G1 — six design reviews and findings

Status: technical review completed; owner baseline acceptance pending. Reviewer: implementation agent acting as document author. No independent reviewer sign-off is implied. Review scope: normative source documents, schemas, example fixtures and executed design tests on the dedicated VPS.

| Review | Finding and resolution | Evidence | Later qualification |
|---|---|---|---|
| Identity/versioning | R1: close optional-feature and range ambiguity; distinguish capability/package versions; immutable ID/version digest conflicts fail | Baseline §1–2; Negotiation and NegativeSemantic tests; canonical vectors | Cross-language runtime encoder and provider conformance |
| Scopes/authority | R2: bind principal **and instance**, scope **and generation**; separate visibility from permission; exact event/secret grants | Baseline §4/8; AuthorityLifecycle and ScopeLifecycleExamples | Runtime races and retained-handle tests |
| Lifecycle/reversibility | R3: full transition table, terminal FAILED, staged publication, mandatory dependency-loss quiesce, honest partial cleanup | Baseline §3; exhaustive state-pair checks and cleanup model | Real fault injection/unload/timeout tests |
| Grants/security | R4: explicit operator-only issuance, no delegation/wildcards, exact expiry/revision; resolve single-root rotation and metadata schema | Baseline §4/6; invalid grants, CryptoVectors and freshness tests; threat model | Verified loader, trust store and recovery implementation |
| Transport neutrality | R5: public handler/adapter surfaces, closed response, shared normalized errors, deadline/cancel race, bounded stream contract | PUBLIC-INTERFACES; core/inproc/IPC specs; response and terminal vectors | IPC frame schemas/OS peer validation before G6 |
| Offline independence | R6: remove package-digest circularity; canonical index vs raw file hashes; exact portable lock, fail-closed offline policy | Baseline §2/6; lock/package negative cases; OpenSSL signature verification | Two clean hosts, one disconnected; real install/recovery G7 |

## Resolved decisions submitted for owner acceptance

- TypeScript with maintained Node LTS; exact pinned version selected at G2 before installation.
- Lean trusted Kernel; no application/framework/database dependencies.
- Trusted-only inproc; real OS-enforced isolation required for hostile IPC providers.
- Constrained canonical JSON, exact descriptor identity and deterministic bounded version ranges.
- Ancestor visibility; instance/scope generation authority; no delegation, wildcard grants or transparent rebinding/replay.
- Separate capability/secret/event grants; declared typed events with authenticated source continuity.
- Single pinned root, dual-authorized rotation, local revocation freshness and fail-closed offline behavior.

No unresolved security-policy choice is delegated to provider authors. Remaining IPC wire encoding and journal storage layout must preserve these frozen semantics and receive review before their implementations. A production implementation cannot count these design models as enforcement evidence.

Owner-owned license and production release-key custody decisions block publication, not this specification delivery. Numeric performance limits beyond normative request/queue bounds must be measured and accepted before final qualification. G1 EXIT still requires owner acceptance of this exact baseline; author review cannot grant it.
