# Canonical graph exchange v1 — restricted operator interface

This is provider-independent JSON graph exchange, NOT SQLite backup or same-domain disaster recovery. `app.exchange` uses only `GraphPort`; `app.sqlite_graph.SqliteGraph` is the SQLite adapter. All SQL stays in the adapter. SHA256 is integrity, NOT authenticity or an import authorization.

## Preserved authoritative graph

Entities, records (rec_ plus original 32-hex UUID), roles, lifecycles, policies, confidence/tags/content/attrs, author/provenance/source references, timestamps and versions; reciprocal supersession graph; typed relations; artifact metadata/URI/checksum/links; review findings and resolution state; audit history and retrieval observations. Model/format versions are explicit. Unrecognized fields, versions, duplicate IDs/JSON keys, invalid roles/IDs, invisible/dangling references, cycles/inconsistent supersession and checksum mismatch fail before target mutation. Export normalizes key and section ordering; meaningful timestamps and IDs are NOT normalized away.

Graph artifact bytes are NOT fetched or claimed available. Artifact URIs and checksums are metadata only; byte custody/availability must be managed separately by the operator. FTS is derived and rebuilt from imported records in the same transaction. SQLite file/WAL/layout metadata, secrets, credentials, grants and provider-specific implementation data are not portable graph content.

The same-domain idempotency/request/result ledger is AUTHORITATIVE, RETAINED and NOT REBUILDABLE. It is intentionally excluded only from this fresh-domain graph format. Never use graph import as a same-domain restart/backup/restore substitute: that would lose exactly-once request identity. Same-domain recovery must preserve the physical authoritative ledger with records and audit state. Imported historical graph is a NEW replay domain; old retry keys must not be redirected to it as though it were the old domain. No ledger purge, TTL shortening or arbitrary migration fallback is authorized here.

Import-admission bookkeeping is retained locally as `memory.canonical.import`, but excluded from subsequent graph export so import bookkeeping does not falsify semantic roundtrip equality. Imported artifacts may not supply that reserved audit action. All other graph audit history is preserved. There is no automatic retention/pruning of the new marker.

## Explicit authority, conflict and crash policy

`ExchangeAuthority` must be created by trusted offline/operator composition, NEVER from request/document contents. Export/import each default denied. Both require operator `memory.admin` and a root covering every graph object. Importing existing canonical roles additionally requires `allow_canonical=True`; normal create-working authority cannot import or promote. This authority admits an operator-approved historical graph, not a signed claim that the document's history is authentic. Independently verify provenance/custody before authorizing an import.

Import accepts a fresh empty target only, including an empty request ledger. No merge, overwrite, ID remap or hidden conflict resolution. It prevalidates all graph objects and then rechecks emptiness under a single `BEGIN IMMEDIATE` write transaction. Foreign keys are deferred until commit (never disabled) for reciprocal supersession links. Records, references, FTS and local import receipt commit atomically. Exceptions and abrupt process exit before commit leave no imported graph/receipt. Initialization may create the empty provider schema before import; a failed import is not a promise that no empty DB file exists.

The bounded profile limits JSON to 64 MiB and each section to 100,000 rows. Only this first graph format/model version is supported. Oversized, partial cross-root and arbitrary legacy-ID graph migration is not silently attempted. SQLite physical backups remain provider-specific.

## Operator use (offline, disposable example paths)

Run with `services/memoryv4` as the working directory and the qualified Python environment. The source/target paths below are placeholders for OPERATOR-APPROVED offline stores, not production defaults.

```python
from pathlib import Path
from app.domain import AuthContext
from app.settings import _parse_grant
from app.storage import SqliteStore
from app.sqlite_graph import SqliteGraph
from app.exchange import ExchangeAuthority, export_graph, import_graph

# Explicit trusted operator approval, not values read out of the exchange file.
auth = AuthContext(_parse_grant('offline-operator', {
    'actor': 'operator:offline', 'scope_path': 'tenant:example',
    'permissions': ['memory.admin'],
}))
authority = ExchangeAuthority(auth, allow_export=True, allow_import=True,
                              allow_canonical=True)
source = SqliteGraph(SqliteStore(Path('/tmp/approved-offline-source.sqlite3')))
raw = export_graph(source, authority)
Path('/tmp/approved-canonical.json').write_bytes(raw)
fresh = SqliteGraph(SqliteStore(Path('/tmp/new-offline-domain.sqlite3')))
receipt = import_graph(fresh, raw, authority)
assert export_graph(fresh, authority) == raw
assert receipt['newDomain'] and not receipt['replayLedgerImported']
```

For the executed nonempty graph (all four roles, policies, supersession, entities/relations/artifacts, nonempty findings/audit/retrieval) and adversarial/crash fixtures, run `tests/test_exchange.py`. The helper `_parse_grant` is existing native composition, not a new public ACAP/authentication API. No HTTP/ACAP import endpoint was introduced.
