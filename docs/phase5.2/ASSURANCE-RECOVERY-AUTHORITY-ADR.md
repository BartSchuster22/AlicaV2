# D2 disposition and D3 assurance/recovery ADR

Decision: semantic mapping and new isolated assurance domain; no operational module reuse/import. Observation authority NEVER includes recovery authority. This ADR freezes the boundary, not the later incident design. Exact source is pinned in BASELINE-RECONCILIATION.md. All paths below are tracked source under src/doghouse at that revision. Historical tests are static references, NOT executed qualification.

|Feature / entrypoint|Dependencies and authority|Disposition / verification reference|
|---|---|---|
|service_watchdog/checker.py classify/check_service|httpx live/ready/health probes; prior state counters; diagnostics; incident writes; possible executor call|ADAPT classification meaning only; REPLACE ingestion with public events. tests/test_service_watchdog.py; no HTTP probe in new slice|
|service_watchdog/incidents.py incident_key/should_emit_incident/maybe_write_incident|service+classification hash ignores changing reason; timestamp suppression; JSON/Markdown writes, separate dedupe file, key-based redaction|MAP historical meaning, REPLACE persistence/dedupe; old suppression does not count distinct occurrences or portable OPEN continuation|
|service_watchdog/reconcile.py reconcile_open_incidents|calls current checker+shadow and moves files; persist=False does not prevent subsidiary side effects|REPLACE explicit rule recovery; no import or execution. Old directory moves are not canonical resolution authority|
|service_watchdog/diagnostics.py collect_diagnostics/redact|TCP requests, /proc, hostname/load, key/text masking|DEFER collectors; REPLACE evidence with strict allowlisted bounded facts, not arbitrary diagnostic/log retention|
|host_executor/executor.py execute_host_action/validate_executor_request|subprocess, systemctl policy, cooldown, active control, audit hash chain; dry-run can write audit|DEFER entirety to separately governed recovery authority; no executor dependency or restart/kill operations. tests/test_executor_hardening.py NOT RUN|
|main.py / worker.py|uvicorn, operational registry and configs, scheduling of checks/reconcile/shadow/audit|REPLACE native assurance entrypoint; DEFER operational scheduler/deployment. tests/test_worker_scheduler.py NOT RUN|
|common/service_config.py and common/config.py callers|service registry/config paths, runtime unit/endpoint/policy binding|REPLACE with isolated operator allowlist; imported target text cannot register a target|
|notifications/notifier.py, audit/checker.py, evidence/daily.py (via main/worker imports)|notification outbox, audit/evidence writes and registry dependencies|DEFER; retain only domain transition records required for assurance; no notification delivery or generic audit platform|
|shadow/checker.py, devtask_watchdog/checker.py, readiness/openclaw.py (via main/worker)|operational observations, devtask state/heartbeats, current service checks|DEFER observer adapters; report-only concept retained but not treated as a security sandbox|
|cutover/manager.py, drills/restart.py (main command dispatch)|cutover and restart authority|DEFER, no invocation; kill remains excluded|
|qa/gate.py, security/review.py, release/rc.py, soak/report.py (main dispatch)|operational QA/security/release aggregation and evidence writes|DEFER old execution; BUILD finite isolated D17–D21 acceptance fixtures; no wall-clock soak claim|
|deploy/systemd/*, Dockerfile|host service/timer or container startup|DEFER deployment; native tests must not depend on these|
|Canonical exchange / ACAP adapter / Foundation conformance|absent from historical incident path|BUILD only after D5–D8 review freeze|

Inventory precision: direct static body inspection establishes checker/incidents/reconcile/diagnostics/executor/main/worker and tracked check-service/Docker entrypoints. Remaining deferred features are proven reachable from those imports/dispatch paths; no claim of complete internal security assessment. Deferral means no code reuse and no execution, not a positive safety certification.

Core may own observations, incident assessment/history, acknowledgements and rule-evidenced resolution. Adapter may authenticate broker envelope, narrow producer/observer/target/scope and submit immutable facts. Store port may persist only assurance state. ACAP may query/acknowledge under local grants and data-scope authorization, not supply identity via input. Import is historical data validation only. Local registrations/credentials/grants/privileged targets/sockets/control cannot cross exchange. No action/recovery request capability is introduced. Manual resolution/annotations require explicit D6 disposition before code.

D2 PASS for scoped disposition. D3 PASS for authority boundary. Neither implies D4 or runtime implementation passed.
