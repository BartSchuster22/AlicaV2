# M1 baseline reconciliation

Scope: source-only Git inspection plus already-observed assessment metadata. No production DB opened/copied, no startup/migration/health repeat or secret inspection.

| Baseline | Immutable source | Meaning |
|---|---|---|
| A D0 | 16166412574164d3527ddb4b8d2c2414eff1900f | origin/main scaffold; not the governed build source |
| B selected | 6111107fa709826c0642651f7f256c0c7fe3116a | clean local developed source; origin/worker-memoryv4-foundation matches |
| C operational reference | b944a4727ab665bcf3bef870997908e991a37631 | four inspected runtime files match; not full-image attestation |

A→B source diff establishes implemented authorization, schemas, Store protocol/SQLite transactions, migrations, pagination, persistence/recovery and V3 adoption with corresponding tests. A rebuild is rejected: preserve B semantics and adapt boundaries.
C→B: 28 files changed, 2418 insertions/53 deletions in actual git diff --stat. app/main.py changes only APP_VERSION (0.6.0-persistence-recovery→0.7.0-production-qa); contracts.py documents bounded nonempty record content. Additional schemas/settings validation, adoption and production-QA/deployment/documentation changes are not blanket-proven by C runtime. app/storage.py, migrations.py, recovery.py and sqlite_runtime.py have no source differences between C and B (git diff --quiet exit0). No inference that uninspected runtime files equal C.

Source migration registry at B: 0001_foundation, 0002_governance, 0003_core_objects, 0004_record_lifecycle, 0005_review_audit_operations; same source registry at C. This inventories expected schema, not actual production DB migration claims. Actual production DB applied versions/checksums are UNINSPECTED by scope; not a prerequisite to isolated B development and must not be obtained by opening production DB. Compatibility/integrity will be exercised only with fresh fixtures.

Recovery inventory: migration prefix/checksum validation and atomic claim/up/down; sqlite_runtime WAL/FULL, foreign keys, advisory leases, bounded busy timeout and integrity; recovery online backup manifest/integrity/fsync, exclusive offline restore, interrupted-restore recovery; adoption.py V3 export/plan/import/parity tooling retained and offline-fixture qualified only. Canonical exchange is new, not repackaged SQLite backup or V3 adoption.

Production-only differences are deployment/configuration, not selected implementation: private gateway tokens/actor delegation, real scopes, volume ownership/mounts, loopback publication, backup volume, monitored deployment and existing data. Values/secrets/data are excluded. No production-only algorithm has been established; absence of evidence is not an assertion of full equivalence.

API.md still names healthy 0.6.0 while source main names 0.7.0: inherited documentation drift, classified not silently repaired. Production-acceptance image/port statements differ from observed local image/loopback/backups (RUNTIME-REFERENCE.md). Historical production acceptance is not new ALICA qualification.

Decision: B is sole product source; accepted ALICA Phase5.0 is sole Foundation base. No production repair/cutover. M1 source reconciliation complete as a document; source copying, fresh-store tests and public final reproducibility remain later gates.
