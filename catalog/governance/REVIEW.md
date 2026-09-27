# Proposal and review workflow (C9)

1. Proposer copies `catalog/proposals/templates/proposal.json`. The empty template
   intentionally fails validation. Fill every string and both candidate arrays.
2. Describe a real integration problem, insufficiency of existing contracts,
   reusable abstraction, provider/consumer candidates, draft URI, alternatives,
   security/scope/compatibility implications and generic rationale. Candidates
   belong in proposal evidence, never in provider-neutral definitions.
3. Validate with `validateProposal` from `@alica/catalog/governance` (or the
   proposal schema for tooling). Shape validity is not acceptance of the need.
4. A reviewer distinct from the proposer supplies proposal ID, reviewer,
   decision (`accepted` or `rejected`), rationale and explicit true checks for
   abstraction/security/scopes/compatibility. `reviewProposal` returns proposed
   or rejected disposition. Review all four dimensions even on rejection.
5. The namespace-authorized maintainer validates the definition and actual
   previous entry, inspects implementation/conformance evidence, and calls
   `transition(previous, proposed, evidence)`. Commit proposal, raw review,
   accepted transition record, sources and evidence references together.
6. Include accepted definitions in the local release only after review; retain
   previous releases and rejected proposals separately. No speculative automatic
   promotion. Stable promotion is never implied by a Catalog version number.

Evidence fields: `proposal`, `review` (the result of reviewProposal), `maintainer`,
`reference`, plus `implementation` and `conformance` for experimentation/stability,
`compatibilityReview` when required, and `migration`/`replacement` for withdrawal.
See LIFECYCLE.md for exact transition checks.

`echo-reference.json` and `echo-reference.review.json` are synthetic reference
records for this workflow, not authenticated human approvals. The actual M1
reference conformance test is in `catalog/tests/model.test.mjs`; M2 lifecycle and
negative cases are in `catalog/tests/governance.test.mjs`. External-author
acceptance belongs to M4 and is not established by these example records.

Governance is deliberately local and versioned. String role separation does not
prove identity; maintainers are responsible for real reviewer independence,
evidence inspection and accepted-history selection. No signatures, hosted
service, runtime provider registry or new Kernel policy are introduced.
