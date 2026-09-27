# Compatibility (C6)

`compatibility(previous, proposed)` from `@alica/catalog/governance` compares
entries already validated with the public Catalog validator. It returns a frozen
`{ classification, reasons }`: BACKWARD_COMPATIBLE, BREAKING or REVIEW_REQUIRED.
BREAKING dominates; any unresolved reason otherwise requires review. The result
is a bounded structural check, not proof of arbitrary semantic equivalence.

Inputs are contravariant: every formerly accepted request must remain accepted.
Outputs are covariant: every new response must satisfy the previous promise.
For unchanged primitive types the bounded checker handles enum/const restrictions,
minimum/maximum, string and array bounds, object properties/required/closedness
and array items. Tightening an input or widening an output is breaking; reversing
those changes may be compatible. Changed unsupported schema keywords and changed
schema descriptions/titles require review. Identical unsupported constructs are
not newly proven, merely unchanged. No network schema resolution is performed.

| Change                                                        | Disposition                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| URI family or ACAP descriptor identity                        | BREAKING                                                      |
| Removed operation, changed request/stream kind or idempotency | BREAKING                                                      |
| Added operation                                               | compatible extension; stable history requires minor increment |
| Increased required permissions or removed scope               | BREAKING                                                      |
| Removed supported cancellation                                | BREAKING                                                      |
| Other cancellation or operation metadata changes              | REVIEW_REQUIRED                                               |
| Changed dependencies, events, ACAP features, error vocabulary | REVIEW_REQUIRED                                               |
| Changed semantic description                                  | REVIEW_REQUIRED                                               |

Provider selection is never part of contract compatibility. Added permissions
cannot be self-granted. Dependency changes remain semantic contracts, not plugin
bindings. A reviewer must assess behavior, errors, streaming, cancellation,
idempotency policy, event payloads and dependency implications beyond the bounded
checker. A review cannot override a detected stable-major break.

Evidence: `catalog/tests/governance.test.mjs` exercises input/output variance,
operation removal/kind, idempotency, permissions, scopes, cancellation, errors,
dependencies, immutable releases and stable promotion. Its operation-kind check
is a comparator unit check, not conformance proof for a streaming provider.
