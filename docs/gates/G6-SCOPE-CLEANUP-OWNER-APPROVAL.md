# G6 scope/cleanup correction: direct owner authorization

The owner directly answered **“Approve the correction; implement and complete G6”**
to the question referring to the proposal in
`docs/g6/INTEGRATION-EXIT-BLOCKERS.md` at target commit
`05c35d91bd2e3241543aa09b8aa9652dd7973174` (branch
`g6/host-integration-candidate`). The synchronized checkpoint records this in
`G6-CORRECTION-PARENT-RESULTS.md`. Main remains `758610b`.

That response explicitly authorizes the entire contained correction:

- Active private protocol minor 2, mandatory `wire.scopevalidation` alongside
  `wire.contexts`, `wire.sdkresults`, and `wire.scopedeffects` in both directions.
- Closed scoped log requests with required scope ID and generation.
- Closed, non-mutating scope-check requests and correlated existing ack/error
  results, before acquisition and at completion under the original endpoint/end.
- Separate authenticated cleanup work descriptors; the actual first release
  endpoint is the broker-owned causal parent, never a caller-asserted identifier
  or a mutable endpoint-global inline-parent inference.
- Existing bounded nested/lifecycle capacity, dispatch roles, first-selection
  coalescing, callback-binding race rules, original deadlines, native authority,
  shared state and observed-reap accounting remain mandatory.

This is an approval record, not a claim that qualification passed. It supersedes
only the proposal's review-pending status, not the preserved failure evidence.
No further approval of these already-authorized semantics is needed.
Frozen G1, public SDK 0.1.0, and all historical `docs/g6/review` artifacts stay
unchanged. The parent alone transfers/builds/tests/commits/pushes the target;
this local correction is not an authorization for remote operations or for
profile, configuration, confinement or security changes.

See `G6-CORRECTION-STATUS.md` for implementation and verification boundaries.
