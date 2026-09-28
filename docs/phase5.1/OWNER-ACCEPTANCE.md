# Phase 5.1 — Project Owner Acceptance

**PHASE 5.1 — COMPLETE / FROZEN / OWNER ACCEPTED**

- Phase: Phase5.1 — MemoryV4 + ACAP Adapter.
- Technical Release: `phase5.1-memoryv4-v1.0.0`.
- Acceptance Authority: Project Owner.
- Decision: **ACCEPTED**, within documented M0–M20 scope and limitations.
- Status: **COMPLETE / FROZEN / OWNER ACCEPTED**.
- Original technical commit: `1fb169afdf2436d5fe42139685ae0b43ad29e57e`.
- Original annotated technical tag object: `24384aea8359f5a0c0ac5184c4c33c47136453f1`.
- Separate annotated governance tag: `phase5.1-memoryv4-v1.0.0-accepted`.

## Authority and separate governance event

The Project Owner formally accepts ALICA V2 Phase5.1 — MemoryV4 + ACAP Adapter after reviewing its technical delivery, independent review, anonymous public reproduction and documented limitations, within documented M0–M20 scope. This document records that explicit Owner decision; it is not an agent acceptance decision, new technical review, signature inference or new qualification.

This supersedes awaiting-acceptance status only. The technical commit and original annotated tag object/target were verified against live refs before recording this decision. The technical tag remains the frozen delivery and is never moved, recreated or overwritten. Implementation, evidence, review and prior frozen originals remain untouched. Historical “NO OWNER ACCEPTANCE” statements correctly describe the earlier technical event; this later, separate documentation/governance event establishes current acceptance without rewriting them. The accepted tag identifies a documentation-only child of the technical commit. Post-push public ref/hash/document readback is a separate verification step, not presumed by this pre-publication record. No technical tests are rerun for this event.

## Accepted M0–M20 scope

Acceptance recognizes the documented source/runtime baseline reconciliation and explicit source selection; governance/contract mapping; the public Python/ACAP boundary; Store separation; Foundation conformance; native/no-container qualification; governed capability; external SDK consumer; restart persistence, failure and replay evidence; canonical export, fresh isolated import and semantic roundtrip; offline baseline regression and anonymous public reproduction; and preservation of frozen foundations.

The accepted architecture is Core-First / Adapter-Out: ACAP and HTTP are peers over the **SAME Governed Memory Domain -> Store Port -> SQLite**. FastAPI is not the internal memory contract. SQLite is not the ACAP contract. There is no bypass of authorization, scope, actor identity, write policy, idempotency, concurrency, promotion, supersession, lifecycle, provenance, audit or retrieval policy. Stable `rec_<UUID>` identifiers remain authoritative: no replacement or migration. Existing policies, canonical-truth semantics and evidence remain preserved.

**ACAP Memory Capability != Canonical Memory Model != Store Model.** These boundaries are not collapsed by acceptance. Canonical exchange is not backup, schema migration or full authority transfer. Derived state is not automatically portable authority. The documented fresh-domain exchange exclusions remain exact: the authoritative same-domain retained transactional replay ledger and artifact bytes are excluded. That replay ledger is authoritative, not rebuildable derived state; fresh-domain import is not same-domain replay reconstruction or arbitrary merge. Import never transfers authority. No universal MemoryV5 compatibility or production-migration readiness follows.

## Frozen evidence and qualification distinctions

The accepted scope and limitations are incorporated by reference to immutable technical-release documents:

- [Technical release](https://github.com/BartSchuster22/AlicaV2/tree/phase5.1-memoryv4-v1.0.0)
- [Completion / M0–M20 scope and limitations](https://github.com/BartSchuster22/AlicaV2/blob/phase5.1-memoryv4-v1.0.0/docs/phase5.1/PHASE5.1-COMPLETION.md)
- [Architecture and acceptance mapping](https://github.com/BartSchuster22/AlicaV2/blob/phase5.1-memoryv4-v1.0.0/docs/phase5.1/README.md)
- [Evidence and inherited failures](https://github.com/BartSchuster22/AlicaV2/blob/phase5.1-memoryv4-v1.0.0/docs/phase5.1/EVIDENCE.md)
- [Independent final review](https://github.com/BartSchuster22/AlicaV2/blob/phase5.1-memoryv4-v1.0.0/docs/phase5.1/FINAL-INDEPENDENT-REVIEW.md)
- [Canonical exchange and exclusions](https://github.com/BartSchuster22/AlicaV2/blob/phase5.1-memoryv4-v1.0.0/docs/phase5.1/PORTABILITY.md)
- [Public reproduction](https://github.com/BartSchuster22/AlicaV2/blob/phase5.1-memoryv4-v1.0.0/docs/phase5.1/REPRODUCE.md)
- [Finite regression matrix](https://github.com/BartSchuster22/AlicaV2/blob/phase5.1-memoryv4-v1.0.0/docs/phase5.1/REGRESSION-MATRIX.md)

Catalog maturity remains **EXPERIMENTAL**, `trustVerified=false`. STRUCTURAL establishes declaration shape; SEMANTIC establishes documented contract/dependency/binding consistency; EXECUTED applies only to actual separately evidenced behavior. These are not interchangeable. M7 EXECUTED/backup/migration and other documented NOT_TESTED classifications remain unchanged; native execution is separately evidenced, not retroactively promoted in metadata. Accelerated aged retention fixtures are not elapsed wall-clock soak. Existing native/no-container evidence is not universal runtime equivalence or hostile-code isolation.

Rule: **No new regression against accepted baselines.** Inherited accepted failures remain explicitly unchanged, are never counted green and are not reopened for repair. In particular the Catalog dependency-check failure (`AssertionError: @alica/catalog`, exit1), inherited whitespace limitations, raw historical failures and VM/Python warnings remain recorded. Acceptance preserves every frozen evidence caveat; it does not upgrade coverage or claim new tests.

## Nonclaims and closed authority

Acceptance does not claim production cutover or migration, PostgreSQL, embeddings/vector/advanced retrieval, all future Memory functionality, MemoryV5 or universal migration, Hermes Memory Provider, UniUI/Doghouse/AInbA integrations, universal backup portability, hostile-code isolation or complete production readiness of ALICA services.

No implementation, qualification, hardening, live provider calls (including TypeSafe/Jev), protected Phase3 replay or new external-provider calls are authorized. Phase4's six consumed / zero remaining budget stays CLOSED; no grant is reset or renewed. No production startup, configuration, container, image, database, migration, export/import, routing, active-provider change, shadow cutover or decommission operation is authorized. Production adoption requires separate authorization. No Kernel/ACAP/SDK/frozen Catalog/Hermes/Decision/Foundation change is authorized; Phase1–5.0 originals remain immutable.

## Freeze and stop

The technical tag remains the frozen delivery. **No further Phase5.1 development is authorized.** Future memory work requires separate explicit authorization. Generic Foundation gaps must follow the governed Foundation revision process; memory capability evolution must follow the Evolutionary Catalog process. No Phase5.2 Doghouse + Adapter is authorized; it requires separate explicit Project Owner authorization.

**COMPLETE / FROZEN / OWNER ACCEPTED — STOP.**
