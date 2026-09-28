# M4 requirement-level reuse inventory

Selected source B6111107fa709826c0642651f7f256c0c7fe3116a. Dispositions are scope decisions, not tested implementation claims. M0–M3 installation/evidence reconciliation precedes all product changes.

| Subsystem | Disposition | Acceptance-linked action |
|---|---|---|
| Pydantic records/roles/lifecycle | REUSE | Existing schemas/invariants, no D0 rebuild, M8/M18 |
| rec_UUID stable IDs | REUSE | preserve across writes/restart/export/import, M11/M15 |
| provenance/source refs/server author | REUSE/ADAPT | source attribution unchanged; transport source projection explicit, trusted ACAP actor mapping, M11/M15 |
| scope auth/visibility | REFACTOR | extract current helpers into shared domain; keep ancestor/descendant and sibling hiding, M8/M10/M11 |
| grant/actor ingress | ADAPT | HTTP bearer/delegation retained; ACAP public caller + explicit operator map, no input identity, M11/M16 |
| write policy | REFACTOR | move existing checks, no weakening canonical/immutable/author/admin rules, M8 |
| idempotency | REUSE | actor/key/request hash Store transaction; same key explicit ambiguous replay, M11/M16 |
| optimistic versioning | REUSE | existing If-Match/domain expected_version, M8/M18 |
| update/promotion/supersession/lifecycle | REFACTOR | shared existing business bodies/Store transactions, no new minimum ACAP management operations, M8 |
| entities/relations/artifacts | REUSE/REFACTOR | retain model/reference visibility and HTTP paths; domain calls port, portable references not bytes, M8/M15 |
| lexical search/filter/page/context | REUSE | existing FTS/fallback/filter-bound cursor and evidence; minimum ACAP search projects bounded fields, M11 |
| findings/review | REUSE/REFACTOR | domain permission/reason/version; no new public create endpoint, M8/M15 |
| durable audit and denial audit | REFACTOR | successful Store audit retained; domain denial audit used by both adapters; transport validation audit separately, M10/M16 |
| retrieval events | REUSE | searches invoke same governed semantics/actor, M11/M15 |
| Store protocol | ADAPT | complete methods actually invoked; SQL/FTS below port, M9 |
| SqliteStore | REUSE/ADAPT | existing transaction/integrity/recovery; portable snapshot/import seam behind port, M9/M13–M15 |
| schema migration registry | REUSE | source checksums unchanged where possible, no production migrations, isolated fixtures M18 |
| backup/restore/recovery | REUSE | preserve source and offline tests; not rename backup to canonical exchange, M18 |
| V3 adoption tooling | REUSE/DEFER execution beyond fixtures | retain source behavior, existing isolated tests only; no V3/production access, M18 |
| HTTP/FastAPI adapter and discovery | REFACTOR | peer adapter, unchanged v1 paths/status/header/schema semantics, M8/M10 |
| native lifecycle/process adapter | ADAPT | proven fixed child/public SDK path; explicit path/settings, health/disposal/restart, M11/M12 |
| canonical export/import | ADAPT/NEW scoped seam | provider-neutral format with transactional consistent snapshot/fresh import, not new storage engine, M13–M15 |
| embeddings/vector/ranking innovation | DEFER | not authorized |
| PostgreSQL/UI/Hermes provider/containers | DEFER | not authorized |

No subsystem is classified REPLACE. Exact applicable regressions must be pinned before product refactor; inherited Catalog dependency/whitespace failures remain explicit. Changes require acceptance-linked reason; optional enhancements deferred after completion.
