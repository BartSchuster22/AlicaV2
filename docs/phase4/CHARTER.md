# Phase 4 charter — Revision 1.1

Owner authorized implementation and completion. The full supplied Revision 1.1 plan governs; R1–R10 supersede retained v1.0. Only revised J0–J26 numbering is operative. No Phase 5, Hermes consumer, Kernel/ACAP/SDK changes, STABLE Catalog changes, or Phase-3 production changes. Original Phase-3 protected credentials/grants/ledger/launchers are inaccessible to this work; regressions use disposable MOCK only.

## Immutable baseline

Separate DEV branch phase4/jev at /home/alica-dev/AlicaV2-phase4 starts at accepted Phase3 0df9095dab900458d054dd3b7734dbfaeae9fba8. Remote identities verified before worktree creation:
- phase1-v1.0.0: object 8bc5d5fa961ac0b6430a85338dde48bf14b01f27; commit ab0273e8581fa70cbcf15c07f73e990b5dcc725e.
- phase2-catalog-v1.0.0: object 6cdb59dc590766d0044c751f1cef769be6af9ed8; commit 736b37d03c82ca057e7a397644037ef5d1bed991.
- phase3-hermes-v1.0.0: object 9efe206ab5914cbedcbf5790e538046830b05477; commit 5f3fa4670659d748042788e844081eaf9933752d.
- phase3-hermes-v1.0.0-accepted: object bb07bbacb6e66ab45fe1623d06e7fde813aa9049; commit 0df9095dab900458d054dd3b7734dbfaeae9fba8.
- main: 8fa943bf3f5aa0fb0147dd52e1516683124dfbc8.

## Frozen aggregate physical request budget

MAX_PHYSICAL_LIVE_REQUESTS=6; PER_REQUEST_TIMEOUT=30 seconds, lower public request deadline dominates; DISCOVERY_RETRY_LIMIT=0; EVALUATION_RETRY_LIMIT=0. Singleflight. Exactly one shared durable atomic reservation ledger must exist before dispatch. Reserve and fsync before each send; ambiguous failures consume their reservation. No redirects, hidden retries, reset/replenishment or regression/finalization reruns. Authenticated discovery counts. Sequence: discovery, Noul, Choice, Score, mixed; sixth stays unspent unless a documented harmless validation fixture is useful. No fault/security probes. Public unauthenticated OpenAPI retrieval is contract research, not authenticated model discovery/evaluation.

No authenticated dispatch has occurred. No ledger created yet; implementation must fail closed if required existing ledger is missing after initialization. All six live slots remain unspent, not renewable.

## Contract and topology

Smallest generic DecisionProvider and service via existing public Host/SDK surfaces; Host retains sole authority. New contracts require actual Phase2 gap/proposal/review/admission to EXPERIMENTAL. Parent independent contract admission and substantive implementation review are required before final release.

DecisionDecimal canonical plain base-10 strings; no exponents, plus, negative zero, redundant leading/trailing zeros, NaN or infinity. Proposed boundary: at most 18 fractional digits and 36 total digits; structured numeric fractions use a discriminated typed value representation so ordinary strings cannot become numbers. Wire conversion must parse lexical decimals exactly before binary floats; reject excess precision instead of rounding. Probability/confidence range [0,1]; proposed absolute total and expected-score consistency tolerance 0.000001, exact decimal arithmetic, no renormalization. These details are proposal inputs pending governed contract review, not an admitted contract.

## Data and evidence

Disposable non-sensitive fixtures only. Explicit visible provider choice and disable switch. Keys only via TYPESAFE_API_KEY or dedicated Phase4 secret reference, never Git/Catalog/logs/evidence. Normalize errors without retaining provider bodies (may echo state). Classify each claim PROVIDER-DOCUMENTED, LIVE-OBSERVED or FIXTURE-TESTED-DEFENSIVE. Confidence is metadata, not proof of correctness/calibration. Credential absence blocks J1/J18 and live portions of J19/J20, not permitted contract/neutral work.

## Acceptance-linked task cards

A PRODUCT: J0/J2/J3/J4/J5 — charter, exact public API pin, reviewed generic decimal contract using actual Catalog governance. Necessary for frozen ACAP compatibility; artifact charter+proposal+contract tests; stop slice at parent contract review.
A PRODUCT: J6/J7 — neutral provider and public-surface vertical. Artifact executable end-to-end test; stop at passing authorized consumer with denied authority cases.
A PRODUCT: J8–J17/J21/J22 — adapter semantic and defensive fixture matrix, deadlines/usage/privacy. Artifact exact tests with classified evidence; stop when revised rows supported.
A PRODUCT: J1/J18/J19/J20 — one aggregate authenticated qualification reused for smoke and unchanged external consumer. Needs dedicated key; stop at fixed sequence/budget, never synthetic live evidence.
B REGRESSION: J23/J24 — original accepted regressions, mock Phase3 only, purity diff. Known accepted @alica/catalog frozen dependency-check failure remains explicitly failed and unchanged; no foundation repair.
A PRODUCT: J25/J26 — reproducibility, independent substantive review, reconciled evidence, exact screened paths, public release/tag phase4-jev-v1.0.0 and readback. No tag/completion until J0–J25 supported and parent review. Then STOP.
C OPTIONAL: all future integrations, benchmarks and improvements are excluded and cannot block acceptance.
