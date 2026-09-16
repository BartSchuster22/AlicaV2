# ALICA V2 — G1 completed review package

Technical delivery complete; owner acceptance pending. Source paths below are authoritative.

Source: `docs/gates/G1.md`

# G1 — Normative design and threat model

**Technical deliverables complete. G1 EXIT: OWNER ACCEPTANCE PENDING.**

## Entry

G0 accepted for progression based on the owner's instruction to complete dependent Phase 1; exact basis is recorded in `docs/decisions/G0-ACCEPTANCE.md`. The V1 reference-only review boundary is unchanged.

## Delivery

- Minimum core specification set plus a normative completion document and public provider/transport interfaces with dependency diagram.
- 18 JSON Schema 2020-12 documents and corresponding positive fixtures.
- 12 ADRs with technically resolved baseline decisions, explicit threat model/TCB/host assumptions and six traceable author design reviews.
- Executable positive/negative design validation, independent canonical digest vectors, Ed25519 signature checks and hash-bound VPS evidence.

Start with `specs/ALICA-NORMATIVE-BASELINE-v1.md`, then `specs/ALICA-PUBLIC-INTERFACES-v1.md`, `docs/gates/G1-REVIEW.md` and `docs/architecture/THREAT-MODEL.md`. The completion clauses resolve ambiguities in the initial draft; they explicitly take precedence where older prose is less specific.

## Verification

Run `python3 -m unittest discover -s tests/design -p 'test_*.py' -v`.

Executed results and exact input hashes are in `evidence/g1/execution.json` and `design-tests.txt`; earlier evidence is preserved under `evidence/g1/initial/`, not rewritten as if it were current. Tests exercise schemas and illustrative semantic models, not runtime enforcement. Ed25519 and OpenSSL verification are real cryptographic executions, using ephemeral in-memory private keys.

## Exit conditions

| Condition | State |
|---|---|
| Provider-facing contracts without Kernel internals | Delivered in specifications, schemas and public-interface document |
| Blocking security questions have explicit decisions | Resolved in baseline, ADRs and threat model |
| Required six reviews completed | Completed as author reviews, not independent sign-off |
| Executable schema/conformance design vectors | Executed; see hash-bound evidence |
| Owner accepts exact normative baseline | **Pending** |

G1 must not be marked PASS until owner acceptance is recorded. No production Kernel, ACAP runtime, SDK, migrated service or transport implementation was built. G2 and later work have not begun.

IPC frame schemas and OS isolation details must be reviewed before G6 implementation; durable journal/restore layout before its implementation. Cross-language encoding checks, real load/unload and recovery, two-host offline acceptance, production key custody/license and measured performance remain later mandatory qualifications. These are not permission to weaken core semantics.


---

Source: `docs/gates/G1-REVIEW.md`

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


---

Source: `docs/architecture/THREAT-MODEL.md`

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


---

Source: `specs/ALICA-NORMATIVE-BASELINE-v1.md`

# ALICA-NORMATIVE-BASELINE-v1 — G1 completion clauses

Status: technically resolved baseline candidate; owner EXIT acceptance pending. This document is normative alongside the core specifications. It resolves the ambiguities of the initial draft; where older prose conflicts, these explicit completion clauses govern. No production runtime is claimed.

## 1. Version and feature negotiation

The candidate's **contract** version is matched, not the plugin package version. Each version component is an integer 0..2147483647. A requirement has exact `major`, inclusive `minMinor`, optional inclusive `maxMinor` (omission means unbounded within the major), required `operations`, required `features`, and optional `optionalFeatures` (omission means empty). An inverted range or overlap between required/optional feature lists is invalid. Required features must all exist; optional negotiated features are the intersection. Optional features do not affect ranking. A provider MUST NOT enable an absent feature implicitly. Allowed patch versions are any within the accepted minor interval; locks pin the exact accepted version/digest.

`requires` are activation dependencies. `optionalRequires` do not create activation edges and are resolved only while the consumer is ACTIVE. `ctx.optional` returns null for no eligible compatible provider, never for denied authority. An explicit pin that is unavailable produces an error even for an optional lookup. Mandatory and optional lists cannot repeat the same capability ID; duplicate provided ID/version is also invalid.

Within the visible trusted catalog, two declarations with the same capability ID/version but different descriptor digests are a CONTRACT_MISMATCH, even if one would lose ranking. Immutable contract identities cannot be resolved by choosing whichever registration arrived first. The resolver separately rejects duplicate provider identities. The implementation must validate accepted compatibility claims and cannot prove semantic compatibility from version syntax alone.

## 2. Payload schemas and limits

Schema validation MUST be followed by semantic validation. `required` names must exist in `properties`; min/max pairs must be consistent; keywords must be appropriate to declared type. Object-only: properties/required/additionalProperties; array-only: items/minItems/maxItems; string-only: minLength/maxLength; integer-only: minimum/maximum. `enum` has unique canonical values satisfying the declared type/constraints; `const` must satisfy type/constraints and enum when both present. Unknown fields fail closed. The public payload subset does not contain external `$ref`, regex, executable expressions or floating-point values.

Global values: integer safe range, ASCII object keys, valid Unicode scalar string values. C0 controls use short JSON escapes where defined and lower-case hex otherwise. DEL U+007F is emitted literally, not escaped; `/`, U+2028/U+2029 and non-ASCII Unicode scalars remain literal. This detail is covered by independent canonicalizers because Python's JSON emitter escapes DEL by default. Object key order is ASCII lexicographic; string lengths count Unicode scalars, not UTF-16 code units. The depth limit is 32 (root depth zero); reject encoded input >1048576 bytes and enforce structure limits before unbounded work. Design decoders are not production bounded-stream parsers.

Descriptor/profile/policy/event/package-index/lock digests hash canonical JSON bytes. Artifact inventory `digest` hashes **raw file bytes**, including whitespace/newline. Executable package identity is the canonical digest of `package-index.schema.json`, whose inventory binds raw bytes for manifest/descriptors/code. A package index excludes itself, profile, lock, bundle and detached signatures to avoid cycles. A bundle may include the package-index raw bytes, while profile references its canonical digest. This separation is mandatory.

## 3. Lifecycle and dependency loss

Legal transitions: DISCOVERED -> VERIFIED|FAILED; VERIFIED -> RESOLVED|FAILED; RESOLVED -> ACTIVATING|FAILED; ACTIVATING -> ACTIVE|FAILED; ACTIVE -> QUIESCING; QUIESCING -> DISPOSED|FAILED. FAILED and DISPOSED are terminal. A fresh instance must get a fresh instanceId/generation. Repeated dispose on a terminal instance returns its already recorded cleanup outcome; it MUST NOT falsely turn FAILED cleanup into successful DISPOSED.

Stage registrations invisibly until activation succeeds. On failure, invalidate all staged handles immediately and attempt every disposer in reverse acquisition order; record partial cleanup failures. A mandatory provider entering QUIESCING/FAILED or losing trust causes dependent consumers to stop admitting new calls and quiesce, recursively across the dependency DAG. Outstanding calls are cancelled at the configured deadline. No implicit fallback/rebind. Optional provider loss invalidates only its bound handles and need not terminate the consumer. Destroyed scopes revoke authority before disposal. No new calls are permitted once CLOSING/QUIESCING is committed.

## 4. Policy records and resource access

Capability, secret and event grants are different closed record types. All bind principal **and instanceId**, scope **and scopeGeneration**, issue/expiry times and revocation revision. Scope IDs and plugin names are never sufficient to revive authority after restart. Kernel-issued records come only from authenticated operator policy; plugins cannot issue or edit them. Operator is the sole grant issuer in v1; parent context can request child scope creation but cannot delegate greater authority or mint grants. Grant records are authoritative local policy data, not bearer credentials supplied by consumers.

A call/read/event action requires a grant bound to the caller's exact scope/generation and current instance, and parent-authority intersection at issuance. Visibility may extend from ancestor registrations; this does not make grants ambient. Current revision must exactly match the authoritative record, which must not be revoked; compare issuedAt <= now < expiresAt. Check on dispatch, before unary result delivery and each stream/event delivery. Revocation while work runs prevents subsequent result delivery but does not undo performed side effects.

`secret-grant` permits only `read` on exactly one declared reference. `event-grant` grants publish/subscribe for exactly one event type. Capability grants never imply either. The manifest's secretReferences is an allowlist request; it grants nothing alone. Event source metadata comes from the broker, and its descriptor digest binds the separate event-descriptor. No caller may claim another sourceScope/provider.

## 5. Calls, cancellation and idempotency

`call.schema.json` is user data with no identity assertion. `response.schema.json` has exactly one success/error result. The broker assigns trusted routing metadata out of band; it is not a consumer-controlled property. Unary calls yield one terminal response. Streams yield zero or more validated items followed by exactly one success-end or error-end; a stream success does not additionally return a unary value. Use stream iterator completion for success-end. Terminal transitions are atomic: first committed outcome wins; discard late values.

Default maximum request lifetime is 30000 ms, operator-adjustable downward for qualification. Effective deadline is minimum(request deadline, parent deadline, admission time + policy maximum). Recheck at dispatch; expiration before dispatch means no provider invocation. Explicit cancellation is idempotent and emits CANCELLED only if it wins the terminal race. Deadline expiration emits DEADLINE_EXCEEDED. Provider loss emits UNAVAILABLE. Do not label cancellation as rollback. Authorized scopes/grants and result schemas are rechecked before any value becomes visible.

`idempotency=provider` requires retentionMs and persistence (`instance` or `durable`). Keys are scoped to (caller principal, scope generation, provider capability ID, operation, key). The same key and canonical payload replays the recorded outcome within retention; changed payload is CONFLICT. A concurrent duplicate returns CONFLICT while the first attempt is in flight; no second side effect. Instance persistence resets on instance replacement and must never imply crash-safe retry. Durable persistence is a provider responsibility and requires real durability tests before it is advertised. Streaming idempotency is excluded in v1. `none` rejects a supplied idempotency key. No transport auto-replays calls.

## 6. Profiles, package identities and trust

Profiles declare one logical root scope (`parent:null`) and acyclic children; exactly one instance of each plugin ID is selected in v1. All selected plugins initially activate in that logical root unless a later profile version adds explicit placement. Runtime child scopes are created using the public scope API. Pins name selected plugin IDs. Lock bindings have capability `version` and separate `providerVersion`; packageDigest must match the selected provider package. Sort plugins by ID and bindings by (scope,consumerId,capabilityId). Duplicate bindings are invalid. Never put Cell identity/secrets in portable locks.

V1 trust policy has exactly one operator root key; threshold trust is not half-implemented. Policy has monotonic version, issuedAtMs and expiresAtMs with expiry strictly later. Root rotation schema binds prior/next policy versions/digests and old/new key IDs; nextVersion=priorVersion+1. Both old and new roots sign the rotation record in `ALICA-ROOT-ROTATION-v1\n` domain. A fresh next policy must be signed by its new root in the policy domain, whose digest exactly matches the rotation record; old root authorizes transition through the old-root rotation signature. Unrelated valid keys are insufficient. Private keys never enter the repository.

Revocation metadata is root-signed in `ALICA-REVOCATION-v1\n`, monotonically versioned, with an issue/expiry interval and lists of revoked publisher key IDs/artifact digests. IssuedAt may not be in the future. At activation/delivery require current time before policy/revocation expiry and age <= maxOfflineAgeMs; a backward wall-clock step invalidates freshness until operator clock recovery. Persist last accepted versions/high-water times atomically. Missing required metadata denies activation. A first disconnected install must have locally verifiable root/policy/revocation material, not an online lookup. Running instances whose trust expires quiesce and stop new calls/delivery immediately; cleanup remains bounded.

No automatic recovery from lost root is possible without separately provisioned recovery authority. Operator must restore verified backups/keys or create a new Cell identity and re-approve artifacts; never silently accept a replacement root. Exact durable journal layout and IPC framing remain later-phase details; these authority/compatibility rules cannot be relaxed by them.

## 7. Runtime decision and deferred implementation details

ADR-001 selects TypeScript source targeting a maintained Node.js LTS release for production; exact supported major/patch, verification and lockfile are chosen at G2 from live upstream support data before installing. No Node version or toolchain is claimed installed in G1. Python 3/jsonschema/cryptography and OpenSSL already available on the development host run design checks only, not production dependencies. No Cordis/harness/database/container stack is adopted.

The G1 decisions are technically resolved recommendations submitted together for owner acceptance. Owner acceptance is not fabricated by an agent author review. License, release-key custody and final numerical performance budgets remain later gate obligations, not provider contract ambiguities.

## 8. Event declaration and instance continuity

PluginManifest contains explicit publishedEvents and subscribedEvents descriptor bindings (eventType, version, descriptorDigest, descriptorPath). Empty means no such declarations. Duplicate event types per direction are invalid. The loader checks binding/content identity, version and digest before activation; subscriptions require the exact declared event descriptor digest in v1. Publishing and subscriptions are still separately grant-controlled. Context.on/emit use those verified manifest bindings; an undeclared type is denied. No ad-hoc event descriptor registry mutation API is exposed.

Event envelopes include broker-authenticated sourceInstanceId and scopeGeneration. Sequence is monotonically increasing within that instance, starting at 1; identity changes on restart. It is not a durable offset. Exact envelope binding prevents mistaking a restarted source for continuity. Registration visibility follows the ancestor-only rule; grant checks alone cannot widen visibility.


---

Source: `specs/ALICA-PUBLIC-INTERFACES-v1.md`

# ALICA-PUBLIC-INTERFACES-v1

Status: normative candidate; owner acceptance pending. These are interface contracts, not implementations. JSON descriptors/schemas remain language-neutral.

## Public dependency diagram

```text
schemas / acap-types (no Kernel import)
          ^          ^
          |          |
 provider-sdk    consumer-sdk
          ^          ^
          |          |
 provider A/B    consumer plugin
          \          /
           plugin-sdk -> public KernelContext interface
                              ^
                              | implements
                           Kernel
                              |
                              v
                    public TransportAdapter interface
                       ^                  ^
                       | implements       | implements
                    inproc             local IPC
```

Kernel may import public types/schema validation, not provider implementations. SDKs may import only public contracts, not Kernel internals. Transport implementations may share validation utilities, not bypass the broker's authorization. No V1/framework/application dependency exists in the normative graph.

## Language-neutral operations

- Bootstrap(config) -> Host: config contains locally provisioned identity, immutable policy and bounded operational limits, not untrusted profile overrides.
- Host.plan(profile) -> ResolutionLock + safe explanations; no mutation.
- Host.activate(pluginId, logicalScope) -> PluginInstance snapshot; async, fails with normalized error and cleanup report.
- Host.quiesce/dispose/destroyScope/shutdown -> CleanupReport; bounded by policy.
- Host.inspect(query) -> redacted immutable snapshot; operator-authorized only.
- Host.issueGrant(record)/revokeGrant(id)/createScope(parent,owner) -> operator-policy action with audit and parent bounds.
- Context.provide(descriptor, handlers) -> async disposer; exactly one handler per declared operation, no extra exports; staged before ACTIVE.
- Context.require(requirement) -> async BoundCapability proxy.
- Context.optional(requirement) -> async BoundCapability|null under the specified absence/denial rules.
- Context.effect(acquire) -> scoped resource; acquire receives registerCleanup so partial acquisition registers cleanup before publication.
- Context.secret(ref) -> async authorized secret value; never ambient credentials.
- Context.on(type,handler) -> disposer; Context.emit(type,data) -> delivery-admission result, not durable acknowledgement.
- Context.createScope() -> restricted child context; cannot mint operator grants.

## TypeScript-shaped provider/transport surface

```typescript
type Value = null | boolean | number | string | Value[] | { [key: string]: Value };
// number is constrained by runtime validation to safe integers; types alone are insufficient.
type Disposer = () => Promise<void>;
interface OperationContext {
  readonly requestId: string;
  readonly deadlineMs: number;
  readonly signal: AbortSignal;
  // Read-only authenticated caller summary; cannot be reused as delegated authority.
  readonly caller: Readonly<{principal: string; instanceId: string; scope: string}>;
}
type UnaryHandler = (input: Value, context: OperationContext) => Promise<Value>;
type StreamHandler = (input: Value, context: OperationContext) => AsyncIterable<Value>;
interface BoundCapability {
  readonly descriptorDigest: string;
  readonly negotiatedFeatures: readonly string[];
  call(operation: string, input: Value, options: CallOptions): Promise<Value>;
  stream(operation: string, input: Value, options: CallOptions): AsyncIterable<Value>;
}
interface CallOptions { deadlineMs: number; signal?: AbortSignal; idempotencyKey?: string }
interface TransportAdapter {
  // Broker constructs authenticated immutable binding; consumer cannot create one.
  connect(binding: VerifiedBinding): Promise<TransportSession>;
}
interface TransportSession {
  invoke(request: CallEnvelope): Promise<ResponseEnvelope>;
  stream(request: CallEnvelope): AsyncIterable<Value>;
  cancel(requestId: string): Promise<void>;
  close(reason: string): Promise<void>;
}
```

CallEnvelope/ResponseEnvelope are their closed JSON schemas. VerifiedBinding is host-only: Cell identity, expected process/provider instance, package/descriptor digests, authenticated endpoint and immutable caller-policy binding. It is deliberately not a consumer-deserializable token. CleanupReport contains terminal state, completed disposers, failed disposers (redacted error codes), timed-out resources and restartRequired; failure MUST remain visible. No signature, secret or grant value is exposed through a proxy.

## Transport invariants

Both transports deep-detach public data, enforce identical input/output schema and value restrictions, propagate effective deadline/cancellation and emit the same normalized error. IPC authenticates provider through supervisor/OS-bound identity; inproc trusts code execution, not data assertions. No automatic retry/rebind, no raw exception or object reference across ACAP. Streaming item schema applies per item; iterator terminal behavior follows core. IPC frame encodings may be extended at G6 without changing these semantics. A provider author implements descriptor plus handlers and disposer; no Kernel internals are required.


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

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.


---

Source: `specs/ACAP-ERRORS-v1.md`

# ACAP-ERRORS-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Envelope and codes

`error.schema.json` defines `{code,message,retryable,correlationId}` with no arbitrary stack/data field. Messages MUST be redacted. Stable codes: INVALID_ARGUMENT, UNAUTHENTICATED, PERMISSION_DENIED, NOT_FOUND, INCOMPATIBLE_VERSION, CONTRACT_MISMATCH, CONFLICT, DEADLINE_EXCEEDED, CANCELLED, UNAVAILABLE, RESOURCE_EXHAUSTED, FAILED_PRECONDITION, INTERNAL.

Malformed values -> INVALID_ARGUMENT; valid but unsupported version -> INCOMPATIBLE_VERSION; signature/digest mismatch -> CONTRACT_MISMATCH at the trusted boundary; denied/expired/revoked authority -> PERMISSION_DENIED; stale instance -> FAILED_PRECONDITION; lost process -> UNAVAILABLE; bounded queue exhaustion -> RESOURCE_EXHAUSTED. Raw exceptions map to INTERNAL with a safe message. Hidden capability details MUST NOT be disclosed; permission denial precedes catalog detail disclosure.

`retryable` is an advisory condition, never permission for automatic replay. Only UNAVAILABLE and RESOURCE_EXHAUSTED may be marked retryable in v1; operation idempotency still controls whether caller retries. A deadline/cancel race produces one terminal outcome: the first transition committed by the broker; late responses are discarded. Each transport MUST expose the same ACAP code for equivalent failures. Local stack traces remain in a separately protected diagnostic channel only if redacted.

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.


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

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.


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

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.


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

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.


---

Source: `specs/ACAP-TRANSPORT-INPROC-v1.md`

# ACAP-TRANSPORT-INPROC-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Data boundary

In-process transport must use the same public request/result schema validation, grant checks, deadlines, cancellation, error mapping and stream limits as IPC. It MUST NOT expose implementation objects or raw exception classes. Call input and output are detached JSON-compatible values; post-call mutation of caller objects cannot change provider input. Functions, prototypes, symbols and host objects are not ACAP values.

Every handle is bound to provider instance/generation and caller scope. Require/provide does not bypass policy on subsequent invocation. Reentrant nested calls inherit deadlines and use provider's own outbound authority. Provider choice is resolved once per handle, not dynamically based on load timing.

Trusted in-process code is cooperative. A blocked event loop cannot be forcibly cancelled by another callback; lifecycle timeout is a detection/reporting boundary and may require process restart. Unit tests must not claim that cancellation kills arbitrary same-process computation.

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.


---

Source: `specs/ACAP-TRANSPORT-IPC-v1.md`

# ACAP-TRANSPORT-IPC-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## v1 local profile

Use local Unix-domain stream sockets with a 4-byte unsigned big-endian length prefix and UTF-8 JSON message. The length excludes the prefix and is 1..1048576. Reject length before allocating body; enforce frame and handshake timeouts. One accepted handshake per connection; require protocol version, Cell ID, provider instance, descriptor digests and a fresh supervisor-issued session challenge bound to the launched process/package. Read OS peer credentials and compare with the supervisor's expected identity. A self-reported providerId or shared socket access alone is not authentication. Exact OS isolation and peer-credential implementation are an ADR validation obligation before G6.

All frames are tagged: hello, accepted, request, response, error, cancel, stream-item, stream-credit, stream-end, event, ping, pong. Request IDs cannot be reused while outstanding. Caller identity is inserted by the trusted broker. Only the broker can issue consumer calls; provider-to-broker requests use provider authority. Unrecognized frame tags/fields close the session with a normalized error. A normative per-frame schema set MUST be added before implementing IPC; this phase freezes core envelope semantics, not a working transport.

Streams start with zero credit; receiver grants bounded item credit up to 256 outstanding items. Producer cannot send beyond credit, and total buffered bytes remain bounded. Cancellation closes delivery, releases credit and has one terminal outcome. Heartbeat interval defaults to 5 seconds, loss after 3 missed intervals; operator may tighten. Reconnect uses bounded exponential delay (1,2,4,8 seconds), at most four attempts, followed by FAILED; attempts are observable. A new session has a new generation and revalidates trust/grants. Outstanding calls fail UNAVAILABLE, never automatically replay. G6 must measure actual detection bounds under scheduling delay.

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.


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

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.


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

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.


---

Source: `specs/ALICA-PLUGIN-MANIFEST-v1.md`

# ALICA-PLUGIN-MANIFEST-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Manifest semantics

`plugin.schema.json` defines data-only plugin metadata: plugin ID/version, publisher, execution mode, relative entrypoint, provided descriptor bindings, required capabilities, requested secret references. All mandatory declarations must be present; an empty list means none, not unrestricted permission. Provided binding includes capabilityId, version, descriptorDigest and relative descriptorPath. The descriptor document remains a separate immutable artifact. Resolution rejects declaration/content mismatches.

The manifest does not include its own package digest, avoiding circular hashes. A signed bundle inventory binds manifest, descriptors and code artifacts by path/length/digest. The loader verifies signature against operator policy, then verifies all bytes before interpreting code. Signature validity does not make a publisher trusted automatically.

Entrypoints and descriptor paths are relative slash-separated safe components, no `.`/`..`, absolute paths, backslashes or executable interpolation. Symlinks escaping staging and duplicate archive paths are rejected. Execution mode is `inproc` or `ipc`; mode selection is trust-policy-constrained, never a plugin escape hatch. Required capability requirements are checked before ACTIVE. Secret declarations request permission but do not grant it.

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.


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

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.


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

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.


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

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.


---

Source: `docs/adr/ADR-001.md`

# ADR-001: Runtime and public data model

Status: technical decision resolved for G1 baseline; owner acceptance pending.

## Decision

Select TypeScript and a maintained Node LTS release, pinned at G2, for production; JSON Schema 2020-12 plus constrained canonical JSON for public data. Existing Python/jsonschema is design tooling only.

## Alternatives and consequences

Rust/Go improve native isolation/tooling properties but add SDK interop work; Python simplifies prototyping but is not the proposed typed SDK runtime. Exact Node version is deferred to G2 after approval.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-002.md`

# ADR-002: Lean Kernel and reuse

Status: technical decision resolved for G1 baseline; owner acceptance pending.

## Decision

Implement a minimal new Kernel; no mandatory Cordis or harness dependency.

## Alternatives and consequences

Reusing Cordis could reduce lifecycle code, but requires a clear trust/API fit and license review; no vendoring now.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-003.md`

# ADR-003: Trust zones

Status: technical decision resolved for G1 baseline; owner acceptance pending.

## Decision

Inproc is trusted-only. IPC qualification must add OS-enforced restrictions; merely splitting processes under one user is not strong isolation.

## Alternatives and consequences

Universal sandboxed JS would introduce another complex trusted dependency. Untrusted native plugins cannot safely share the Kernel process.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.

## Host security decision

OS process separation under the same UID is not malicious-provider isolation. The G6 implementation must use distinct restricted OS identity or another reviewed OS-enforced boundary. If privileged provisioning is unavailable, hostile-plugin isolation stays BLOCKED; cooperative IPC may still be tested, never mislabelled sandboxed.


---

Source: `docs/adr/ADR-004.md`

# ADR-004: Capabilities and versions

Status: technical decision resolved for G1 baseline; owner acceptance pending.

## Decision

Namespaced identity, strict MAJOR.MINOR.PATCH, immutable digest per version, explicit features/operations and deterministic numeric resolution.

## Alternatives and consequences

Arbitrary semver ranges and floating latest make exact selection harder to inspect. Initial v1 excludes prerelease/build variants.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-005.md`

# ADR-005: Scopes and grants

Status: technical decision resolved for G1 baseline; owner acceptance pending.

## Decision

Ancestor-visible registrations, parent-bounded authority, per-call/stream revalidation, no delegation/wildcards in v1.

## Alternatives and consequences

Implicit inheritance of unrestricted authority or caller impersonation is rejected.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-006.md`

# ADR-006: Lifecycle and rebinding

Status: technical decision resolved for G1 baseline; owner acceptance pending.

## Decision

Staged activation, explicit quiesce, reverse cleanup, immutable instance generation, no transparent provider rebinding.

## Alternatives and consequences

Automatic replacement may be added only with explicit consumer contracts; hiding it risks replay and authority changes.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-007.md`

# ADR-007: Events and streaming

Status: technical decision resolved for G1 baseline; owner acceptance pending.

## Decision

Observation events only; bounded FIFO per source/subscription, explicit overflow; credit-based IPC streams.

## Alternatives and consequences

Waterfalls/durable brokers are unnecessary Kernel complexity. Durability belongs in a later provider.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-008.md`

# ADR-008: Trust and offline

Status: technical decision resolved for G1 baseline; owner acceptance pending.

## Decision

Pinned operator root separate from bundles, signed canonical inventories, monotonic freshness, fail closed on stale trust.

## Alternatives and consequences

Accepting a co-packaged root without external authorization provides no publisher trust. Offline availability cannot waive expiry.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-009.md`

# ADR-009: Minimal durable state

Status: technical decision resolved for G1 baseline; owner acceptance pending.

## Decision

Persist identity/trust/accepted profile and necessary lifecycle journal atomically; reconstruct live scopes/handles.

## Alternatives and consequences

General database not yet justified. Exact journal/restore transaction schema is required before packaging implementation.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-010.md`

# ADR-010: Platform and transport

Status: technical decision resolved for G1 baseline; owner acceptance pending.

## Decision

Propose Ubuntu 24.04 amd64 first. Local UDS IPC is required second transport; containers only if justified separately.

## Alternatives and consequences

V1 Debian/Docker/hardware requirements are not inherited. Real clean-host qualification is still mandatory.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-011.md`

# ADR-011: License and source reuse

Status: technical decision resolved for G1 baseline; owner acceptance pending.

## Decision

License choice remains owner decision. No third-party/V1 source copying in runtime.

## Alternatives and consequences

Reference concepts do not confer code licensing rights. Distribution/publication must wait for licensing decision.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.


---

Source: `docs/adr/ADR-012.md`

# ADR-012: Acceptance and performance

Status: technical decision resolved for G1 baseline; owner acceptance pending.

## Decision

SCHEMA/DESIGN results are distinct from runtime conformance. Measure baseline at G2 and approve numeric budgets before release qualification.

## Alternatives and consequences

Invented performance thresholds or passing fixed summary flags are not evidence.

## Verification

See the normative specifications, design fixtures and gate test catalog. Design tests do not demonstrate an implemented runtime.
