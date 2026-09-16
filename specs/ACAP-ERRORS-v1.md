# ACAP-ERRORS-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Envelope and codes

`error.schema.json` defines `{code,message,retryable,correlationId}` with no arbitrary stack/data field. Messages MUST be redacted. Stable codes: INVALID_ARGUMENT, UNAUTHENTICATED, PERMISSION_DENIED, NOT_FOUND, INCOMPATIBLE_VERSION, CONTRACT_MISMATCH, CONFLICT, DEADLINE_EXCEEDED, CANCELLED, UNAVAILABLE, RESOURCE_EXHAUSTED, FAILED_PRECONDITION, INTERNAL.

Malformed values -> INVALID_ARGUMENT; valid but unsupported version -> INCOMPATIBLE_VERSION; signature/digest mismatch -> CONTRACT_MISMATCH at the trusted boundary; denied/expired/revoked authority -> PERMISSION_DENIED; stale instance -> FAILED_PRECONDITION; lost process -> UNAVAILABLE; bounded queue exhaustion -> RESOURCE_EXHAUSTED. Raw exceptions map to INTERNAL with a safe message. Hidden capability details MUST NOT be disclosed; permission denial precedes catalog detail disclosure.

`retryable` is an advisory condition, never permission for automatic replay. Only UNAVAILABLE and RESOURCE_EXHAUSTED may be marked retryable in v1; operation idempotency still controls whether caller retries. A deadline/cancel race produces one terminal outcome: the first transition committed by the broker; late responses are discarded. Each transport MUST expose the same ACAP code for equivalent failures. Local stack traces remain in a separately protected diagnostic channel only if redacted.
