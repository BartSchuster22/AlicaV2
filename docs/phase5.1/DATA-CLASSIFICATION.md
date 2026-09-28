# M5 data classification

| State | Class | v1 exchange disposition |
|---|---|---|
| entities/composite IDs/attrs | AUTHORITATIVE/PORTABLE | include all fields |
| records/content/provenance/refs/author | AUTHORITATIVE/PORTABLE | include exact semantic model |
| role/lifecycle/write policy/scope | AUTHORITATIVE/PORTABLE | preserve; import must independently authorize, no promotion |
| superseded records/links/versions/lifecycle timestamps | AUTHORITATIVE/PORTABLE | include full existing snapshots and references |
| findings/status/resolution/reviewer | AUTHORITATIVE/PORTABLE | include, not a derived search index |
| audit events | AUTHORITATIVE/PORTABLE | include asserted history; no authenticity elevation |
| retrieval events | AUTHORITATIVE/PORTABLE | include evidence, not silently discard as cache |
| typed relations | AUTHORITATIVE/PORTABLE | include reference graph/integrity |
| artifact URI/checksum/link/provenance | AUTHORITATIVE/PORTABLE | references/metadata only |
| artifact bytes behind URI | EXTERNAL | excluded, no fetching/copying; no byte roundtrip claim |
| FTS index/BM25/cache/query plan | DERIVED/REBUILDABLE | excluded; rebuild from authoritative records |
| cursor tokens/process handles/health/request deadlines | EPHEMERAL | excluded; invalidate across instances |
| actor API keys/tokens/Host grants/operator mappings | EXTERNAL authority | excluded; explicitly configured at target, never recovered from payload |
| SQLite migration registry/locks/WAL/db pages | implementation state | excluded; target uses pinned compatible provider migrations, canonical format stays independent |
| durable actor/operation/request/result registry | AUTHORITATIVE, RETAINED, NOT REBUILDABLE for the same domain | Excluded ONLY from fresh-domain canonical graph exchange; not from same-domain restart/recovery. No cross-domain replay continuity. Never redirect pre-export ambiguous retries to an imported fresh domain or rebuild/discard this ledger. Source physical recovery retains registry atomically with mutation/audit. |
| hypothetical full patch history | not present as separate source model | cannot manufacture; existing supersession snapshots/audit included |
| import receipt/importer identity | AUTHORITATIVE local import provenance | new local receipt distinct from source audit; excluded from source-state equality explicitly |
| export timestamp/host paths/build diagnostics | EPHEMERAL diagnostics | outside canonical hashed payload, never imported as memory |

Backup, migration and canonical exchange are different artifacts. Inclusion of historical policy does not install execution authority. Restricted import must reject canonical payload when caller lacks explicit canonical preservation authority, even if checksum matches. Scope/immutability restrictions survive roundtrip. Non-production fixtures only; no secrets/production data in artifacts.
