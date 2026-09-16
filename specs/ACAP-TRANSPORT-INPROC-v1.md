# ACAP-TRANSPORT-INPROC-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Data boundary

In-process transport must use the same public request/result schema validation, grant checks, deadlines, cancellation, error mapping and stream limits as IPC. It MUST NOT expose implementation objects or raw exception classes. Call input and output are detached JSON-compatible values; post-call mutation of caller objects cannot change provider input. Functions, prototypes, symbols and host objects are not ACAP values.

Every handle is bound to provider instance/generation and caller scope. Require/provide does not bypass policy on subsequent invocation. Reentrant nested calls inherit deadlines and use provider's own outbound authority. Provider choice is resolved once per handle, not dynamically based on load timing.

Trusted in-process code is cooperative. A blocked event loop cannot be forcibly cancelled by another callback; lifecycle timeout is a detection/reporting boundary and may require process restart. Unit tests must not claim that cancellation kills arbitrary same-process computation.

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.
