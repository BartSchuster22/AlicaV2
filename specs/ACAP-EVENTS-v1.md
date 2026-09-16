# ACAP-EVENTS-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Envelope

`event.schema.json` binds eventId, type, contractDigest, sourceProvider, sourceScope, sequence, timeMs and data. The Kernel supplies source identity/scope; callers cannot spoof them. The payload is validated against its declared contract. `sequence` increases within an event source instance; it is not a global clock or durable offset. Event contract versioning follows ACAP.

## Delivery

v1 supports typed observation events only, not middleware waterfalls or policy interception. Delivery is asynchronous, FIFO per source/subscription, at-most-once within a live subscription; there is no replay/durability promise. Across sources no order is guaranteed. Each subscription is scope/owner-bound and disposed on owner teardown. Before each delivery, revalidate scope visibility and grant. Subscribe permission does not grant publish permission.

The queue limit defaults to 256 events and may be lowered by policy. Overflow MUST terminate the affected subscription with RESOURCE_EXHAUSTED rather than silently dropping an unknown subset; other authorized subscribers continue. Handler errors are isolated and audited without crashing unrelated plugins. The event fabric MUST NOT grow a workflow engine or persistent broker.
