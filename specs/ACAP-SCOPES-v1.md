# ACAP-SCOPES-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Scope tree

A Cell has one root scope. A scope has immutable ID, parent, owner instance and generation. IDs are opaque ASCII tokens, not filesystem paths. Only root operator authority or a delegated parent authority may create children. A child's effective authority is the intersection of requested authority and parent authority. Profiles cannot widen it.

A registration is visible within its registration scope and descendants only, subject to grants and explicit provider policy. Parent and sibling access to descendant registrations is denied by default. Cross-scope sharing requires explicit parent-owned re-registration through a controlled proxy; it never changes the child's authority implicitly. Resolution selects within the consumer's ancestor chain.

## Destruction

Mark the subtree CLOSING atomically before cleanup: reject new registrations, child creation and calls. Cancel outstanding calls, invalidate generations, remove subscriptions/registrations, then dispose children before parents in reverse ownership order. Destruction is idempotent. Retained handles fail FAILED_PRECONDITION after destruction even if IDs are reused in later instances. A scope ID reuse MUST use a new generation; persistent handles are forbidden.

Managed resource cleanup guarantees apply only to effects registered through public ownership mechanisms. Direct OS effects by trusted in-process code are outside enforceable isolation and must be documented as a plugin compliance obligation. IPC process termination is the containment boundary for uncooperative isolated providers.

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.
