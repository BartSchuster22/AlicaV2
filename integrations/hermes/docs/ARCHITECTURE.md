# ADR H6 — verified VM provider with trusted public-Host process bridge

DEV Node24.21.0 public Host/SDK test on 2026-09-27: 7 passed, 0 failed.
The original four constraints were rerun through the modified imported fixture.
The verified VM registers the ACAP provider at activation. A trusted operator
uses the same provider's public Host.context + SDK on/emit/effect to own a
request-scoped external process. Signed declared adapter-internal events with
explicit grants connect the two. No frozen foundation change, generic transport,
container, duplicated provider, or Hermes code in generic packages is required.
The consumer uses only the neutral capability; it cannot select process/config.

The operator is trusted host assembly, not a malicious-code sandbox. Event grants
must be restricted to this provider instance/scope/generation; source checks,
sequence checks and request correlation reject foreign/stale replies. The VM
forwards only admitted calls, propagates signal cancellation, and rejects pending
work on disposal. Operator work is single-flight with bounded deadline. Subprocess
stdout/stderr are bounded; stderr never crosses the contract. SIGTERM then SIGKILL
is local cleanup, not proof of remote cancellation or billing cessation. Failure
to confirm bounded cleanup poisons the runner. No retries or fallback.

Synthetic callback and controlled subprocess tests prove topology/lifecycle only.
The subsequent real H12 task passed on the historical source recorded in VERSION;
current candidate dd6ae758 is independently reviewed/MOCK-qualified, not live-rerun.
Governed EXPERIMENTAL Catalog admission, unchanged packed external consumer and
actual Host restart/generation/stale-handle tests provide the later evidence.
The parent independently reviewed the original three-file Host/native evidence
slice and its two-ID correction and accepted that finite slice after 20/20 PASS.
This author makes no independent-review or final owner-acceptance claim.

Alternatives: a verified in-process plugin cannot import child_process; deferring
registration until after ACTIVE or duplicating a child-scope provider fails the
existing public Host contract (topology.test.mjs). A new generic IPC transport or
container adds scope with no unmet requirement. The selected public event/effect
bridge keeps Hermes and process ownership outside the frozen Kernel and retains
the established ACAP consumer. Existing public dispatch, SDK event grants and
bounded local stdio framing suffice; no stable contract or Kernel change.

Consequences: trusted operator/child; single-flight finite task; local process
cleanup is bounded, remote cancellation/billing stop is not guaranteed. No generic
telemetry, arbitrary plugins, sessions or service integration. Release/publication
status is separate in docs/phase3/PHASE3-COMPLETION.md.
