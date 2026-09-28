# Phase5.1 qualified implementation candidate — final independent review gate

NOT TECHNICALLY PUBLISHED. This is the candidate evidence report, not Owner Acceptance or Phase5.2 approval. The authorized next gate is one finite independent candidate review. Technical branch/tag/completion publication and separate main README-only discoverability follow only after that gate; no publication occurred in this work block.

## Actual results

| Evidence | Actual outcome |
|---|---|
| Genuine parent v2 `reviewProposal` | PROPOSED; receipt SHA256 `7f1e21c2477a27f8514b9bbee21ac00714453df5087601f663361bc3b92bd917` |
| Revised preimplementation fixture | Structural + semantic PASS before product integration; explicitly unadmitted at that time |
| Catalog experimental transition | Actual admitted entry with parent design review, product implementation hash, actual product 5-pass log and 77-pass domain log; preserved in `catalog/releases/phase51-memory-v2/admission.json` |
| Real pinned M7 | Structural + semantic PASS; snapshot `0.5.1`, digest `sha256:fb9b81e7f0565d963642dbc0bbdfef5d1c11e608a5f447036edc54f328847889`; `evidence/admitted-m7.json`, synthetic=false |
| Native no-container product | 8/8 public Host/SDK tests, 0 failed/skipped, unprivileged UID1000, fresh mount/PID/network namespaces/chroot, no container executable/socket or production config |
| Native no-container domain/Store/HTTP/portability | 78 passed, one inherited Starlette/AnyIO warning; same isolated no-container root |
| Fresh source-only/dependency reproduction | Fresh npm install, build/typecheck, fresh Python environment and pinned public dependency install, 78 Python + 8 integrated public-Host tests passed |
| Frozen public regression | 170 passed, 0 failed/skipped |
| Decision safe offline selector | 54 passed, 0 failed/skipped |
| Packed external and continuation fixtures | Both passed; explicitly fixture-only; authenticatedLiveRequests=0; no closed live grant renewal |
| Foundation regression and native fixture | 41 passed in each, 0 failed/skipped |
| Inherited dependency checker | Exit1 `AssertionError: @alica/catalog`; expected original limitation, not repaired or counted as green |
| Source/boundary verification | 89 product/qualification/Catalog files match the actually executed source archive; 34 Store protocol methods implemented; pure core has no FastAPI/SQLite imports or SQL; frozen tracked source changes outside authorized additions are empty |

See actual logs and hashes in `evidence/public-reproduction.json`, `native-v2.log`, `native-python.log`, `final-source-verification.json`, and `python-final.log`. Tests exercise real code, SQLite transactions, child loss/cancellation and process-exit rollback, not invented API results. The immutable v1 blocked proposal/receipt/failure evidence remain historical and are never admitted or aliased into v2.

The source-only archive actually reproduced is generated output `evidence/phase51-candidate-source.tar.gz` (not a Git source addition), SHA256 `e2a390fca4cf1cb5df85667189428f5808b46838537edf758da263dfc2d2bcda`. Subsequent changes reconcile documentation/status only; the verification compares current product, all qualification tooling/consumer and Catalog files byte-for-byte against that executed archive. Final candidate documentation is authoritative over historical draft wording inside the archive/proposal narratives. Experimental admission is a local Catalog maturity transition, not public publication or independent final implementation approval.

## Implemented boundaries

- One adopted MemoryV4 model/governed domain and explicit Store port, existing SQLite backend and preserved peer HTTP behavior; native domain denial audit no longer depends on an absent HTTP reason local.
- Minimal approved breaking v2 requestKey mapping. Host idempotency remains none; no old-wire aliases or Kernel/Foundation change. Every attempt reauthorizes; actor/operation/key/request/result plus mutation/audit are atomic and same-domain authoritative state is retained.
- Canonical graph exchange covers entities, all roles/policies/lifecycles, versions/provenance/supersession, relations, artifact metadata, findings, audit and retrieval. Restricted operator authority, complete prevalidation, empty-target recheck under one transaction, deterministic semantic roundtrip, interrupted-import rollback. FTS rebuilt; artifact bytes/authority never imported. Same-domain replay ledger is NOT rebuildable and is excluded ONLY from fresh-domain graph import.
- Independent consumer module imports public SDK only and accepts a Catalog-selected requirement. No MemoryV4/HTTP/SQLite imports or private kernel access. A second durable provider is not claimed.
- Native health, corrupt-store/startup, policy/lifecycle/version/conflict/recovery and failure tests execute in the no-container Python qualification. Public Host tests additionally exercise restart, current authorization, ambiguity, deadlines/cancellation, stale handles and cleanup.

## Honest limits and exclusions

The 25-hour aging test is accelerated retention evidence, not wall-clock soak. Inspectable Store no-eviction behavior supports the minimum24h contract. Static M7 validation intentionally reports its own EXECUTED level NOT_TESTED; actual execution is the separate native/Host evidence above, not manufactured by the validator. No portable backup equivalence, arbitrary merge, same-domain replay reconstruction, fetched artifact bytes, trust verification from metadata, hostile-plugin confinement, container qualification, PostgreSQL, advanced retrieval or live-provider qualification is claimed. VM experimental and the single Python deprecation warnings remain visible. Existing whitespace findings remain out of scope.

No production startup/migration/deployment/cutover, production data/config change, protected launcher/key/ledger action, global security setting change, owner acceptance or Phase5.2 occurred. The two untracked generated Catalog schema copies are byte-identical to the frozen canonical schemas; they are build output, not source edits or staged contract changes.

## Finite independent review request

Review current qualified source hashes and these gates, not a new scope expansion: genuine v2 review/admission provenance and pin; authority/replay/atomic Store semantics; domain/HTTP equivalence; canonical authority/reference/transaction/ledger exclusions; native/failure/resource evidence; SDK-only consumer; finite regression/inherited-failure honesty; frozen-source/secret/public-reproduction purity. Parent should report concrete blocking findings or approval for technical publication. No self-review decision, publication or Owner Acceptance is supplied by this candidate.
