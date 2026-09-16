# G6 IPC baseline approval and implementation gate

The owner explicitly answered “1 is confirmed, 2 is approved” to the numbered follow-up. Item 1 confirmed G5 foundation success; item 2 approved `ACAP-TRANSPORT-IPC-v1` as the design baseline, with implementation-specific ADR and per-frame schemas still requiring review.

## Approved baseline

- Source: `specs/ACAP-TRANSPORT-IPC-v1.md` at `db748180efae54b14701e43336338a7c43e77dad`.
- Local Unix-domain stream sockets; 4-byte unsigned big-endian length prefix; UTF-8 JSON; 1..1048576-byte message bodies.
- OS peer credentials compared against supervisor expectations, plus a fresh supervisor-issued challenge bound to the launched process/package. Provider assertions alone are not authentication.
- Digest/version/feature binding, broker-derived caller authority, bounded streams/queues, cancellation, failure detection and bounded reconnects.
- Disconnect invalidates session handles and outstanding calls; mutations are not automatically replayed.

The original G1 document is retained unchanged. Its historical proposed-status header is superseded by this explicit approval record for the baseline only; approval is not evidence of implemented enforcement.

## Still gated

Before implementing IPC, the ADR and normative per-frame schema set must be prepared and reviewed. The ADR must validate actual process-identity binding, endpoint permissions, isolation feasibility, resource bounds and bounded forced cleanup on the target platform. No alternative transport or weakened authentication is silently substituted.

G6 acceptance additionally requires the unchanged parameterized consumer suite over inproc and IPC, hostile subprocess tests, and recorded bounded failure/cleanup behavior. No container support is inferred from IPC qualification; orchestration is not authorized merely by this baseline approval.

This approval record changes no runtime code, frozen G1 protocol semantics, host isolation settings or production services.
