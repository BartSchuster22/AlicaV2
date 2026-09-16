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
