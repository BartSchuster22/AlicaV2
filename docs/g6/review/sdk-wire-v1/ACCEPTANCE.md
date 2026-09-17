# Review tests and later runtime acceptance

Status: review candidate, not runtime implementation. Run from repository root:

```sh
python3 docs/g6/review/sdk-wire-v1/build_candidate.py --check
```

```sh
python3 docs/g6/review/sdk-wire-v1/test_review.py
```

Use the existing hash-locked `.tools/python` dependencies on the dedicated target.
The suite is deliberately NOT registered in root `npm run check` or imported by
runtime code. No active schema generation is performed. `RESULTS.md` records actual
execution. Test counts include unittest methods; methods also iterate explicit
positive/negative vectors, not separately reported as runtime tests.

## Executed review coverage

| Obligation | Executable test/model |
|---|---|
| Snapshot determinism and valid JSON schema | meta_schema_and_deterministic_snapshot |
| Active/frozen/runtime/native inputs unchanged | protected_baseline_hashes |
| All eight added shapes, direction and work/control lane rejection | added_shapes_are_closed_directional_and_rejected_by_baseline |
| Required fields, closed objects, no caller/parent/FD assertions | same shape test and limits_types_and_no_numeric_fd_or_scope_spoof |
| Count zero/safe-integer bounds, scope generation, duration/token bounds | limits_types_and_no_numeric_fd_or_scope_spoof |
| Explicit minor/features barrier, duplicate feature and effectLimit rejection | handshake_requires_minor_features_and_host_effect_limit |
| Prior example compatibility and unchanged R2 limits/control definitions | existing_nonhandshake_examples_and_r2_limits_unchanged |
| Real admission versus later delivery distinction, overflow retirement | publication_zero_mixed_admission_overload_and_later_failure |
| Endpoint/generation/origin/wire/pending-kind correlation | pending_operation_endpoint_generation_and_origin_are_binding |
| Bounded outstanding model entries with atomic rejection | sdk_pending_bound_and_no_partial_reservation |
| Lifetime effect capacity includes completed/other Host effects | effect_capacity_matches_host_and_counts_retired_and_other_resources |
| Callback token reuse rejected | duplicate_callback_registration_rejected_without_ownership_change |
| Foreign/closed/wrong-generation/late registration rejected | wrong_scope_generation_closed_scope_and_late_registration |
| Child reverse cleanup order, healthy unrelated scope retained | child_scope_reverse_order_preserves_unrelated_callbacks |
| Failed acquisition rollback, coalesced completion/no double dispatch | failed_acquisition_rollback_reverse_and_shared_cleanup_join |
| Foreign worker/session/generation/scope cannot release victim | release_cannot_retarget_other_session_generation_or_scope |
| Exact pending cleanup response and duplicate-terminal rejection | cleanup_response_context_and_wire_are_exact |
| Error accounting versus cleanup success/reap | cleanup_error_is_not_success_or_physical_reap |
| Busy lifecycle slot preserves selected clock | lifecycle_slot_occupancy_does_not_reset_selected_deadline |
| Inline cleanup uses existing slot and original enclosing deadline | inline_rollback_and_lifecycle_cleanup_do_not_wait_for_own_slot |
| Causal depth 8/9 bound | depth_eight_admitted_nine_rejected_without_partial_transition |
| Timeout first-terminal outcome, shared loss, delayed success, quarantine | timeout_shared_failure_late_reply_and_quarantine_until_actual_reap |
| Cleanup/registration arrival-order binding and conflicting-token rejection | cross_endpoint_cleanup_can_precede_registration_reply |
| Uncertain registration outcome never replayed | unknown_registration_outcome_fails_session_not_replayed |

The reference model supplies trusted Endpoint objects, a supplied clock and a model
reap observation. These are NOT real credentials, native descriptors, physical clocks
or pidfd events. Inline/lifecycle booleans are trusted model inputs, NOT wire fields
or permissions granted to the worker. Model token binding tests exercise the shared
binding transition; they do not simulate socket scheduling. The model is finite per
physical worker; production must additionally enforce supervisor-wide limits.

## Mandatory later acceptance — not executed and not marked passing

After candidate approval and adapter implementation, use one unchanged consumer test
function parameterized over inproc and IPC factories. Record the source hash and
same expected values/errors, including:

1. `emit` returns 0/1/multiple, matches queue overflow behavior, preserves the already
   committed receipt under subsequent grant expiry, revocation and handler failure;
   lost reply must not duplicate publication. Reject ack/secret/invoke substitution.
2. `registerCleanup` truly returns void synchronously; capacity/scope errors throw
   before acquire proceeds. Positive acquisitions with multiple callbacks retain
   order. Failed/timed-out acquisitions roll back accepted callbacks in reverse,
   preserve acquisition error and reject callback registration after closure.
3. Operator closes child/descendant scopes during idle, activation, invocation,
   rollback and instance disposal. Exactly one framework callback execution; sibling
   state stays usable on cooperative success. Test both response/cleanup arrival
   orders using actual separate endpoints and native worker pumping.
4. No hidden capacity reduction or second effect budget: registrations/listeners and
   callbacks compete under the same Host maxEffects; completed effects remain
   charged as in the baseline. Measure actual bounded map, callback and buffer use.
5. Real reserved-lifecycle occupancy, all ordinary slots occupied, inline rollback,
   cleanup invoking an independently authorized nested A→B→A chain, max depth and
   simultaneous scope-close/instance-dispose. No queue-behind-ancestor deadlock.
   Verify pending control/administrative saturation cannot disable supervision.
6. Inject wrong callback/effect, foreign scope/worker/generation, replay, wrong wire
   direction, unsolicited inline cleanup, acknowledgement-before-execution, forged
   aggregate reports and stale frames after restart. Physical peer authentication
   and broker endpoint lookup must reject them; schema/model validation is not proof.
7. Crash before/after registration commit/reply and before/after callback start/result.
   Unknown outcomes do not replay or release physical capacity. Callback exception,
   unresolved Promise, infinite loop and late result produce correct first-terminal
   report. Use actual owned pidfd termination/reap and observe retained quarantine
   on failed reap. Cooperative child close and forced shared-worker failure must be
   reported differently, without false claims of per-call process isolation.
8. Full existing G6 matrix: actual confinement, handshakes/digests, grants/revocation,
   native carrier ownership, stream/backpressure, ordinary/nested concurrency,
   budgets, heartbeat/stalls, recovery, resource measurements and bounded cleanup.

Review-model passes and unchanged-baseline full checks do not discharge any of
these runtime rows. Owner approval is required for the candidate's semantics;
owner acceptance of G6 requires a later fully qualified exact implementation.
