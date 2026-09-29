# Phase 5.K — Owner Acceptance

- Phase: Phase5.K Hermes Kanban + ACAP Adapter
- Technical Release: phase5k-hermes-kanban-v1.0.0
- Technical Release Commit: 24ebab2bd2b7d58ec0b31642156b17cdf4982b5d
- Technical Annotated Tag Object: 2612ad977403b6c9eaa14711ebab282962d6bdd3
- Acceptance Authority: Project Owner
- Decision: ACCEPTED
- Status: COMPLETE / FROZEN / OWNER ACCEPTED
- Accepted scope: isolated nonlaunching durable Kanban-state integration.

This records the explicit Project Owner decision, not an agent's independent grant of authority. Technical delivery and Owner Acceptance are separate historical events. The technical tag is immutable and unchanged; its original completion report, pending-acceptance wording, source, qualification, evidence and review history remain historical records. This later documentary acceptance neither rewrites those records nor authorizes implementation, hardening, testing or requalification.

## 1. Sole authority and architecture

Hermes remains the sole authoritative system for boards, tasks, lifecycle, runs, worker state and event history:

ALICA Consumer -> Public ACAP Kanban Contract -> stateless Hermes Kanban Adapter -> supported authenticated Hermes REST/WebSocket -> Hermes sole Kanban state.

No mirrored domain state, adapter database or dual authority is accepted or authorized. Any later metadata capability requires separate governance; transient trusted identity mappings and bounded active calls do not constitute a domain-state store.

## 2. Accepted supported boundary and qualified slice

The supported boundary is unchanged: public SDK integration through supported authenticated Hermes REST/WebSocket. No SQL, private Hermes calls, filesystem integration, dashboard scraping or CLI scraping is admitted.

Acceptance covers the documented qualified slice: authorized board/task reads and listing; unassigned triage creation; selected title/body updates; informational comments/handoffs; bounded events; scope/grants and normalization; restart, reconciliation, backend restart, task persistence and adapter lifecycle cleanup; an SDK-only external consumer; isolation, anonymous reproduction, independent review, blocker correction and governed EXPERIMENTAL admission. Informational handoffs do not assign or dispatch work. This acceptance relies on retained qualification, not new execution.

## 3. Durable state integration, not execution orchestration

Durable Kanban-state integration is NOT execution orchestration. The retained final nonlaunching evidence records 16 unassigned triage tasks, no workers and no runs. Dispatch, assignment, worker launch/provisioning, termination, execution-triggering transitions, retry and general control remain deferred and NOT authorized. Adapter disposal is not backend work termination.

No production state mutation, worker/run operation, daemon installation or Hermes configuration change is authorized. Execution orchestration requires separate explicit authorization.

## 4. Mutation ambiguity and bounded events

UNKNOWN after transmission is NOT FAILED. Best-effort sequential replay and last-writer-wins updates are not exactly-once or compare-and-swap (CAS). There is no automatic rollback, guaranteed safe retry or inference that cancellation, revocation, timeout or disposal undoes a potentially committed mutation. Reconciliation is not an atomic snapshot guarantee.

Events remain bounded retrieval/observations under the actual documented limitations: no exactly-once events, infinite replay, gap-free subscriptions, guaranteed event continuity or universal retention. Continuity remains UNKNOWN; replay duplicates, future/stale cursors and uncertain retention remain possible. Native WebSocket buffering precedes the application's frame-size check; no hostile-peer memory-quota guarantee is claimed.

## 5. Catalog status and capability governance

The Catalog capability is EXPERIMENTAL, NOT STABLE. Qualification of this implementation scope is not universal contract stability. Future capability changes require Evolutionary Capability Catalog governance.

Provider B is future empirical provider-independence validation, not authorized provider selection, implementation, testing or promotion. Provider B and an ALICA Kanban Service each require separate authorization. No second backend, ALICA-owned Kanban persistence, persistence/orchestration database or adapter domain store is authorized.

Kanban remains orchestration/kanban/*, not universal work.*, a DAG/workflow/swarm facility or an event orchestrator. No distributed consensus, multi-host ownership, cluster locking, high availability, cross-host transactions, distributed leases or distributed Hermes claims are made.

## 6. Production credentials and adoption

Production credential binding is NOT QUALIFIED and remains unsupported. Only the frozen public synthetic-test fixture reference is qualified. No production secret binding, rotation or access is authorized. Production adoption, deployment and production qualification are separate decisions, not consequences of Owner Acceptance.

## 7. Deferred capabilities and preserved technical limitations

Dispatch, termination, assignment, dependencies, broader transitions, retry/general control, workspace/artifact integration, import/export, migration, Provider B, ALICA Kanban Service, Doghouse-Kanban integration and UniUI remain deferred. No universal migration, active-run continuation after migration or Phase5.3 claim is made.

All additional frozen technical limitations remain in force, including trusted native operator composition rather than hostile-code isolation, the native WebSocket prebuffer limitation, bounded transport/task/event limits, synthetic-fixture labeling and the precise supported runtime pin. Acceptance does not broaden any frozen contract or qualified envelope.

## 8. Regression truth

The retained regression conclusion is no new regression against accepted previous baselines within the documented checked scope. Inherited dependency-checker rejection of @alica/catalog and retired MemoryV4v1 failures remain failed and recorded: neither passed, repaired nor reopened by this acceptance. There is no blanket repository-wide green claim. The historical offline Decision proofs made zero authenticated live requests; they do not renew live authority. No new tests, builds or requalification are part of this documentary acceptance.

## 9. Independent review history and evidence

The chronology is preserved: candidate -> independent review -> three blocking findings -> targeted fixes -> targeted evidence -> independent closure -> technical publication -> separate Owner Acceptance. The first candidate is NOT rewritten as approved.

The three findings concerned current authority across a preflight read, committed padded-title creation misreported as conflict, and Unicode contract round trips. Fixes at 4fb39bc81c589e719faab06d495da31b79d01ad3 received same-reviewer independent closure. The original 19-case admission evidence remains distinct from the subsequent 25-case corrected qualification and anonymous exact-tag evidence.

Frozen references (all at immutable technical commit unless explicitly stated):

- [Technical completion](https://github.com/BartSchuster22/AlicaV2/blob/24ebab2bd2b7d58ec0b31642156b17cdf4982b5d/docs/phase5k/PHASE5K-COMPLETION.md)
- [Evidence and regression caveats](https://github.com/BartSchuster22/AlicaV2/blob/24ebab2bd2b7d58ec0b31642156b17cdf4982b5d/docs/phase5k/EVIDENCE.md)
- [Source hashes](https://github.com/BartSchuster22/AlicaV2/blob/24ebab2bd2b7d58ec0b31642156b17cdf4982b5d/docs/phase5k/SOURCE-SHA256.json)
- [Original blocked independent review](https://github.com/BartSchuster22/AlicaV2/blob/24ebab2bd2b7d58ec0b31642156b17cdf4982b5d/docs/phase5k/review/FINAL-REVIEW-BLOCKED.json)
- [Targeted remediation](https://github.com/BartSchuster22/AlicaV2/blob/24ebab2bd2b7d58ec0b31642156b17cdf4982b5d/docs/phase5k/REVIEW-REMEDIATION.md)
- [Independent closure](https://github.com/BartSchuster22/AlicaV2/blob/24ebab2bd2b7d58ec0b31642156b17cdf4982b5d/docs/phase5k/review/FINAL-CLOSURE.json)
- [Final public-release readback receipt, on preserved receipt branch](https://github.com/BartSchuster22/AlicaV2/blob/3428a12ab8c879f5ecd789b17309d23663dd3928/docs/phase5k/publication/final-readback.json)
- [Frozen technical source](https://github.com/BartSchuster22/AlicaV2/tree/phase5k-hermes-kanban-v1.0.0)

Before acceptance edits, credential-free anonymous public verification matched the annotated technical object/peel, exact source tree 3cb2ceff3ea73879a404507800b6b175af9cb5b7, full git-archive SHA256 904a547f00e79281c39322ce3be38129e528fb3caa8b1a321d91a1e1d7385d63, retained qualification/source hashes, technical completion, original blocked review, independent closure and final receipt. This was identity/document verification only, not BUILD/TEST/requalification.

## 10. Frozen prior phases, closed grants and STOP

Phase1 Kernel/ACAP/SDK, Phase2 Catalog, Phase3 Hermes Harness, Phase4 Decision/TypeSafe Jev, Phase5.0 Service Foundation, Phase5.1 MemoryV4 and Phase5.2 Doghouse remain frozen and unchanged. All previous technical and accepted tags remain unchanged. Closed Phase3 and Phase4 live authorities remain CLOSED; Phase4's six grants remain consumed with zero remaining. Newly consumed grants: 0. No TypeSafe/Jev or external provider calls, budget renewal, operational Doghouse/UniUI change or DSH2 action is authorized.

Explicit nonclaims: full orchestration; dispatch; termination; provisioning; production credentials; exactly-once; CAS; event continuity; distributed Hermes; Provider B; ALICA-owned Kanban state; deployment; universal migration; active-run migration; DAG/workflow/swarm; Doghouse-Kanban; UniUI; Phase5.3. No production deployment or production qualification is granted.

COMPLETE / FROZEN / OWNER ACCEPTED within the isolated nonlaunching durable Kanban-state integration scope. STOP. No implementation authorization follows from this acceptance. Future capability changes require Evolutionary Capability Catalog governance; execution orchestration, Provider B and ALICA Kanban Service each require separate explicit authorization.
