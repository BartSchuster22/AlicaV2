# G6 owner decision — bounded concurrency and reentrancy

Status: **direction approved; revised implementation design review pending**.

## Owner response and its scope

The owner replied **“we agree for you recommendatio”** to the recommendation to retain the small native Linux bridge and locked C toolchain, but revise the single-active-invocation design before implementation.

The accepted recommendation explicitly called for bounded concurrency, successful reentrancy within declared limits, broker-owned invocation records, provider-origin requests using provider authority rather than asserted consumer authority, and review of concrete causal-deadline enforcement. Single-active execution may be an initial test configuration, not the final G6 equivalence target.

This approves that direction. It does **not** approve candidate `5bb062f9bfcb7e803f17a7279c5a2b1802e06ca4` unchanged, invent an approved replacement concurrency limit, or waive the retained ADR/frame-schema review. The native bridge and locked build-toolchain direction need not be requested again; concrete changes must remain within the revised approved design and existing dependency controls.

G5 acceptance and IPC-baseline approval remain valid. No G6 runtime implementation, transport equivalence, hostile-process qualification, new CI success or G6 acceptance is established by this agreement.

## Repository disposition

- Mark the earlier ADR/profile as requiring revision, rather than silently treating their single-active restriction as accepted.
- Preserve the earlier schema/probe/check evidence as historical evidence for that candidate.
- Prepare revised causal-context, scheduling, frame and resource rules against the approved concurrency direction.
- Require actual successful concurrent/reentrant cases, state preservation and hostile cross-context tests in the unchanged consumer suite.

See [revision design notes](../g6/CONCURRENCY-REVISION.md). Implementation remains gated on review of the concrete revised ADR and schemas, not on another approval of this direction.
