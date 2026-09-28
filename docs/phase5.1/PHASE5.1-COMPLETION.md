# Phase5.1 MemoryV4 + ACAP — technical release declaration

IMPLEMENTED / TECHNICALLY QUALIFIED / ANONYMOUS PUBLIC SOURCE REPRODUCED / INDEPENDENT FINAL REVIEW ACCEPTED WITH CAVEATS.

Declared technical tag: `phase5.1-memoryv4-v1.0.0`.
Technical branch: `phase5.1/memoryv4` in https://github.com/BartSchuster22/AlicaV2.
NO OWNER ACCEPTANCE. NO PHASE5.2. FREEZE AND STOP AFTER VERIFIED PUBLICATION.

## Exact source and independent gate

Implementation candidate `ab09af5022ea81f9088b0b940645b4314543d422` was independently reviewed by fresh reviewer session `20260928_204706_733e60`. Decision: ACCEPT_FOR_TECHNICAL_PUBLICATION_WITH_CAVEATS; zero blockers, no product corrections. Verbatim [JSON](FINAL-INDEPENDENT-REVIEW.json) and [review](FINAL-INDEPENDENT-REVIEW.md) are attached. JSON SHA256: `aae8b7d8c982348d35f313e7d4dcef5f369d724f9c636f3c5dfac7a458ecd2f7`.

This child is documentation/review/publication-evidence only. It preserves the qualified product, tooling, Catalog, prior evidence and immutable review receipts. Original candidate notices and frozen older-phase notices are historical; this declaration supersedes their publication status, not their evidence or limitations. The technical tag identifies this documentation child; it does not confer Owner Acceptance.

## Delivered scope

- Shared governed MemoryV4 domain and Store port; HTTP remains a peer adapter. Native and ACAP same-record parity, current permission/root enforcement and denial auditing are exercised.
- Breaking Candidates v2 only: public Host idempotency remains none, mandatory payload requestKey maps into the shared domain's retained authoritative transactional actor/request/result ledger. No v1 alias, platform replay cache or durability downgrade. Original record, audit and replay result are atomic; retries reauthorize current grants.
- Genuine independent Catalog design receipt and evidence-backed experimental admission. Real M7 pinned snapshot `sha256:fb9b81e7f0565d963642dbc0bbdfef5d1c11e608a5f447036edc54f328847889` passes structural/semantic validation. This metadata is not execution or trust certification.
- Native no-container qualification, bounded private Python transport, cancellation/deadline/unavailable/stale-handle cleanup and SDK-only external consumer.
- Canonical graph export and restricted fresh-store import: preserved IDs/model/governance/history, explicit canonical-role preservation authority, consistent deterministic roundtrip, reference/integrity/empty-target checks, atomic rollback including interrupted process and rebuilt derived FTS.
- Fresh-domain graph exchange excludes the same-domain authoritative replay ledger and does not transfer artifact bytes or grant authority. It is not physical backup/replay reconstruction or arbitrary merge.

## Actual public-source reproduction

After independent approval, the unchanged candidate was pushed to the technical branch and cloned anonymously over HTTPS with Git credential helpers and global/system Git configuration excluded. All 89 qualified source hashes matched before acceptance of the new execution. The unchanged reproduction tool performed fresh npm/Python dependency installation, build/typecheck, frozen170, Decision54, both packed offline fixtures, Foundation41 ordinary and native, Python78 and public Host8. See [EVIDENCE](EVIDENCE.md) and raw [publication evidence](publication/).

The full strict MemoryV4 no-container8/78 qualification is reused only on exact source identity, not claimed rerun by this publication step. The independent reviewer separately reran17 exchange tests. The final tag must also be anonymously fetched, compared against the exact release/qualified source, and exercised with the focused exchange fixture after transport. Post-push identities and that actual outcome are recorded by the publisher, not invented in this pre-transport declaration.

M0–M20 implementation and qualification artifacts are indexed in [candidate report](PHASE5.1-CANDIDATE.md), [architecture/acceptance mapping](README.md), [portability](PORTABILITY.md), [reproduction](REPRODUCE.md) and EVIDENCE.md. Final public transport/discovery verification closes publication, not a new implementation phase.

## Unchanged caveats and non-claims

Catalog dependency check remains FAILED, exit1 `AssertionError: @alica/catalog`; no frozen repair or blanket-green claim. Catalog maturity remains experimental, trustVerified=false and M7 EXECUTED/backup/migration NOT_TESTED. Native execution is separately evidenced. Retention proof is accelerated25h ledger aging plus no-eviction inspection, NOT elapsed24h soak. Existing whitespace limitations and VM/Python warnings remain. Integrity checksum is not authenticity; no second durable provider, PostgreSQL, advanced retrieval, container qualification, universal backup, hostile-code confinement or production cutover is claimed.

No production/closed-live authority operation, Kernel/Foundation change, visibility change or registry publishing. Phase4 six consumed/zero remaining remains CLOSED; Phase3 protected authority is not renewed. Main receives only a separate README discovery commit, not a product merge. No original immutable reference may move. After exact public verification: TECHNICAL RELEASE FROZEN — STOP for separate Project Owner Acceptance. No accepted tag or Phase5.2 follows automatically.
