# Phase5.1 finite independent final review

Decision: ACCEPT FOR TECHNICAL PUBLICATION WITH CAVEATS. No concrete blocking finding identified. This is independent candidate review, NOT publication, Catalog admission, Owner Acceptance or Phase5.2 authorization.

Reviewed commit: `ab09af5022ea81f9088b0b940645b4314543d422`, branch `phase51-memoryv4`, DEV `/home/alica-dev/AlicaV2-phase51`.

Machine-readable result and evidence hashes: `/home/herman/g7-control/phase51-final-independent-review.json`.

## Independent binding and actual state

- Supplied archive `/home/herman/g7-control/phase51-final-review-ab09af5.tar` SHA256 is exactly `59f630c692f760736fd7843b8a8e668c96bf4942992f4e43e2707ece1fb3050f`.
- All 148 regular archive files match local packet, DEV committed HEAD and DEV worktree bytes. No tracked worktree changes. Three untracked generated files remain: qualified source archive and the two Catalog schema copies. Schema hashes match the recorded canonical values; do not accidentally stage them.
- Independently verified all 89 qualified source-manifest hashes and their bytes within the actual DEV exercised source archive, SHA256 `e2a390fca4cf1cb5df85667189428f5808b46838537edf758da263dfc2d2bcda`. All 14 log hashes in public-reproduction.json match. Admission implementation/product/domain conformance hashes and original six-file v1 / ten-file v2 review packets match.
- Frozen packages, service-foundation and Decision tracked diff against accepted `94570dd322f07e2860016b89c1e81356cc8b65cc` is empty. Dependency/secret checkers also unchanged. Local tag inventory has the original Phase1–5.0 tags and no Phase5.1 tag. Phase5.0 technical/accepted tag objects match the governing frozen references.
- Initial root Git read hit dubious-ownership protection. Retried as repository owner using runuser; no global safe-directory change. An initial receipt verification used the wrong base for v1 relative paths; corrected and verified both packets successfully. These discovery errors were not product failures.

## Source assessment, not just test totals

1. Shared domain and peer HTTP: inspected domain authorization/mutation paths, HTTP delegation/error envelope, Store, schemas and actual parity helper. HTTP and ACAP use the same governed model/Store rather than separate business implementations. Same-record native/HTTP equality is asserted by the real Host fixture. Domain denial auditing avoids duplicate HTTP denial audit. Baseline/refactor regression evidence remains relevant; no claim of exhaustive HTTP equivalence beyond source inspection and the exercised matrix.

2. Authority and replay: provider.mjs maps trusted Host caller principal/instance/scope through operator-owned resolver. Public input is closed and cannot choose actor, grants or canonical role. candidates.py restricts mapped authority to create-working/read/search without delegation; create_record checks current scope/permission before replay. Host idempotency is none. Explicit v2 requestKey reaches the durable actor/key/operation/request-hash/original-result Store ledger. storage.py:110–142 and 612–661 use one BEGIN IMMEDIATE transaction for record, audit and receipt. No ledger eviction appears in inspected Store. The original receipt is not a current-state read or re-promotion. Inspected real tests cover complete Host restart, authorization changes, conflicts, actor isolation, forged payloads, committed response loss and explicit same-Host retry.

3. Canonical exchange: exchange.py:36–143 requires restricted operator/admin authority and separate canonical-role preservation authority. Closed normalized graph validation checks versions, identities, scope, links and reciprocal/acyclic supersession before mutation. sqlite_graph.py:45–60 rechecks empty graph AND replay ledger under the write transaction, defers rather than disables FK checking, rebuilds FTS and writes retained admission audit atomically. Same-domain ledger is retained/excluded from fresh-domain graph import, not classified as reconstructible. Artifact bytes/credentials are excluded. Inspected rollback test uses both an exception after insertion and real process exit.

4. Native lifecycle/resource handling: provider request/response byte limits, active cap, bounded deadline, cancellation and close-event cleanup are implemented. SDK effect owns disposal and awaits child closure. Bridge opens explicit absolute fixture/operator path and closes Store in finally. Native isolation tool uses allowlisted chroot contents, separate mount/network/PID namespaces and UID1000, with no container executable/socket or production config. Actual hash-bound native logs report 8 Host tests and 78 Python tests; these were not rerun wholesale.

5. Prior failed-patch alert resolved against actual bytes: provider.mjs SHA256 `98db923f111943c3813266250bc118d17418dc8ba6e08f80e3458906efd03003` contains child error handler at line40, stdin error handler at41, close cleanup at43–50, abort-race check at52 and awaited shutdown at56. bridge.py SHA256 `3b94cc3de92f83ffc848b84a500da8ab366b751444d315b59d477511b680a18a` contains try/finally Store close at29–33. Both are committed and byte-identical to exercised source archive. Thus these protections are present, not assumed from a patch success message. Unseen original patch bodies are not available in the review packet; this review does not assert every historical patch attempt succeeded.

6. SDK-only consumer and Catalog: consumer imports public SDK only, receives selected requirement and makes create/replay/get/search calls without MemoryV4, HTTP, SQLite or private Kernel imports. Inspected genuine distinct parent v2 receipt, frozen governance API, admission tooling and existing admission record. Experimental transition references actual matching implementation and qualification logs. Real M7 snapshot pin is `sha256:fb9b81e7f0565d963642dbc0bbdfef5d1c11e608a5f447036edc54f328847889`. Reviewer did not apply transition/admission. Old draft-language in immutable provenance remains historical, not an excuse to rewrite receipts.

7. Purity/reproducibility: source-only reproduction tooling installs public dependencies into fresh fixtures and separates dependency-fetch network access from isolated tests. Executed source bytes were verified directly, not inferred from a report. Existing secret-check script was inspected and independently run: exit0, `Secret pattern check passed`. It is a bounded known-pattern scan, not a universal secrecy guarantee. Candidate Python files compile in memory without writes. No unknown unrun packet script was needed or executed.

## Focused independent execution

Ran copied `services/memoryv4/tests/test_exchange.py` in a temporary DEV fixture, new network namespace, repository-owner UID, empty environment, explicit disposable DB, no pytest cache and bytecode disabled. Used only the existing qualified Python tooling. Actual exit0: `17 passed in 2.47s`. Temporary fixture removed in finally. Candidate/product files were not modified. This supplements rather than replaces the hash-bound native/Host/public-source evidence.

## Caveats retained

- Clean-source prepublication proof is sound; anonymous exact published-tag/source reproduction and main README-only discovery verification necessarily remain publication-stage work. This reviewer did not claim public availability of ab09af5 or query production.
- Inherited Catalog dependency check remains FAILED, exit1 `AssertionError: @alica/catalog`; not counted green or repaired. No relevant frozen checker/package changes were found.
- Experimental maturity, `trustVerified=false`, M7 EXECUTED/backup/migration `NOT_TESTED`, existing whitespace limitations, VM experimental and Starlette/AnyIO warning remain. Native execution is separate evidence, not manufactured by M7.
- 25-hour aged receipt fixture plus no-eviction inspection is not elapsed 24-hour soak.
- Graph exchange is not same-domain backup/replay reconstruction, arbitrary merge, imported authority or fetched artifact bytes. No second durable provider, PostgreSQL, advanced retrieval, container qualification or live-provider qualification is claimed.
- Phase4 six consumed/zero remaining remains CLOSED; Phase3 protected authority is not renewed. No production adoption/cutover, Kernel/Foundation change, Owner Acceptance or Phase5.2.

## Precise next action / stop

Parent may consume this review and separately execute the already-owner-authorized technical-publication workflow. No product correction is requested. Preserve the reviewed product/evidence bytes; prepare any required technical completion/governance documentation, publish scoped technical branch/tag without force or tag movement, verify anonymous exact refs and source, and perform separate main README-only discoverability update preserving prior links/body. Then STOP for separate Owner Acceptance. Do not infer an accepted tag from this review.

CURRENT.md, DELIVERY.md and phase51-build-result.md are reconciled to this actual candidate/review result under inherited checkpoint ownership. UNSYNCED: parent sync/readback pending. No lock reacquire/probe/release, recall/sync, subworker or cron action was taken.
