# Pinned backend feature/authority mapping

Pin:536802c00e4f93061fc46b134dc029ff695f364f. Candidate authority discovery is preserved in prior-evidence/original-preimplementation-result.md; it was static-only at that time and is not retrospectively relabeled executable. `evidence/feasibility-attempt3-k4.log` supplies later executable default/schema/dispatch-safety proof.

The adapter uses the normal `hermes serve --isolated --host127.0.0.1 --port19119` server, not a private router. Actual command tokens are in proof/qualification.py. All routes below have `/api/plugins/kanban` prefix and trusted operator-selected board query. REST bearer credential and WS token authenticate the backend service; exact caller permission is additionally enforced by public Host grants and current trusted operator mapping. Backend is not claimed to enforce equivalent per-principal ACLs.

| ACAP | Supported route | Effect/limits |
|---|---|---|
| board/list | GET /board | Domain read, default backend nonarchived columns. Derived diagnostics/history rollups may be evaluated; no lifecycle promotion selected.256-task/256KiB bounds fail rather than truncate. |
| get | GET /tasks/{encodedId} | Sanitized task only; raw diagnostics, runs, paths, provider metadata, attachments and dependency details not returned. |
| create | POST /tasks | MUTATE: explicit triage=true, assignee=null, parents=[]; backend source/actual response defaults scratch workspace kind but no workspace path, worker PID, current run, provider/model/skills overrides. Actual no-run check mandatory, not inferred from triage alone. |
| update | PATCH /tasks/{encodedId} | MUTATE title/body only after current task observation is unassigned triage; no transactional precondition/CAS guarantee. |
| comment | POST /tasks/{encodedId}/comments | MUTATE append informational body and trusted actor. Repeats append. Operational workers could consume comments outside this isolated scope; no such deployment is qualified. |
| events | WS /events?board=…&since=…&token=… | Actual incremental transport, not merely SQL event history. Selected normalized created/edited/commented facts, inspected-prefix cursor; continuity UNKNOWN. |

Caller identity, status, assignment, worker/model/provider/project/workspace/runtime/retry/goal knobs, dependency links and arbitrary metadata are not accepted payload authority. Generic body/title text is content, not trusted command or identity; origin attribution is informational, never parsed as a grant. Python title strip semantics and JSON Schema Unicode code-point limits are preserved. Pinned source create idempotency lookup occurs before write transaction (kanban_db.py1323–1332): concurrent duplication is possible. No native strong idempotency claim; mismatched returned contents after possible send are UNKNOWN. An explicit provider status error is distinct from transport ambiguity.

Task statuses are observations, not transitions: TRIAGE/TODO/SCHEDULED/READY/RUNNING/BLOCKED/REVIEW/DONE/ARCHIVED. RUN/attempt state is not exposed as task command authority; no success/review/approval equivalence inferred. Run lists/PIDs are only inspected by qualification operator for no-side-effect evidence. Control, dependencies, archive/delete, worker provisioning, artifact/workspace access, migration/export/import and active-execution continuation are deferred. Adapter stores no business data. Hermes remains sole authority.
