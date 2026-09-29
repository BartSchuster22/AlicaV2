# ALICA V2 — Phase 5.K

# Hermes Kanban + ACAP — Architecture Review

**Status:** Pre-build document assessment; no implementation authorization.

**Reviewed document:** `ALICA_V2_Hermes_Kanban_ACAP_Architecture_Assessment.md`

**Purpose:** Assess the proposed Kanban integration before Phase 5.3 UniUI and identify the decisions required for a bounded Building Plan.

**Evidence boundary:** This is a review of the supplied document, not verification of the current Hermes implementation. Claims about backend features require the source/API investigation specified in Section 21 of the reviewed document.

## Executive assessment

The proposed core architecture is recommended for the next phase before UniUI. It is a sound architecture assessment, but not yet a sufficiently bounded Building Plan.

## 1. Retain the central architecture

```text
ALICA consumer
    ↓
Public ACAP Kanban contract
    ↓
Hermes Kanban Adapter
    ↓
Supported Hermes business/API layer
    ↓
Hermes-owned authoritative state
```

The strongest decisions are:

- **One state authority:** Hermes owns boards, tasks and the associated authoritative history.
- **No direct SQLite integration:** the adapter preserves backend domain rules rather than bypassing them.
- **No premature universal orchestration service:** Kanban establishes useful contracts without defining DAG, workflow and swarm semantics.
- **No speculative ALICA Kanban database:** portability does not require mirrored operational ownership.
- **Provider B later:** an independent implementation tests whether the contract avoids Hermes-specific assumptions.

### Wording correction

“ACAP prevents harness lock-in” is too absolute. ACAP provides the boundary through which lock-in can be reduced. Actual independence depends on contract semantics, public-consumer evidence and eventually Provider B.

## 2. Separate durable task state from execution orchestration

Kanban is more than a visual board. However, the proposed scope spans two materially different concerns:

| Concern | Example | Authority implication |
|---|---|---|
| Durable work management | Create tasks, dependencies, comments and review state | Governed state mutation |
| Execution orchestration | Dispatch workers, claim execution, retry runs, terminate work | Runtime/control authority |

**A task-state mutation can indirectly trigger execution.** Classifying an endpoint as `MUTATE` is insufficient if its effect is to make a task dispatchable.

The Building Plan must establish:

- Which changes are purely documentary.
- Which transitions make work eligible for execution.
- Whether an existing dispatcher reacts automatically.
- Which explicit authority is required for those effects.
- How isolated qualification prevents accidental worker launches.

**Recommendation:** Defer dispatch and termination in the initial slice unless the phase explicitly requires an end-to-end execution proof. If deferred, describe the delivery as a **durable Kanban-state integration**, not full execution-orchestration qualification.

## 3. Make the supported backend boundary a hard gate

“Supported Hermes business/API layer” is the correct requirement, but needs a concrete definition.

Before implementation, identify:

- Exact Hermes source revision and selected component.
- Supported callable entry points.
- Their compatibility expectations.
- Whether they enforce lifecycle and authorization themselves.
- Whether importing or initializing them starts dispatchers, creates operational state or loads privileged configuration.

**An importable Python function is not automatically a supported public integration boundary.**

If a required operation has no acceptable interface:

1. Record the gap.
2. Identify whether resolution belongs in Hermes, the adapter, Catalog or Service Foundation.
3. Obtain separately governed resolution before dependent implementation.

Do not fill the gap with SQL, private module calls or dashboard scraping.

## 4. Freeze lifecycle, concurrency and ambiguous-outcome semantics

“Task update,” “transition,” “retry” and “run termination” can differ substantially between providers. These are critical preimplementation contract decisions.

| Area | Required decision |
|---|---|
| Task lifecycle | Transitions, prerequisites and resulting side effects |
| Task versus run | Multiple attempts and which attempt determines current status |
| Concurrent mutations | Stale-update detection and conflict responses |
| Dependencies | Cycle handling, cross-board references and dependency satisfaction |
| Review | Whether task completion and review approval are different facts |
| Idempotency | Retry keys, their scope and behavior after restart |
| Timeout | How a caller discovers whether a timed-out mutation committed |
| Cancellation | Whether it stops waiting, cancels an operation or terminates execution |
| Deletion | Supported deletion, archival-only behavior or deferral |

**The adapter must not claim stronger atomicity or retry guarantees than the backend provides.** An uncertain outcome must remain explicit rather than being returned as a definite failure that invites unsafe retries.

## 5. Define event delivery, not only event mapping

The proposed event boundary is useful for future UniUI and Doghouse consumers. Section 11 currently mixes the desired outcome with an unverified transport assumption.

Specify:

- Event identity and schema version.
- Board/task/run identity and provenance.
- Ordering scope.
- Duplicate-delivery behavior.
- Replay cursor semantics.
- Retention and expired-cursor behavior.
- Reconnection and missed-event reconciliation.
- Subscription authorization and revocation.
- Backpressure, payload limits and cleanup.

Distinguish:

> Consumers do not poll Hermes internals.

from:

> No component ever polls.

A bounded adapter using a supported public incremental-read interface may be viable. It must not be presented as native push delivery, and its freshness and gap behavior must be documented.

**A stored event history is not, by itself, proof of a usable subscription interface.**

## 6. Refine the prohibition on duplicate persistence

The prohibition on a second synchronized Kanban database is essential. However, “the adapter must not duplicate persistence” could be read too broadly.

An adapter might legitimately need bounded integration metadata, such as a delivery cursor or identity mapping, if the selected interface requires it.

Recommended rule:

> The adapter must not become a second authority for board, task, dependency, run or lifecycle state. Any adapter-owned durable metadata must have an explicit purpose, bounded retention, recovery semantics and no competing domain authority.

Prefer stateless operation where possible. Do not build a generic adapter database merely because metadata might eventually be useful.

## 7. Tighten identity and authority mapping

The `Principal + Scope + Grant` model is appropriate. Effective permission must be constrained by both the ALICA grant and the backend’s permitted operation.

The design must address:

- Whether the backend represents the originating principal.
- Whether the adapter acts through a service identity.
- How attribution is retained without trusting caller-supplied identity fields.
- Board/task/run lookup without cross-scope existence leaks.
- Cross-board dependencies and references.
- Worker visibility versus permission to use that worker.
- Workspace and artifact access.

**A visible worker is not an authorized execution target. An artifact reference is not permission to read an arbitrary local path.**

Where Hermes does not offer equivalent per-principal controls, document the adapter’s trusted enforcement boundary rather than implying backend enforcement exists.

## 8. Keep portability proportionate to the phase

Section 15 is appropriately cautious. Preserve that caution.

Distinguish:

1. **Provider-neutral public contracts:** required.
2. **Historical semantic mapping:** useful and bounded.
3. **Canonical export/import:** separately selected scope.
4. **Continuation of active execution after migration:** substantially stronger and not implied.

A historical run record may be portable while its process, lease, workspace or credentials are not.

**Import must never launch work or restore runtime authority implicitly.** If portability is included, define treatment of in-progress tasks and runs explicitly.

Provider B implementation remains future work, not a hidden completion dependency for this phase.

## 9. Narrow the initial acceptance slice

Section 13 is a reasonable candidate list, but too broad to serve as committed scope.

### Recommended starting slice

- Read a selected authorized board.
- Create, read and list tasks.
- Perform explicitly selected updates/transitions with understood side effects.
- Add comments or handoff records.
- Include dependencies only with defined semantics.
- Expose selected lifecycle events with bounded replay/reconciliation.
- Provide worker/run read visibility only where necessary.
- Prove authorization, conflicts, retry behavior, persistence across restart and adapter disposal.

### Defer by default

- Dispatch and termination.
- Worker provisioning or profile administration.
- Automatic retries that launch new executions.
- Workspace creation and arbitrary artifact access.
- Swarm features and dispatcher tuning.
- Provider replacement or live-state migration.
- Doghouse and UniUI integration.

**Disposing of the adapter must not implicitly shut down Hermes or terminate backend-owned work.** Include this lifecycle distinction in acceptance coverage.

## 10. Building Plan and release gates

Recommended execution order for the later Building Plan:

```text
Charter and isolated qualification boundary
→ pinned source and feature/authority inventory
→ proven supported backend and public ACAP paths
→ exact initial-slice selection
→ lifecycle / concurrency / identity / event contracts
→ independent design review and PROPOSED capabilities
→ ServiceManifest validation and design freeze
→ implementation
→ executed conformance and EXPERIMENTAL admission
→ public external-consumer proof
→ failure/security/restart qualification
→ no-new-regression and purity audit
→ finite independent candidate review
→ technical publication and anonymous verification
→ freeze and STOP for Owner Acceptance
```

Qualification must use isolated boards, state, identities and fixtures, not operational queues or production workers.

Real external-provider calls should not be necessary for state integration. Any execution proof must separately define its permitted worker and authority.

## Overall recommendation

Proceed with Kanban as the next planning subject, using the supplied assessment as the architectural basis. Keep **Phase 5.K** provisional until the phase identifier is deliberately frozen. Do not renumber frozen releases.

Essential amendments:

1. Distinguish state integration from execution orchestration.
2. Treat backend availability claims as unverified until inspection.
3. Make the supported-interface gate real.
4. Freeze lifecycle, concurrency, retry and event semantics.
5. Allow only narrowly justified adapter metadata, not duplicate domain authority.
6. Select an explicit first slice and defer control by default.
7. Bound portability and require isolated qualification.

## Authorization boundary

This assessment does not authorize discovery execution, implementation, operational changes, Catalog admission, production adoption or Phase 5.3 work. Phase 5.2 Doghouse remains frozen.

The next recommended deliverable is a bounded Building Plan, not an immediate adapter build.
