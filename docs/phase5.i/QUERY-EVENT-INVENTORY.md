# I6 query / polling / event inventory

| Surface | Classification | Actual guarantee / explicit absence | Evidence |
|---|---|---|---|
| Catalog snapshot + descriptors | QUERY_ONLY | Static selected integrity-checked snapshot. No live global registry or automatic admission; trustVerified=false is retained, not upgraded. | capability-snapshots/; CAPABILITY-SNAPSHOT-INVENTORY.json |
| H native profile metadata | QUERY_ONLY | Operator CLI snapshot; no real-time profile feed, ACAP profile/session/chat discovery or promised freshness after command completion. | h-profile-* |
| H adapter internal bus/lifecycle | NATIVE_EVENTS within accepted bridge only | Scope/generation/grants and bounded listeners; no provider execution in this profile and no UI telemetry feed inferred. | H closure and accepted integration tests |
| Decision evaluate | QUERY_ONLY request/response | Exactly bounded offline calls; no streaming, durable result log, telemetry source or reconnect/replay contract is invented. | D suite and closures |
| Memory create/get/search | QUERY_ONLY request/response | Canonical MemoryV4 identity and persistence; accepted idempotency window/UNKNOWN behavior retained; no memory changefeed or watch API. | M v2 suite and whole restart |
| Doghouse signal input | NATIVE_EVENTS | Authorized source identity and scope retained. Duplicate, order, stale/invalid inputs, ingress/drop and source denial behavior are only those exercised by frozen tests. No universal bus retention, exactly-once or replay guarantee. | g-native-r3.log; G closures |
| Doghouse incident get/list/acknowledge | QUERY_ONLY | Scope-bound current store results. No incident create, generic health capability or incident subscription invented. Internal selfHealth() is diagnostic, not public ACAP health. | G native/public tests |
| Kanban board/list/get/events | BOUNDED_POLLING | Real backend sequence/cursor identity, bounded pages and accepted reconnect/reconciliation. Source retained-history floors are not silently strengthened. Synthetic boundary probe remains MOCK. No websocket or unlimited tail promised. | K conformance and restart logs |
| P2 record put/get | QUERY_ONLY | Reference store/idempotency only; telemetry, streaming, large payload, configuration, compensation and live reload declarations remain unsupported. | P2 conformance |

Ordering, duplicate handling, retention/staleness and reconnect claims are per-surface and per-source, not unified into a fabricated durable global event stream. UI must display unknown/stale/unsupported rather than invent continuity. Exact native failure/edge test names are retained in logs for audit.
