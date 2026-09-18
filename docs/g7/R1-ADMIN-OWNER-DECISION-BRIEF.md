# R1 admin protocol: two owner decisions required

Status: PROPOSAL ONLY. Neither option selection nor a frozen-contract amendment is approved by this document. Implementation authorization is not permission to change R1 framing, schemas or ceilings. The current restricted transport is NOT declared fully R1-conformant.

Baseline: `59f5eef3bf792d89a7193d753df0a85158a9a62c`. Sources: R1-OWNER-APPROVAL; CONTRACT-REVIEW-R1 sections Supervisor and authorization / Durable selection; frozen `draft/contracts.schema.json` definitions adminRequest/adminResponse; frozen `draft/limits.json`; R1-SUPERVISION-PARENT-REVIEW and PARENT-EXECUTION. No frozen file is edited here.

## Decision A — when is a request sealed?

Frozen wording: four-byte unsigned big-endian byte length plus UTF-8 closed-schema JSON; no trailing frames; one request/response per connection. It does not require request write-half-close. Current code waits for EOF before dispatch, because a complete frame followed later by another byte cannot be retrospectively rejected before a stop/start side effect.

A client that writes only length+body and waits for its response is normal under length-framing alone, but currently times out at the existing 30000 ms connection ceiling without dispatch. A client using `shutdown(SHUT_WR)` / Node `socket.end(frame)` works. A full socket close is NOT equivalent: the client must retain its read side to receive the response. An EOF before the declared body completes is invalid, not permission to dispatch.

These two strong requirements cannot both hold without an explicit sealing signal: (1) respond/execute immediately after a complete frame while the peer keeps writing open; (2) reject ANY future trailing byte before executing. A grace period does not solve this and would invent an unapproved delay/ceiling.

### A1 — explicit EOF sealing (recommended conservative option)

Exact proposed normative addition to CONTRACT-REVIEW-R1 framing paragraph:

> A request is sealed only by write EOF after exactly one complete length-prefixed body. The client MUST half-close its sending direction and retain its receiving direction. The server MUST NOT dispatch before EOF; incomplete, additional or trailing bytes invalidate the request without dispatch. The existing connection deadline runs from admission, is not reset by bytes or EOF, and closes an unsealed connection without executing the request. The server sends at most one response frame, then closes. Connection loss after dispatch is not cancellation or rollback.

JSON schema change: none. Numeric limits: none. Compatibility: existing half-closing clients work; send-and-wait clients must change. Therefore this is an explicit transport requirement/amendment, not a claim that it was already frozen. Invalid/unsealed transport disposition without a response must be approved alongside this wording rather than inventing a requestId or selection.

### A2 — dispatch on full length-framed body

Exact alternative semantic change:

> The first complete valid length-prefixed request may be dispatched immediately. No subsequent request is accepted on that connection. Bytes beyond the first body are protocol violations; detecting them closes the connection but cannot cancel or roll back an already dispatched operation. Rejection before dispatch is guaranteed only for trailing bytes already observed before dispatch.

JSON schema and ceilings: unchanged. Compatible with both send-and-wait and half-closing clients. However it weakens the existing candidate's pre-effect trailing-data rejection guarantee. The owner must explicitly approve this interpretation of “no trailing frames”; a late second frame cannot be promised to prevent the first mutation. Client timeout/transport error continues to require fresh status, not automatic mutation replay.

### A3 — new end marker / two-message prepare-confirm exchange

Not a minimal R1 clarification: changes request grammar, one-request-per-connection semantics, state handling, and likely schema/version negotiation. It cannot be implemented under the current approval. No extra timeout, retry authority or protocol is proposed for this checkpoint. Prefer A1 or A2 unless the owner specifically commissions a new version.

### Required tests after an A decision

Real Unix sockets, actual credentials and unchanged limits: split headers/body at every boundary; UTF-8 byte-length versus character count; exact 65536-byte ceiling and overflow; zero/short body; duplicate keys, deep/unsafe-number/invalid-Unicode bodies; unknown fields; simultaneous requests up to eight connections; slow/unsealed request reaches 30000 ms without resetting the budget; wrong incarnation/sequence cannot mutate. Keep existing process/Cell regressions.

A1-specific: a valid unsealed stop/start produces no effect; delayed trailing byte or second frame followed by EOF produces no effect; half-close yields one response after actual operation outcome; disconnect after dispatch does not authorize rollback/retry. A2-specific: a complete frame without EOF receives a response; delayed trailing bytes never execute a second mutation; tests explicitly permit the first operation to have happened, and never assert rollback. Test both data coalescing and delayed delivery, not just two frames in one write.

## Decision B — unknown accepted sequence/digest

Frozen response requires `sequence` to be an integer in [0, 9007199254740991] and requires `acceptedDigest` to be a digest or null. Zero/null can truthfully mean KNOWN no accepted revision. Null digest cannot mean “unknown” without changing that meaning. No field represents knowledge state, and additional fields are forbidden.

Example: an owner blocks/dies during accepted replacement or directory fsync. The independent custodian cannot know which selection is durable merely from the last snapshot, exit, a PID or residue. Synchronously rereading uncertain storage could block the custodian itself and still would not prove durability. The current implementation closes without a response when it has no valid selection snapshot and retains its fence. During successor validation failure the new bounded start path is also deliberately conservative: if validation did not complete, it abandons the cached selection response rather than asserting it as freshly verified. This is a restricted error path, not general frozen-response conformance.

Do not use sequence=0/null, a stale digest, a request's expectedSequence, -1, omission, or a private extension as a stand-in for unknown. A checksum/marker is not a selection durability or death certificate.

### B1 — explicit unknown via null sequence (recommended if structured errors are required)

Minimal shape proposal for a versioned response, not an applied patch:

- New `schemaVersion` constant `alica.cell-admin-response/v2` in a separate approved response definition; leave v1 closed and unchanged.
- Change only the new response's sequence rule to `anyOf` the existing bounded integer rule and `{ "type": "null" }`.
- Add a conditional: when sequence is null, acceptedDigest MUST be null, status MUST be NEEDS_OPERATOR, and code MUST be CLEANUP_UNCERTAIN. All fields remain required; additionalProperties remains false.
- Semantic distinction: `sequence=0, acceptedDigest=null` = known absence; positive sequence + digest = known selected revision; `sequence=null, acceptedDigest=null` = neither sequence nor digest certified. Unknown is NEVER STOPPED/RUNNING/OK and conveys no authority to start, retry, release custody, or reconcile.
- For the known branch, explicitly require zero/null or positive/digest pairing; the current independent field schemas do not themselves enforce that pairing. This is an additional semantic/schema tightening to approve, not an assumed existing validator rule.

Example only (NOT an observed response):

```json
{"schemaVersion":"alica.cell-admin-response/v2","requestId":"req1","incarnation":"inc1","sequence":null,"status":"NEEDS_OPERATOR","code":"CLEANUP_UNCERTAIN","acceptedDigest":null}
```

Exact recommended compatibility routing (also part of the proposal): retain `supervision/admin.sock` and frozen v1 request/response shapes; add `supervision/admin-v2.sock` with the SAME UID/mode/incarnation/custodian and aggregate connection ceiling. Define `adminRequestV2` as an exact clone of adminRequest except schemaVersion=`alica.cell-admin-request/v2`; no new request field or operation. The v2 endpoint accepts only v2 requests and sends only v2 responses, for both known and unknown selections. The v1 endpoint never emits v2; its unknown-selection path still closes. Both endpoints share the same single mutation slot and the total eight-connection ceiling (NOT eight each), and retain the existing admission-based 30000 ms deadline. Reject a request sent to the wrong version endpoint without dispatch. No autodetection, silent fallback or replay.

This adds a request definition and endpoint routing in addition to the minimal unknown-response shape; those compatibility changes require explicit approval too. Old strict clients continue to use v1 unchanged, while an updated client explicitly chooses the v2 endpoint and grammar. A same-v1 schema widening is textually smaller but breaks old strict validators and changes an existing version; it is NOT recommended. No numeric ceiling change is proposed.

The proposed unknown envelope deliberately does not report OK/CONFLICT with made-up selection knowledge. It uses CLEANUP_UNCERTAIN even if the only known fact is incomplete validation: wording must specify “safe lifecycle/selection disposition is uncertified,” not assert that a particular disposer was observed to fail. If the owner wants distinct busy/unknown-selection semantics, that requires a separate code/knowledge discriminator; it is not hidden inside this minimal proposal.

### B2 — separate versioned error variant with selection omitted

Alternative: a closed v2 discriminated union of (a) the known-selection response and (b) an unknown error containing only schemaVersion/requestId/incarnation/status/code plus an explicit `selectionKnown: false` discriminator. Unknown branch is constrained to NEEDS_OPERATOR/CLEANUP_UNCERTAIN and contains no sequence/digest. Known branch has selectionKnown=true and its exact paired fields. This avoids overloaded nulls but introduces more fields/definitions and client branching. It needs the same explicit version-routing decision as B1, no new ceiling. A bare omitted field in v1 remains invalid.

### B3 — approve connection-close as the unknown disposition

No JSON shape change. Approve a transport/acceptance exception: when truthful selection fields cannot be supplied, server closes without a response, retains custody, and does not infer cancellation or a retry permit. Clients treat no response as UNKNOWN OUTCOME; they do not guess selection from their request. This is compatible with current fail-closed behavior and old parsers, but provides no structured NEEDS_OPERATOR envelope or remote differentiation from transport failure. Explicitly narrow the conformance/acceptance requirement; do not label the unchanged current implementation fully conformant without that owner decision.

### Required tests after a B decision

Schema/model tests: known absent, known selected, unknown; reject null sequence + non-null digest, unknown+OK/RUNNING/STOPPED, omitted required fields, new fields in v1, unsafe/boundary integers, mismatched known pairs. Version-routing tests must prove that strict v1 clients never silently interpret a v2 unknown as known absence.

Real process/storage tests: stop owner at actual accepted rename/fsync boundaries, hold an OS pidfd, prove custodian remains responsive without blocking storage reconciliation, preserve original bytes/evidence, and observe unknown disposition rather than fabricated zero/stale selection. Cover first publication (no prior known selection), uncertainty after a prior accepted revision, corrupt/missing accepted data during successor validation, owner death before readiness and forced cleanup. Any unknown/timeout/disconnect must leave lock/fence intact and must never permit successor admission. A later readable file, late child exit or request replay must not retrospectively change uncertainty into restart permission.

## Exact owner reply requested

Choose A1 or A2 (or explicitly commission A3); independently choose B1, B2 or B3. For B1/B2 also select version-routing/endpoint compatibility, and approve the stated knowledge/code semantics and known-field pairing. The parent then prepares the exact schema/model/docs/client/server changes and reruns the specified tests for review. This brief alone authorizes NONE of those changes, changes no limit, signs nothing, and requests no G7 acceptance.
