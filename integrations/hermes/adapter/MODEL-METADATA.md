# Approved Codex model and revised limits

Task: qualify actual native constructor and enforcement (H9/H12/H14/H17); no upstream/foundation edits. Stop before live credentials/inference until offline native qualification passes.

Pinned Hermes c04e9a1d0dfa4abbefe4b256428e645abaacfe88 enforces minimum context 64000 in agent/agent_init.py::_enforce_minimum_context. The failed adapter explicitly wrote model.context_length=32768; this was NOT provider metadata. _resolve_context_length reads that route-scoped config pin. The supported setting is model.context_length; the minimum remains unchanged.

Authoritative discovery: authenticated GET https://chatgpt.com/backend-api/codex/models?client_version=99.0.0 at 2026-09-27T19:55:04.502891+00:00 returned HTTP200. Only exact approved slug and numeric metadata retained:

    slug: gpt-5.6-sol
    context_window: 272000
    max_context_window: 872000

Configure advertised default 272000, not optional maximum872000 or another model/route. Pinned agent/model_metadata.py1848-1919 uses this official catalog's context_window as the account-specific authoritative value; static fallback and direct-API tables are not substituted for this observation. Metadata GET consumed zero inference requests. No temporary DEV auth was placed. Revalidate metadata if model/account/route changes; this evidence is not a universal entitlement promise.

Superseding owner approval: existing Codex route WITHOUT guaranteed provider-side1024 output-token cap. DispatchGuard and GuardedResponses reject token-cap overrides and do not send max_output_tokens, max_tokens or max_completion_tokens. Keep maximum3 TOTAL physical inference requests including tool followups; durable commit-before-dispatch, failures consumed, no renewal;120s/task; single-flight; no retries/fallback. Local text/process bounds and stream closure do NOT guarantee provider cancellation, generation ceiling or billing ceiling. Prior live grant last reported0/3; verify actual durable state before live provisioning, never initialize over consumed history.

Local revised guard/budget/pinned-payload suite:29 tests passed. Actual native constructor/loop qualification must be rerun on DEV after transfer. This document does not assert H12 live success.
