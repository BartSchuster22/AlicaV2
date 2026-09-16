# ALICA V2 — G1 Normative Design Review Package

Status: proposed; approval pending. This is not a working runtime.


---

Source: `docs/gates/G1.md`

# G1 — Normative design delivery

**Gate status: NOT PASSED — OWNER ACCEPTANCE PENDING.**

## ENTRY

G0 scope and immutable distribution reference baseline recorded after the owner's Step-1 start authorization.

## DELIVERABLE

- 13 normative proposal documents: Kernel API, ACAP core/errors/events/scopes/security/inproc/IPC, manifest, bundle, profile, trust policy and SDK conformance.
- 11 JSON Schema 2020-12 schemas and positive fixtures.
- 12 proposed ADRs, threat model and six author design reviews.
- Executable schema/design tests and hash-bound execution record from the dedicated VPS.

## Executed checks

Command: `python3 tests/design/test_specifications.py`.

Result: **84 tests passed**, exit code 0. See `evidence/g1/design-tests.txt` and `execution.json`. Coverage includes valid/invalid schemas, unknown fields, path traversal, duplicate operations, grant intervals, canonical JSON restrictions, descriptor digest, explicit provider pinning and illustrative scope/lifecycle examples.

This is SCHEMA/DESIGN evidence only, not runtime security, independent audit, IPC interoperability, signature verification or standalone installation acceptance. Test-only package/signature fixtures are not executable artifacts. No production Kernel, ACAP runtime or SDK exists yet.

## EXIT

Owner acceptance is missing, therefore G1 remains NOT PASSED. Proposed choices needing acceptance: TypeScript/Node direction; trusted-only in-process plugins; authenticated isolated IPC; constrained JSON contracts; ancestor-scoped visibility; per-call grant revocation; no automatic rebinding/replay; fail-closed offline trust.

Before their implementation, additional detailed schemas/vectors remain required for IPC framing, root rotation and durable recovery. License/release key custody are owner decisions before publication. Numerical performance budgets follow a measured baseline before qualification. These are recorded preconditions, not silently completed work.

G2–G8 remain NOT STARTED. Tool limit was not reached during this delivery; the stopping condition is the agreed approval gate.


---

Source: `docs/gates/G1-REVIEW.md`

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


---

Source: `docs/architecture/THREAT-MODEL.md`

# Step-1 threat model (proposed)

Assets: operator trust root, Cell identity, secret values, grant authority, provider identity, accepted artifacts, caller data, lifecycle integrity and availability.

Adversaries: malformed input sender, tampered package supplier, untrusted publisher with valid keys, malicious isolated provider, compromised trusted plugin, hostile local same-user process, privileged host attacker.

Boundaries: release bytes -> verifier -> loader; profile requests -> operator policy; plugin context -> broker; scope -> ancestor visibility; IPC peer -> authenticated launch record; secret reference -> value; runtime -> audit/evidence.

| Threat | Required control | Residual limit |
|---|---|---|
| Tampered package | pinned root, inventory signatures/digests before evaluate | compromised signing custody needs revocation |
| Scope escape/stale handle | immutable binding and per-call generation/grant checks | malicious trusted inproc can bypass language interfaces |
| IPC identity forgery | OS peer identity + launch-bound challenge | same-user adversary requires actual OS isolation |
| Deadline/cancel abuse | bounded request/queues and terminal state | external side effects are not rolled back |
| Malformed JSON | size/depth/type/duplicate rejection | production parser must bound work before allocation |
| Secret leak | explicit references, redaction, no ambient environment inheritance | trusted process may retain returned secret |
| Audit tamper | bounded protected local sink and failure policy | not proof against root attacker |
| Offline stale trust | monotonic metadata version/freshness and fail-closed expiry | prolonged disconnection can prevent activation |
| Host compromise | least privilege, operator hardening/recovery | root compromise is outside Kernel protection |

No claim of in-process malicious-code sandboxing. No test-only signing key may establish production trust. P0/P1 finding blocks qualification. Changes to this threat model require ADR and revised negative tests.


---

Source: `specs/ALICA-BUNDLE-v1.md`

# ALICA-BUNDLE-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Packaging and signature boundary

`bundle.schema.json` describes bundleId, format version, profileDigest and artifacts with path, SHA-256 digest, byte length and kind. No duplicate paths. The detached signature signs canonical bundle-manifest bytes with a domain prefix `ALICA-BUNDLE-v1\n`; the signature file is not included in its own signed inventory. Every executable, plugin manifest and contract descriptor must be bound by the inventory. Verify lengths/digests and reject extra executable artifacts. Archive extraction has bounded total size/count and rejects duplicate names, absolute paths, traversal and unsafe links before any activation.

Trust root is operator-pinned separately, not accepted because delivered in the archive. SBOM and provenance are themselves inventory-bound and describe real contents/source/build stages. An empty identity-only SBOM cannot satisfy dependency coverage. Detached signature encoding and key IDs follow trust policy; use standard vetted Ed25519 implementation, never custom crypto.

Offline bundles include the application runtime and all accepted application dependencies, schemas and verification material. The base OS and its declared prerequisites are a separate explicit qualification boundary. Application install and verification after disconnection require no package registry, transparency service or central ALICA endpoint. 'Offline' does not mean provisioning an unprepared blank machine unless that path is independently tested.

Install stages into a private directory, verifies, then atomically publishes accepted state. Failure leaves prior accepted state unchanged. Exact reinstall is non-mutating. Recovery reconstructs trusted state from verified artifact inventory and separately custodied identity/secret recovery data.


---

Source: `specs/ALICA-KERNEL-API-v1.md`

# ALICA-KERNEL-API-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Trusted boundary

The Kernel owns Cell bootstrap, registry, resolver, lifecycle, scopes, grant enforcement, trust verification hooks, owned event dispatch, secret-reference mediation and audit emission. It MUST NOT implement domain memory, agent loops, sessions, UI, identity-server integration, database products or release signing. Manifest parsing is data-only; executable configuration is forbidden.

## Public interfaces

The public host API comprises `bootstrap(config)`, `plan(profile)`, `activate(pluginId, scopeId)`, `quiesce(pluginId)`, `dispose(pluginId)`, `destroyScope(scopeId)`, `inspect(query)` and `shutdown()`. Bootstrap takes a locally provisioned Cell identity and pinned trust policy; profile data MUST NOT override either. `plan` is non-mutating and returns exact selections and exclusions. Inspection MUST redact credentials and secret values. Mutating host APIs require operator authority and MUST NOT be exposed to ordinary plugins.

The plugin context comprises `provide(descriptor, implementation)`, `require(requirement)`, `optional(requirement)`, `effect(acquire)`, `on(event, handler)`, `emit(event)`, `secret(reference)` and `log(record)`. Its principal, plugin instance and scope are immutable Kernel-supplied bindings. `provide` returns an owned disposer, never a registry mutation handle. `require` returns a revocable proxy, never an implementation object. `optional` returns absence only for unavailable compatible capability; permission denial is an error, not absence. Effects register cleanup before becoming externally visible; acquisition failure MUST clean partially acquired resources.

## Lifecycle

Legal paths: DISCOVERED -> VERIFIED -> RESOLVED -> ACTIVATING -> ACTIVE -> QUIESCING -> DISPOSED. A pre-ACTIVE error enters FAILED after attempted cleanup; ACTIVE errors quiesce before FAILED. FAILED instances MUST NOT reactivate; create a new instance. Repeated disposal of DISPOSED is a successful no-op. No outgoing transition exists from DISPOSED. VERIFIED requires accepted signatures and digests before evaluating code. RESOLVED requires all mandatory dependencies and grant feasibility. ACTIVATING effects stay staged until atomic publication of ACTIVE. A required-dependency cycle is rejected; optional dependencies MUST NOT create activation ordering edges and cannot be acquired during activation to manufacture a cycle.

Quiesce prevents new calls/registrations, waits at most the operator timeout, then cancels remaining calls and disposes effects in reverse acquisition order. Cleanup errors are aggregated; other disposers still run. Child scopes quiesce before parents. An uncooperative in-process module may require Cell restart; it is not sandboxed. Isolated providers can be terminated at the deadline. Never report complete cleanup if cleanup failed.

## Audit and failure

Security-relevant actions include activation decisions, grant denial/revocation, trust rejection, scope destruction and cleanup failure. Emit actor, target, scope, outcome, stable reason, timestamp and correlation ID; never payload/secret values by default. The local audit mechanism is bounded. Failure to record a security-sensitive mutation MUST block that mutation; emergency revocation/termination still proceeds and reports audit unavailability to the operator. Crash recovery rebuilds registry from verified profile, not persisted object handles. Policy changes and state writes are atomic; recovery MUST NOT silently lower trust.


---

Source: `specs/ALICA-PLUGIN-MANIFEST-v1.md`

# ALICA-PLUGIN-MANIFEST-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Manifest semantics

`plugin.schema.json` defines data-only plugin metadata: plugin ID/version, publisher, execution mode, relative entrypoint, provided descriptor bindings, required capabilities, requested secret references. All mandatory declarations must be present; an empty list means none, not unrestricted permission. Provided binding includes capabilityId, version, descriptorDigest and relative descriptorPath. The descriptor document remains a separate immutable artifact. Resolution rejects declaration/content mismatches.

The manifest does not include its own package digest, avoiding circular hashes. A signed bundle inventory binds manifest, descriptors and code artifacts by path/length/digest. The loader verifies signature against operator policy, then verifies all bytes before interpreting code. Signature validity does not make a publisher trusted automatically.

Entrypoints and descriptor paths are relative slash-separated safe components, no `.`/`..`, absolute paths, backslashes or executable interpolation. Symlinks escaping staging and duplicate archive paths are rejected. Execution mode is `inproc` or `ipc`; mode selection is trust-policy-constrained, never a plugin escape hatch. Required capability requirements are checked before ACTIVE. Secret declarations request permission but do not grant it.


---

Source: `specs/ALICA-PROFILE-v1.md`

# ALICA-PROFILE-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Composition

`profile.schema.json` contains profileId, version, plugin selections and optional explicit provider pins. Selections bind exact plugin version and package digest. No environment variable interpolation, secret value, Cell identity or trust-root override is permitted. Unknown keys are rejected. Runtime operational paths and local credentials are supplied separately.

A resolution lock records profileDigest, plugin artifact bindings and chosen capability/provider/version/descriptorDigest. Lock generation is deterministic for the same accepted catalog/policy inputs; it MUST include a digest of the applicable immutable policy, not secret values. Reordering the input catalog cannot change selections. The lock schema is `resolution-lock.schema.json`; CLI presentation is non-normative and must preserve these fields.

An explicit provider pin that is absent/incompatible/denied fails; no silent fallback. A profile's permission requests are constrained by operator trust policy and scope/grant authorization. Accepted profile/lock bytes must match online and offline qualification hosts; generated Cell identity and local paths intentionally differ.

Lock plugin entries are sorted by plugin ID ascending; bindings by scope, consumer ID and capability ID ascending. Duplicate plugin IDs or duplicate (scope, consumer, capability) bindings are rejected. All binding providers and consumers must exist in the locked plugin set, and provider artifact/version must match its plugin entry. Scoped instance generation is runtime state and is not included in portable lock bytes. Lock scope IDs are profile-local logical scope names instantiated beneath the local Cell root.


---

Source: `specs/ALICA-SDK-CONFORMANCE-v1.md`

# ALICA-SDK-CONFORMANCE-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Public surface and test levels

The SDK exposes definePlugin, owned provide/require/optional handles, typed events, effects, scoped secret references and structured logging. Consumer/provider generators use approved descriptors and produce deterministic files. Exported types cannot import Kernel implementation. No private monorepo path alias is a valid external SDK dependency.

Conformance levels are distinct: SCHEMA validates data, DESIGN runs illustrative reference rules, PROVIDER verifies real provider behavior, TRANSPORT verifies inproc/IPC equivalence, CELL verifies signed standalone/recovery operation. Passing SCHEMA/DESIGN does not imply PROVIDER/TRANSPORT/CELL. Reports name level, source revision, executed command, runtime, test identifiers and actual result. Mocks must state guarantees they do not enforce.

Required provider cases include substitution, contract negotiation, input/output validation, permission rejection, deadline/cancellation races, idempotency declarations, event visibility, lifecycle cleanup and revoked handles. Required transport cases additionally include identity spoofing, framing limits, slow receiver, disconnect and no replay. Required Cell cases include trust rejection, install no-op, disconnected install and clean-host restore.

An external tutorial starts from an empty directory and uses published/public package surfaces only. G5 must execute it outside the repository. A generated interface without a working independent provider is not conformance completion. Every negative test must prove the expected specific rejection; merely catching any exception is insufficient.


---

Source: `specs/ALICA-TRUST-POLICY-v1.md`

# ALICA-TRUST-POLICY-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Root and publisher model

`trust-policy.schema.json` defines policy version, Cell root key IDs, accepted publisher keys, allowed execution modes, expiry and maximum offline metadata age. Actual public keys are supplied in operator-controlled local trust records; policy key IDs are SHA-256 over raw public-key bytes. Root initialization is an explicit operator ceremony with out-of-band fingerprint verification. A bundle never introduces an automatically trusted key.

Ed25519 signs canonical bytes with domain separation. A detached signature envelope has algorithm=`ed25519`, keyId and base64 signature. `signature.schema.json` fixes the envelope. Base64 MUST decode to exactly 64 bytes and re-encode byte-identically; regex shape alone is not sufficient. Rotation behavior requires real cryptographic vectors before G3 verified-loader qualification. Verify algorithm, key length, signature, accepted publisher, policy expiration and artifact/contract digests before loading. Development keys are explicitly test-only and cannot satisfy production candidate policy.

Offline freshness is evaluated against trustworthy host time and separately cached operator-approved revocation metadata. The last verified metadata time and version cannot move backward. If time is untrusted, required metadata is missing/expired or age exceeds policy, activation fails closed. Running-instance expiry behavior is bounded quiesce/revoke at expiry, not indefinite continuation. Offline availability never justifies disabling signature, expiry or revocation checks.

Rotation requires authorization under the currently trusted root and the new root, with monotonic version and audit evidence. A lost/compromised root requires explicit offline recovery authorization, not accepting arbitrary replacement from the network. Threshold multi-party custody and remote update distribution remain deferred unless approved; Step 1 still requires tested bootstrap, rotation and fail-closed recovery behavior. Root keys, release keys and repository deploy keys are distinct roles.

## Signature domains and key records

Bundle bytes are signed under `ALICA-BUNDLE-v1\n`; trust policy bytes under `ALICA-TRUST-POLICY-v1\n`; root-rotation authorization under `ALICA-ROOT-ROTATION-v1\n`. Prefix ASCII bytes directly precede canonical JSON bytes, with no extra delimiter. Signatures from one domain are invalid in another. Trusted raw Ed25519 public keys are exactly 32 bytes; keyId is SHA-256 over those bytes. Operator trust records bind key ID to raw public key and publisher and are not obtained from unsigned plugin claims.

A root rotation record includes prior/new monotonic policy versions and both policy digests, signed in the rotation domain by both prior and new roots. Missing either signature is failure. Exact rotation record schema and cryptographic vectors are required before implementing that operation; unsigned development fixtures never qualify rotation. Revocation storage and enforcement are local-authoritative and cannot be reset by profile changes.


---

Source: `specs/ACAP-CORE-v1.md`

# ACAP-CORE-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Capability descriptor

The descriptor schema is `capability.schema.json`. IDs use lower-case dot-separated namespaces. Versions are MAJOR.MINOR.PATCH without prerelease/build extensions in v1. Operation names are lower camel-case/alphanumeric identifiers. Each operation declares kind (`unary` or `stream`), input/output schemas, idempotency (`none` or `provider`) and required grant operation. A stream's output schema describes each item. Features are explicit strings, not implied by package version. Contracts are immutable: same ID/version with different canonical digest is a conflict, never an update in place.

Descriptor payload schemas MUST use the data-only supported subset: `type`, `properties`, `required`, `additionalProperties`, `items`, `minItems`, `maxItems`, `minLength`, `maxLength`, `minimum`, `maximum`, `enum`, `const`, `description`. Allowed types are object, array, string, integer, boolean and null. Objects MUST declare `additionalProperties:false`; property names are ASCII identifiers and `$ref`/remote schema loading/regex evaluation are forbidden in payload schemas. Nested schemas follow the same rules. Richer schemas require a later version rather than implementation-specific behavior.

## Values and canonicalization

ACAP v1 values are JSON null/booleans/strings, arrays, objects with ASCII property names, and integers in [-9007199254740991,9007199254740991]. Floating-point numbers, NaN, infinity, duplicate object keys, unpaired surrogates, cyclic values and executable values MUST be rejected. Decimal quantities can use contract-defined strings. Do not normalize Unicode string values. Canonical bytes are UTF-8 JSON with keys sorted by ASCII order, no insignificant whitespace, literal valid Unicode, lower-case `\u00xx` control escapes (using standard short escapes for backspace/tab/newline/formfeed/carriage return), escaped quote/backslash and unescaped slash. Negative zero is canonicalized as integer zero; exponent/fraction numeric tokens are forbidden. Empty strings/arrays are preserved. Digests are `sha256:` plus 64 lower-case hex digits. Digest the descriptor without any enclosing artifact/signature metadata; do not embed its own digest. Cross-language golden vectors are release-blocking.

Maximum encoded request/event size is 1 MiB, nesting depth 32, identifier length 128, at most 256 operations or 256 features, unless a strictly lower profile limit applies. Oversized input is rejected before unbounded parsing/allocation. Test vectors are not a production streaming parser.

## Negotiation and deterministic resolution

A requirement names ID, exact supported major, minimum minor, required operations and required features. A candidate qualifies only if visible, ACTIVE (or valid planned activation dependency), trusted, authorized, with equal major, sufficient minor and all required operations/features. Minor/patch revisions MUST preserve all prior operation semantics and accepted data; breaking changes require a new major. Version alone never proves schema compatibility: approved descriptor digest and conformance remain required.

Explicit profile provider selection wins if qualified; if not, fail rather than fall back. Otherwise sort by version descending (numeric tuple), provider ID ascending and artifact digest ascending. Registration order MUST NOT affect selection. Duplicate active provider identity/version in one resolution visibility set is a conflict. Explain excluded candidates without disclosing invisible provider metadata to unauthorized callers. Resolution locks record exact provider, version, artifact and descriptor digest. Handles bind to one instance/generation; no transparent rebinding.

## Calls

Kernel inserts authoritative caller/scope/grant binding; provider-supplied identity cannot override it. Validate input before invocation and output before exposure. Request IDs correlate attempts; idempotency keys are distinct. Deadlines are absolute epoch milliseconds with a monotonic local timer; nested calls inherit the smaller remaining budget and cannot extend it. Trusted same-host IPC uses a shared OS clock. Validate grants on dispatch and each emitted stream item. Cancellation prevents further delivery but cannot promise rollback of already performed effects. Provider-level idempotency must define persistence window and duplicate/conflict behavior; broker MUST NOT claim exactly-once execution or automatically retry mutations.

## Consumer call envelope

`call.schema.json` is the consumer-supplied call request. It has no caller, grant, provider or scope assertion field. The broker derives those from an authenticated handle and MUST NOT accept client overrides. `descriptorDigest` must match that handle's bound contract. RequestId is unique among outstanding requests per session; idempotencyKey is optional but allowed only when the operation advertises provider idempotency. `deadlineMs` must be in the future and within operator limits; validation order rejects missing/invalid authentication before revealing bound provider details. The IPC envelope carries broker-authenticated routing separately and is frozen before G6.


---

Source: `specs/ACAP-ERRORS-v1.md`

# ACAP-ERRORS-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Envelope and codes

`error.schema.json` defines `{code,message,retryable,correlationId}` with no arbitrary stack/data field. Messages MUST be redacted. Stable codes: INVALID_ARGUMENT, UNAUTHENTICATED, PERMISSION_DENIED, NOT_FOUND, INCOMPATIBLE_VERSION, CONTRACT_MISMATCH, CONFLICT, DEADLINE_EXCEEDED, CANCELLED, UNAVAILABLE, RESOURCE_EXHAUSTED, FAILED_PRECONDITION, INTERNAL.

Malformed values -> INVALID_ARGUMENT; valid but unsupported version -> INCOMPATIBLE_VERSION; signature/digest mismatch -> CONTRACT_MISMATCH at the trusted boundary; denied/expired/revoked authority -> PERMISSION_DENIED; stale instance -> FAILED_PRECONDITION; lost process -> UNAVAILABLE; bounded queue exhaustion -> RESOURCE_EXHAUSTED. Raw exceptions map to INTERNAL with a safe message. Hidden capability details MUST NOT be disclosed; permission denial precedes catalog detail disclosure.

`retryable` is an advisory condition, never permission for automatic replay. Only UNAVAILABLE and RESOURCE_EXHAUSTED may be marked retryable in v1; operation idempotency still controls whether caller retries. A deadline/cancel race produces one terminal outcome: the first transition committed by the broker; late responses are discarded. Each transport MUST expose the same ACAP code for equivalent failures. Local stack traces remain in a separately protected diagnostic channel only if redacted.


---

Source: `specs/ACAP-EVENTS-v1.md`

# ACAP-EVENTS-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Envelope

`event.schema.json` binds eventId, type, contractDigest, sourceProvider, sourceScope, sequence, timeMs and data. The Kernel supplies source identity/scope; callers cannot spoof them. The payload is validated against its declared contract. `sequence` increases within an event source instance; it is not a global clock or durable offset. Event contract versioning follows ACAP.

## Delivery

v1 supports typed observation events only, not middleware waterfalls or policy interception. Delivery is asynchronous, FIFO per source/subscription, at-most-once within a live subscription; there is no replay/durability promise. Across sources no order is guaranteed. Each subscription is scope/owner-bound and disposed on owner teardown. Before each delivery, revalidate scope visibility and grant. Subscribe permission does not grant publish permission.

The queue limit defaults to 256 events and may be lowered by policy. Overflow MUST terminate the affected subscription with RESOURCE_EXHAUSTED rather than silently dropping an unknown subset; other authorized subscribers continue. Handler errors are isolated and audited without crashing unrelated plugins. The event fabric MUST NOT grow a workflow engine or persistent broker.


---

Source: `specs/ACAP-SCOPES-v1.md`

# ACAP-SCOPES-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Scope tree

A Cell has one root scope. A scope has immutable ID, parent, owner instance and generation. IDs are opaque ASCII tokens, not filesystem paths. Only root operator authority or a delegated parent authority may create children. A child's effective authority is the intersection of requested authority and parent authority. Profiles cannot widen it.

A registration is visible within its registration scope and descendants only, subject to grants and explicit provider policy. Parent and sibling access to descendant registrations is denied by default. Cross-scope sharing requires explicit parent-owned re-registration through a controlled proxy; it never changes the child's authority implicitly. Resolution selects within the consumer's ancestor chain.

## Destruction

Mark the subtree CLOSING atomically before cleanup: reject new registrations, child creation and calls. Cancel outstanding calls, invalidate generations, remove subscriptions/registrations, then dispose children before parents in reverse ownership order. Destruction is idempotent. Retained handles fail FAILED_PRECONDITION after destruction even if IDs are reused in later instances. A scope ID reuse MUST use a new generation; persistent handles are forbidden.

Managed resource cleanup guarantees apply only to effects registered through public ownership mechanisms. Direct OS effects by trusted in-process code are outside enforceable isolation and must be documented as a plugin compliance obligation. IPC process termination is the containment boundary for uncooperative isolated providers.


---

Source: `specs/ACAP-SECURITY-v1.md`

# ACAP-SECURITY-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Trust zones and grants

Trust zones: operator/host, Kernel, trusted in-process code, isolated local providers, untrusted input/artifacts. In-process plugin code can access process memory and OS privileges; ACAP grants are not a sandbox against malicious same-process code. Such code MUST NOT be described as untrusted/sandboxed. Isolated providers require OS-restricted identity, filesystem/network limits and no inherited secrets. Same-user processes without isolation do not provide a strong hostile-code boundary.

`grant.schema.json` expresses grantId, principal, scope, capability, exact permitted operations, issuedAtMs, expiresAtMs and revision. These are policy records, not bearer authorization just because the caller sends JSON. Kernel authenticates principal from its own context/IPC session, checks issuance authority, scope ancestry, operation membership, lifetime and current revocation revision. Wildcards and delegation are absent in v1. Grant validity is issuedAtMs <= now < expiresAtMs; expiry must be after issuance. Operator revocation increments authoritative revision; retained proxies and streams recheck it.

Profile requests are not grants. Policy is immutable to plugin code. Scope/authority propagation is constrained at every call; a provider receiving a request cannot impersonate caller authority on outbound calls. Outbound calls use its own principal unless a later explicit delegation contract is approved.

## Secrets and isolation

Secret identifiers are references, never values in manifests/profiles/locks. A grant must explicitly permit a declared secret reference; access is audited without value. Only local test secrets are used in Step 1. A returned secret cannot be erased from malicious trusted code; state this limitation. IPC providers receive only authorized per-call material, not a copy of all environment variables.

Malformed signatures, untrusted publishers, digest mismatches, stale metadata and trust overrides fail closed before code evaluation. Audit failure does not prevent emergency revocation. See trust policy for bootstrap/custody and threat model for host compromise limits.


---

Source: `specs/ACAP-TRANSPORT-INPROC-v1.md`

# ACAP-TRANSPORT-INPROC-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Data boundary

In-process transport must use the same public request/result schema validation, grant checks, deadlines, cancellation, error mapping and stream limits as IPC. It MUST NOT expose implementation objects or raw exception classes. Call input and output are detached JSON-compatible values; post-call mutation of caller objects cannot change provider input. Functions, prototypes, symbols and host objects are not ACAP values.

Every handle is bound to provider instance/generation and caller scope. Require/provide does not bypass policy on subsequent invocation. Reentrant nested calls inherit deadlines and use provider's own outbound authority. Provider choice is resolved once per handle, not dynamically based on load timing.

Trusted in-process code is cooperative. A blocked event loop cannot be forcibly cancelled by another callback; lifecycle timeout is a detection/reporting boundary and may require process restart. Unit tests must not claim that cancellation kills arbitrary same-process computation.


---

Source: `specs/ACAP-TRANSPORT-IPC-v1.md`

# ACAP-TRANSPORT-IPC-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## v1 local profile

Use local Unix-domain stream sockets with a 4-byte unsigned big-endian length prefix and UTF-8 JSON message. The length excludes the prefix and is 1..1048576. Reject length before allocating body; enforce frame and handshake timeouts. One accepted handshake per connection; require protocol version, Cell ID, provider instance, descriptor digests and a fresh supervisor-issued session challenge bound to the launched process/package. Read OS peer credentials and compare with the supervisor's expected identity. A self-reported providerId or shared socket access alone is not authentication. Exact OS isolation and peer-credential implementation are an ADR validation obligation before G6.

All frames are tagged: hello, accepted, request, response, error, cancel, stream-item, stream-credit, stream-end, event, ping, pong. Request IDs cannot be reused while outstanding. Caller identity is inserted by the trusted broker. Only the broker can issue consumer calls; provider-to-broker requests use provider authority. Unrecognized frame tags/fields close the session with a normalized error. A normative per-frame schema set MUST be added before implementing IPC; this phase freezes core envelope semantics, not a working transport.

Streams start with zero credit; receiver grants bounded item credit up to 256 outstanding items. Producer cannot send beyond credit, and total buffered bytes remain bounded. Cancellation closes delivery, releases credit and has one terminal outcome. Heartbeat interval defaults to 5 seconds, loss after 3 missed intervals; operator may tighten. Reconnect uses bounded exponential delay (1,2,4,8 seconds), at most four attempts, followed by FAILED; attempts are observable. A new session has a new generation and revalidates trust/grants. Outstanding calls fail UNAVAILABLE, never automatically replay. G6 must measure actual detection bounds under scheduling delay.


---

Source: `docs/adr/ADR-001.md`

# ADR-001: Runtime and public data model

Status: proposed; owner acceptance pending.

## Decision

Propose TypeScript and maintained pinned Node for production; JSON Schema 2020-12 plus constrained canonical JSON for public data. Existing Python/jsonschema is design tooling only.

## Alternatives and consequences

Rust/Go improve native isolation/tooling properties but add SDK interop work; Python simplifies prototyping but is not the proposed typed SDK runtime. Exact Node version is deferred to G2 after approval.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-002.md`

# ADR-002: Lean Kernel and reuse

Status: proposed; owner acceptance pending.

## Decision

Implement a minimal new Kernel; no mandatory Cordis or harness dependency.

## Alternatives and consequences

Reusing Cordis could reduce lifecycle code, but requires a clear trust/API fit and license review; no vendoring now.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-003.md`

# ADR-003: Trust zones

Status: proposed; owner acceptance pending.

## Decision

Inproc is trusted-only. IPC qualification must add OS-enforced restrictions; merely splitting processes under one user is not strong isolation.

## Alternatives and consequences

Universal sandboxed JS would introduce another complex trusted dependency. Untrusted native plugins cannot safely share the Kernel process.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-004.md`

# ADR-004: Capabilities and versions

Status: proposed; owner acceptance pending.

## Decision

Namespaced identity, strict MAJOR.MINOR.PATCH, immutable digest per version, explicit features/operations and deterministic numeric resolution.

## Alternatives and consequences

Arbitrary semver ranges and floating latest make exact selection harder to inspect. Initial v1 excludes prerelease/build variants.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-005.md`

# ADR-005: Scopes and grants

Status: proposed; owner acceptance pending.

## Decision

Ancestor-visible registrations, parent-bounded authority, per-call/stream revalidation, no delegation/wildcards in v1.

## Alternatives and consequences

Implicit inheritance of unrestricted authority or caller impersonation is rejected.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-006.md`

# ADR-006: Lifecycle and rebinding

Status: proposed; owner acceptance pending.

## Decision

Staged activation, explicit quiesce, reverse cleanup, immutable instance generation, no transparent provider rebinding.

## Alternatives and consequences

Automatic replacement may be added only with explicit consumer contracts; hiding it risks replay and authority changes.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-007.md`

# ADR-007: Events and streaming

Status: proposed; owner acceptance pending.

## Decision

Observation events only; bounded FIFO per source/subscription, explicit overflow; credit-based IPC streams.

## Alternatives and consequences

Waterfalls/durable brokers are unnecessary Kernel complexity. Durability belongs in a later provider.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-008.md`

# ADR-008: Trust and offline

Status: proposed; owner acceptance pending.

## Decision

Pinned operator root separate from bundles, signed canonical inventories, monotonic freshness, fail closed on stale trust.

## Alternatives and consequences

Accepting a co-packaged root without external authorization provides no publisher trust. Offline availability cannot waive expiry.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-009.md`

# ADR-009: Minimal durable state

Status: proposed; owner acceptance pending.

## Decision

Persist identity/trust/accepted profile and necessary lifecycle journal atomically; reconstruct live scopes/handles.

## Alternatives and consequences

General database not yet justified. Exact journal/restore transaction schema is required before packaging implementation.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-010.md`

# ADR-010: Platform and transport

Status: proposed; owner acceptance pending.

## Decision

Propose Ubuntu 24.04 amd64 first. Local UDS IPC is required second transport; containers only if justified separately.

## Alternatives and consequences

V1 Debian/Docker/hardware requirements are not inherited. Real clean-host qualification is still mandatory.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-011.md`

# ADR-011: License and source reuse

Status: proposed; owner acceptance pending.

## Decision

License choice remains owner decision. No third-party/V1 source copying in runtime.

## Alternatives and consequences

Reference concepts do not confer code licensing rights. Distribution/publication must wait for licensing decision.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-012.md`

# ADR-012: Acceptance and performance

Status: proposed; owner acceptance pending.

## Decision

SCHEMA/DESIGN results are distinct from runtime conformance. Measure baseline at G2 and approve numeric budgets before release qualification.

## Alternatives and consequences

Invented performance thresholds or passing fixed summary flags are not evidence.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.
