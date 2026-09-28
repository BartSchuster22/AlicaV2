# Working candidates v1 — normative draft semantics

Status: DRAFT, independent review required. metadata.maturity=proposed in a prepared file is not an approved proposal or admission. One capability acap://alica.io/memory/candidates@1; descriptor io.alica.memory.candidates. No broad memory family.

## Consumer and minimum

A project worker keeps a scoped active/working note with source provenance, retrieves it by stable ID, searches lexical text, then retrieves after native provider stop/start. Consumer imports only public SDK/Catalog. Existing opaque example.records lacks scope/provenance/candidate semantics and search; echo cannot persist. Exactly create/get/search, no generic dispatcher, patch/promote/supersede, canonical exchange, administrative maintenance or framework-memory integration.

## Authority and visibility

Host grants for each operation are necessary; operator mapping keyed by trusted OperationContext.caller establishes an independently restricted actor/root/permission set. Caller-provided scope is requested data target, never a grant or identity. The provider fails closed on absent/invalid map, and domain rechecks data authority each invocation. Payload cannot include actor, grant, permissions, role, lifecycle, write policy or author. No metadata-based authority or implicit admin fallback. Host scopes and data roots are distinct namespaces. Mapping must not silently attribute a framework actor as a human user.

Create needs memory.create-working and target equal/descendant of mapped root. It produces active/working, author_only, server-assigned rec_UUID and authenticated mapped author. It cannot create canonical truth. get/search need memory.read/memory.search respectively; effective scope must be within mapped root; eligible records have ancestor-or-equal visibility, role active and lifecycle working, not deleted. No public opt-in. Missing/hidden/ineligible direct ID is NOT_FOUND without existence disclosure. Search only includes eligible visible candidates. Current state is rechecked; a note promoted/archived through another authorized peer ceases to be a working candidate and get returns NOT_FOUND. This is deliberate slice semantics, not deletion of core history.

## Data/provenance

Schema is closed and bounded: title1..240, content1..8192, scope1..1000, sourceRefs0..8 strings1..512, provenance.source1..240. Source refs must be trimmed and control-free; source is asserted attribution, not authenticated truth. Scope syntax uses portable slash-separated level:value segments or explicit global/public vocabulary, but actual permission always constrains target; a narrow actor cannot obtain global authority by supplying that string. Author from trusted authority, never provenance.source. Duplicate source refs are not silently deduplicated. Stored provenance/source refs are preserved. No URI dereferencing, binaries or secrets.

Returned candidate is a named projection: id/scope/title/content/sourceRefs/provenance.source/author/version plus active/working literals. Other core metadata (e.g. tags/attrs/topic and additional provenance keys) is neither erased nor represented by this minimal contract; canonical exchange retains it. A candidate missing a required provenance.source cannot be fabricated: FAILED_PRECONDITION. A field outside projection bounds returns RESOURCE_EXHAUSTED; never truncate content/source refs or skip an otherwise eligible search hit silently. Existing role/state filters are not projection loss. Each operation returns only data authorized by the shared domain.

## Idempotency and persistence

create requires CallOptions.idempotencyKey trimmed8..200, passed unchanged to shared domain. Key domain is mapped actor across mutations; exact normalized request replay returns same stable ID/result, different request conflicts. Durable replay retained at least24h including normal restart; source implementation retains indefinitely absent explicit operator maintenance. Permission/scope are reevaluated before replay. Completed create survives ordinary stop/start with same explicitly selected store. No authority to prune/repair production or copy DB.

No implicit retry. On crash/deadline/cancellation after admission outcome may be ambiguous; use original key/actor/request for explicit replay, never a new key to approximate retry. Cancellation is bounded stop/reap, not transaction rollback assurance. Store transactional atomicity and ambiguous replay will be demonstrated in implementation conformance before EXPERIMENTAL admission; neutral echo proof cannot establish it.

## Retrieval

get input scope+stable id. Search input scope/query1..500/limit1..25/cursor0..4096; empty cursor means first page, empty nextCursor means exhausted. Opaque cursors are bound to all filters, query, scope and ordering; they confer no authority. Same query need not have provider-independent ranking. A provider without available retrieval returns failure, not successful empty list. Query uses provider's governed lexical semantics, no embedding/ranking promise. Search emits durable actor-attributed retrieval evidence through shared domain. Source retrieval score is intentionally not in portable capability output. Concurrent changes between pages follow existing cursor semantics; search pages do not constitute canonical consistent export.

## Errors and bounds

INVALID_ARGUMENT malformed schema/value/cursor; UNAUTHENTICATED invalid trusted execution identity; PERMISSION_DENIED no Host grant/data authority; NOT_FOUND absent/hidden/ineligible get; CONFLICT durable key/request conflict; FAILED_PRECONDITION absent key or nonrepresentable required semantic field; RESOURCE_EXHAUSTED size/admission bound; UNAVAILABLE process/storage/dependency failure; CANCELLED and DEADLINE_EXCEEDED as applicable. Provider does not return SQL, paths, secrets, stack traces or denied object content. Startup failures stay lifecycle failures; no successful empty memory recovery.

The eventual product bridge may require a larger fixed frame bound than neutral echo's16KiB because schema permits bounded search collections; document and test exact request/response byte and concurrency/deadline limits before admission. No generic RPC/public binding, new grant type, registry or supervisor is authorized. Frozen Foundation public-host-inproc-v1 remains selected.

## Independent review / admission

Review scope: need/minimal abstraction, authority/security, scopes, compatibility; no self-review. Existing reviewProposal result PROPOSED after distinct accepted review. Passing implementation/failure/consumer conformance with exact hashes plus owner-matching local maintainer transition is separately required for EXPERIMENTAL. Scoped snapshot only, original Catalog entries untouched, trustVerified=false. Review does not grant runtime credentials, owner acceptance or production cutover.
