# H6 topology decision — implemented candidate, independent review pending

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
Hermes binding, supported model/credential decision, real H12, independent Catalog
review/admission and full external/regression/publication remain open. This ADR
selects the minimal topology on executed evidence; it does not self-award review.
