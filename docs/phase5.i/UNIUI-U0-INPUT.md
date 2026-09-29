# I11 UniUI U0 input — facts only, no implementation authority

Discovery: pinned local Catalog definitions and supported Host discovery are real; a universal live registry is absent. Render exact capability version and namespace maturity separately from trustVerified=false, source integrity, runtime availability and the caller's current grant.

Identity/delegation: principals, runtime instance IDs, source scopes/generations, service actors and backend task IDs are different identifiers. Current ACAP grants, domain authorization and backend credential resolution are separate checks. No universal identity/delegation translation was introduced.

Interfaces: P2 put/get; H operator profile list/show (not ACAP profile/chat/session API), H execute disabled in this reference; Decision evaluate offline fixture only; Memory v2 create/get/search; Doghouse get/list/acknowledge and authorized signal ingress; Kanban board/list/get/create/update/comment/events limited to qualified nonlaunching triage. Exact descriptors are attached.

Query/event/freshness: use QUERY-EVENT-INVENTORY.md. Kanban is bounded polling with source cursors, not invented websocket realtime. Memory/incident queries have no claimed changefeed. Doghouse selfHealth is internal diagnostic, not a generic health capability. No freshness can be inferred merely from a visible snapshot, successful old test or reconstructed adapter. UNKNOWN, stale, denied, unsupported and degraded are separate visible states.

Agents/profiles/chat/orchestration: native profile metadata is witnessed; no generalized agent/session/chat enumeration or UI activation was built. Kanban's board/task read surface is real; dispatch, assignment, workers, runs and termination remain zero. Doghouse is observation/incident handling, not remediation or process supervision authority.

Source of truth: MemoryV4 owns memory state; Hermes owns Kanban tasks/events; Doghouse owns incident state. Never add a shadow state database or infer successful mutation from an ambiguous request. An UNKNOWN write requires accepted bounded reconciliation.

This is evidence-backed design input only. No UniUI implementation, production rollout, owner acceptance or renewed provider grant is authorized.
