# Generic execution candidate — H4/H5, not a Catalog release

Frozen Catalog contains only echo. This directory proposes one new generic unary execute contract and supplies a finite deterministic reference plus public ACAP conformance/SDK tests. It adds no model/tool/session/cancel capability and imports no Hermes or Kernel internals.

Status: DEV candidate proposal validation, reference conformance and SDK/testkit tests executed successfully on 2026-09-27. No independent review has occurred. No review identity/acceptance record is fabricated. Do not add this candidate to catalog/catalog.yaml, generated index or namespace release allowlist until an actual distinct reviewer checks abstraction/security/scopes/compatibility and the authorized maintainer records a governed transition. Proposed URI is not yet an admitted Catalog identity. The existing example namespace does not silently authorize the agent namespace.

Reference supports exactly `Read the approved fixture and return its text exactly.` and returns the in-memory read-only fixture. Other tasks fail INVALID_ARGUMENT. This proves a finite reference, not general reasoning or live inference. The same bounded task can later be submitted unchanged to a Hermes-backed provider. H13 is NOT established until that second provider actually passes.

Mapping: request `{task}` → provider execution; result `{text}`. No caller-controlled model, tool list, credential, path, endpoint, session or fallback fields. Existing CallOptions supplies absolute deadline and AbortSignal; no new cancellation operation. Idempotency none: no automatic retries/deduplication. Execution state is request-owned, no resume. Generic errors use the frozen ACAP vocabulary: INVALID_ARGUMENT, PERMISSION_DENIED, UNAVAILABLE, FAILED_PRECONDITION, RESOURCE_EXHAUSTED, CANCELLED, DEADLINE_EXCEEDED, CONTRACT_MISMATCH and INTERNAL as applicable. Local cancellation says nothing about remote provider billing. Credentials and raw exceptions never enter result text or diagnostics.

Run from the built DEV worktree (Node24.21.0):

    node --test catalog/proposals/agent-execution/reference.test.mjs

Tests use public ACAP conformance and SDK/testkit only. Testkit policy negatives are not production Host enforcement qualification. The separate production topology probe is under integrations/hermes/tests. A future definition must bind the computed descriptor digest and record full generic semantics; do not promote this source draft merely because shape validation passes.
