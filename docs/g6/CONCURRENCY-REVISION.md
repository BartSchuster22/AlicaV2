# G6 concurrency revision — R2 candidate

Status: **design revision completed for review; implementation not approved or qualified**.

The approved direction is recorded in [G6-CONCURRENCY-DIRECTION.md](../gates/G6-CONCURRENCY-DIRECTION.md). The concrete replacement is now [ADR-013 R2](../adr/ADR-013.md), [IPC-PROFILE.md](IPC-PROFILE.md), the revised frame/offer schemas and the proposed native compiler lock in `draft/`.

R2 selects broker-owned invocation endpoints, an inherited native seqpacket carrier, one stateful module instance, four ordinary plus four nested slots, depth eight, scoped provider-owned authority and independent cancellation/deadlines. It explicitly accounts for unconsumed SCM_RIGHTS descriptors rather than releasing their reservations at the consumer deadline.

The model checks the receiving endpoint's authority/budget. It does not pretend a compromised shared process cannot deliberately use another legitimate context capability. Such use cannot revive or answer the expired original call or inherit consumer authority. Per-request OS isolation and semantic-intent proof are not claimed. This boundary and shared process-failure behavior must remain visible in review and qualification.

The proposed compiler is project-local Zig 0.15.2's C frontend, using the pinned Node distribution's public N-API headers. Its archive is not installed or build-qualified in this design step.

The open-ended mechanism exploration is replaced by the concrete R2 proposal. Remaining gate: review the actual R2 ADR, protocol/offer schemas, resource accounting and threat boundary. Then implement and qualify the Node/native adapter. See [QUALIFICATION.md](QUALIFICATION.md) for the evidence boundary and required runtime tests.
