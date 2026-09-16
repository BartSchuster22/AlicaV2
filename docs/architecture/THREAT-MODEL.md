# Step-1 threat model — G1 baseline

Status: technical decisions resolved; owner acceptance pending. No runtime security implementation is claimed.

## Assets and trusted computing base

Assets: Cell identity, operator trust root, accepted artifact identities, policy/grant authority, secret values, caller data, lifecycle ownership and availability.

TCB: operator and root-key custody, host kernel/boot chain and filesystem permissions, supported runtime and its dependencies, cryptographic library, trusted loader/verifier, broker/resolver/scope/grant enforcement, local supervisor, bounded audit path and recovery state. **Every in-process plugin joins the effective TCB**, even if it uses only the public SDK in ordinary operation. Build/release signers are supply-chain authorities, not runtime services; repository deploy keys are not signing roots.

Host assumptions: correct supported OS, restricted host administration, trustworthy clock with rollback detection, protected local trust/state files, reliable atomic filesystem operations, and verifiable release provenance. Root-level compromise, hypervisor compromise and malicious signed trusted inproc code are not contained by ACAP. Same-UID process separation is not a hostile-code sandbox. A real OS-enforced boundary is required before any hostile-plugin IPC claim.

## Threat actors, controls and evidence

| Actor / threat | Required decision/control | G1 evidence | Residual or future proof |
|---|---|---|---|
| Malformed-input sender | Bounded data-only values, duplicate/unknown key rejection, closed schemas | CanonicalTests, NegativeSemantic, SchemaTests | Bounded streaming parser/fuzzing before loader qualification |
| Tampered-package supplier | Verify signed domain and raw artifact inventory before code evaluation | CryptoVectors tampering/domain tests; package-index rules | Real verified loader/archive traversal tests G3/G7 |
| Valid but untrusted publisher | Explicit operator-pinned keys/modes, no bundle-added root | Trust-policy schemas and custody decision | Trusted publisher registry enforcement G3 |
| Confused deputy / scope escape | Broker-authenticated identity; outbound own authority; exact instance/scope generation and parent bounds | AuthorityLifecycle, ScopeLifecycleExamples | Runtime race tests G3 |
| Retained handle after revocation | Recheck at dispatch and each result/event delivery; no rebinding | Revocation/expiry/generation vectors | Concurrent revoke/delivery tests G3/G6 |
| Isolated provider impersonation | Supervisor-bound launch identity plus OS peer credentials and restricted OS identity | Trust-zone ADR and transport interface | OS implementation before G6; not claimed tested now |
| Resource-exhaustion attacker | Byte/depth limits, bounded queues, admission limits and quiesce deadline | Oversize/depth/terminal models | Stress/fuzzing and numeric budgets before qualification |
| Malicious trusted inproc plugin | Explicitly part of TCB, only approved publishers | ADR-003; documented limits | Can access process memory, ambient OS access, mutate internals, block loop and retain secrets |
| Hostile same-user process | Separate restricted identity/isolation before hostile-provider loading | Host assumption decision | Without privileged provisioning, hostile isolation remains blocked |
| Secret exfiltration | Exact reference grant, no ambient inherited environment, redacted audit | Secret-grant schema/negative tests | Cannot retract material already exposed to trusted code |
| Event spoof/replay | Verified descriptor binding, broker source instance/generation, sequence, exact grants and visibility | Envelope/schema checks | Runtime replay/visibility tests before event implementation qualification |
| Stale offline trust | Root-signed revocation state, monotonic versions/time, fail closed on expiry | Freshness/rollback models, rotation crypto vectors | Actual disconnected install/recovery G7 |
| Audit-storage failure | Deny security-sensitive new mutation; emergency revoke/terminate still proceeds | Normative failure decision | Disk-full/crash injection before durable-state qualification |
| Root/host compromise | Verified backup or new Cell identity; never automatic trust reset | Root rotation schema, dual signing and wrong-root tests | Operational recovery ceremony G7; no protection against compromised host root |

## Trust boundaries and failure policy

Untrusted archive -> verifier -> loader; profile request -> operator policy; context -> broker; logical scope -> visibility; IPC peer -> supervisor identity; secret reference -> secret value; security mutation -> audit sink. Authentication must precede sensitive catalog disclosure. Visibility does not confer authorization. Signatures prove control of a key, not trust in its publisher.

Emergency revocation proceeds despite audit failure and raises an operator-visible failure; it never leaves access active simply because disk is full. Cleanup failure is not reported as success. Staged activation cannot expose partially registered providers. Dependency loss quiesces mandatory dependents rather than silently rerouting requests.

## Release blockers and review discipline

P0/P1 findings block qualification. Any boundary/authority change requires an ADR and updated negative tests. Six G1 reviews are agent-author design reviews, **not an independent security audit**. Existing fixture inventories/signatures are test-only and not installable release artifacts. Independently implemented runtime conformance, OS isolation, real load/unload, crash recovery and hostile-input fuzzing remain later mandatory proofs, not unresolved G1 authority semantics.
