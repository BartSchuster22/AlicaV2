# ALICA V2 --- Phase 4

# ALICA Decision Service + TypeSafe Jev Adapter --- Building Plan

## Revision 1.1

**Revision basis:** Phase-4 Building Plan v1.0 plus the
pre-implementation assessment.\
**Normative rule:** The Revision 1.1 amendments below supersede any
conflicting language in the retained v1.0 plan.

# REVISION 1.1 --- PRE-IMPLEMENTATION AMENDMENTS

**This section is normative and supersedes conflicting Phase-4 v1.0
instructions.** All unchanged v1.0 sections remain applicable.

## R1 --- Frozen ACAP Decimal Compatibility

Frozen ACAP accepts safe integers, while Jev probabilities, confidence
values and expected scores are fractional. **Do not modify frozen
ACAP.**

The EXPERIMENTAL Decision contract MUST define a provider-neutral
canonical decimal-string representation:

``` text
DecisionDecimal := canonical base-10 decimal string
Examples: "0", "0.5", "0.734928", "1", "2.625"
```

Rules: - base-10, `.` separator; - no exponent notation, NaN or
Infinity; - no leading `+`; - explicit canonical leading/trailing-zero
rules; - no silent rounding or renormalization; - decimal-safe
parsing/conversion before avoidable binary-float precision loss; -
field-specific range validation; - probability/confidence in `[0,1]`; -
Score range derived from rubric/legend; - explicitly define handling of
fractional values inside structured state, instructions and rubric
descriptions.

Keep this solution inside the Decision contract/adapter boundary. Do not
create a general ACAP numeric framework.

This requirement is satisfied through J3--J5 and J8--J12; it does not
create a new gate.

## R2 --- One Aggregate Live TypeSafe Budget

The Phase-4 Charter MUST freeze:

``` text
MAX_PHYSICAL_LIVE_REQUESTS
PER_REQUEST_TIMEOUT
DISCOVERY_RETRY_LIMIT
EVALUATION_RETRY_LIMIT = 0
```

There is one live budget for the entire phase. Evidence is reused across
J1, live qualification, provider substitution and external workflow
wherever technically valid.

Later regression/completion MUST reference valid existing live evidence
instead of automatically rerunning paid calls.

Discovery calls count unless the Charter explicitly states otherwise. A
consumed budget is not silently replenished.

Recommended physical qualification sequence:

``` text
1 × model discovery
1 × Noul
1 × Choice
1 × Score
1 × mixed Noul+Choice+Score
1 × intentionally invalid request only if approved/useful
```

Do not establish separate live loops per criterion.

## R3 --- Evaluation POST Retries Default to Zero

For `POST /v1/systemone`:

``` text
automatic retries = 0
```

The public API does not establish an idempotency guarantee. A timeout
may represent an ambiguous post-dispatch failure where provider work
already occurred.

`GET /v1/models` MAY have a small bounded retry count for transient
transport failures if explicitly authorized.

Retry exhaustion and provider fault behavior should be tested with
fixtures; do not perform live fault injection merely to prove retry
handling.

## R4 --- Evidence Classification

Every provider-related claim MUST be classified:

1.  **PROVIDER-DOCUMENTED** --- explicitly supported by pinned TypeSafe
    public documentation/OpenAPI.
2.  **LIVE-OBSERVED** --- actually observed during authorized bounded
    live execution.
3.  **FIXTURE-TESTED-DEFENSIVE** --- ALICA adapter behavior proven using
    fixtures, without claiming TypeSafe actually returned that behavior.

A simulated response is never evidence of provider behavior.

Raw provider error bodies MUST NOT be copied into logs/evidence because
validation errors may echo submitted input.

## R5 --- Probabilistic Validation

The adapter MUST validate: - finite canonical probabilities/confidence
in `[0,1]`; - exact Choice candidate identities; - exact Score level
identities; - exact question-name ↔ answer-name correspondence; - exact
question-type ↔ answer-type correspondence; - probability totals using a
documented tolerance rather than strict equality; - Score/legend
consistency.

The adapter MUST NOT silently round or renormalize provider results.

Provider-reported confidence remains provider-reported metadata; it is
not proof of calibration or correctness.

## R6 --- Revised Regression Rule

Replace any absolute "frozen baselines remain green" requirement with:

> **No new regression against the accepted Phase-1/2/3 baselines.
> Existing accepted failures remain explicitly identified and unchanged;
> they are neither reported as passing nor reopened by Phase 4.**

Inherited accepted failures do not trigger foundation repair work.

## R7 --- Hermes Consumer Proof Removed from Active Phase-4 Scope

The optional Hermes consumer proof is removed from active Phase-4
acceptance.

Phase 4 proves:

``` text
External ALICA Consumer
→ Decision Capability
→ Decision Service
→ Neutral Provider / Jev Provider
```

It does not need to prove:

``` text
Hermes → Decision Service → Jev
```

Hermes remains frozen Phase-3 work. Cross-integration may be separately
authorized later.

## R8 --- Revised Execution Order

Use this order:

``` text
01 Charter + frozen baselines + exclusions + anti-loop rules
02 Freeze aggregate live API budget
03 Pin public TypeSafe OpenAPI
04 Resolve DecisionDecimal / frozen-ACAP compatibility
05 Approved account/model smoke
06 Governed generic Decision contract
07 Neutral reference provider
08 Decision Service
09 Jev adapter
10 Noul / Choice / Score / mixed batch
11 Fixture failure matrix
12 External consumer + provider substitution
13 ONE bounded live qualification sequence
14 Regression using accepted-baseline rule
15 Purity audit
16 Documentation / evidence / completion
17 Freeze / tag
18 STOP
```

If credentials are unavailable, record authenticated smoke as BLOCKED
while continuing only public-contract and neutral-provider work
permitted by the Charter. Do not fabricate account behavior or start
unrelated infrastructure work.

## R9 --- Revised Acceptance Matrix

Revision 1.1 uses:

  ------------------------------------------------------------------------
  ID                                  Requirement
  ----------------------------------- ------------------------------------
  J0                                  Charter, scope, stop boundary and
                                      aggregate live budget frozen

  J1                                  Authenticated TypeSafe smoke passes

  J2                                  Provider API baseline reproducible

  J3                                  Generic decision model
                                      provider-neutral; decimal issue
                                      resolved

  J4                                  Catalog governance used for new
                                      contracts

  J5                                  DecisionProvider contract
                                      independent of TypeSafe

  J6                                  Neutral provider passes

  J7                                  Decision Service core passes without
                                      TypeSafe

  J8                                  Jev adapter matches public API
                                      schema and DecisionDecimal rules

  J9                                  Noul semantics/probability preserved

  J10                                 Choice
                                      semantics/probabilities/confidence
                                      preserved and validated

  J11                                 Score semantics/expected
                                      score/confidence/legend preserved
                                      and validated

  J12                                 Mixed batch passes exact
                                      correspondence checks

  J13                                 Model discovery works

  J14                                 Secrets never leak

  J15                                 Errors normalized and evidence
                                      classification accurate

  J16                                 Evaluation retry=0 by default;
                                      deadlines/retries bounded

  J17                                 Usage telemetry preserved
                                      generically

  J18                                 One bounded live Jev qualification
                                      passes within aggregate budget

  J19                                 Provider independence proven

  J20                                 External consumer workflow passes

  J21                                 Failure matrix passes

  J22                                 Data/privacy boundary documented

  J23                                 No new regression against accepted
                                      Phase-1/2/3 baselines

  J24                                 Kernel/ACAP/Catalog/Hermes purity
                                      preserved

  J25                                 Public reproducibility/documentation
                                      complete

  J26                                 Completion evidence reconciled,
                                      frozen, tagged and stopped
  ------------------------------------------------------------------------

**There is no Hermes-consumer acceptance criterion in Revision 1.1.**

## R10 --- Anti-Loop Additions

In addition to the existing Anti-Loop Policy, the implementation agent
MUST NOT: - automatically repeat live evidence during
regression/completion; - replenish a consumed live budget without
authorization; - convert an inherited accepted baseline failure into
Phase-4 work; - add ACAP floating-point support; - add Hermes Decision
consumption; - interpret defensive fixture behavior as a new
provider-research task.

Once J0--J26 pass, Phase 4 is frozen and the agent MUST STOP.

------------------------------------------------------------------------

# RETAINED PHASE-4 v1.0 PLAN

**Preconditions:** Phases 1--3 are frozen/accepted.\
**Scope:** Build a provider-agnostic ALICA Decision Service and TypeSafe
Jev adapter. Do not begin UniUI, MemoryV4, Doghouse or AInbA.

## 1. Research baseline

TypeSafe's current public API is OpenAPI 3.1 (`0.2.0`) with Bearer
API-key authentication.

-   `GET /v1/models` --- models/aliases available to the authenticated
    account.
-   `POST /v1/systemone` --- evaluates named questions against shared
    `state`.

Current decision types:

-   **Noul** --- probability of yes/true in `[0,1]`.
-   **Choice** --- selected choice + confidence + probability per
    candidate.
-   **Score** --- probability-weighted expected score + confidence +
    rubric + level probabilities.

One request can mix multiple named questions over the same state.
Responses return the resolved model, named typed answers and usage. Jev
is therefore a typed probabilistic decision engine, not a
text-generation API.

## 2. Target architecture

``` text
ALICA V2
   │
  ACAP
   │
ALICA Decision Service
   │
DecisionProvider interface
   │
TypeSafe Jev Adapter
   │
TypeSafe /v1/systemone
```

Hermes may consume the generic Decision capability through ACAP, but Jev
must not become a Hermes-specific or Kernel component.

## 3. Invariants

1.  Jev is a provider, not the ALICA decision contract.
2.  Kernel and ACAP remain frozen.
3.  Stable Catalog contracts remain frozen.
4.  New decision capabilities use Phase-2 Catalog governance.
5.  TypeSafe-specific wire fields remain in the adapter unless genuinely
    generic.
6.  Probabilities/confidence are preserved; uncertainty is first-class.
7.  API keys are secret references and never enter Git, Catalog, logs or
    evidence.
8.  Model names are discovered where practical rather than hard-coded.
9.  TypeSafe API changes are isolated at the adapter boundary.
10. No claim that Jev is deterministic or always correct.

## 4. Scope

### In

API baseline; account/key smoke validation; Catalog proposals; Decision
Service; provider interface; Jev adapter; Noul/Choice/Score; mixed
batch; model discovery; secrets; timeout/retry/errors; usage telemetry;
provider-independence; bounded live qualification; external consumer;
optional minimal Hermes consumer proof; failure matrix; regressions;
documentation/evidence/freeze.

### Out

Kernel integration; Jev reverse engineering/training/distillation; broad
workflow engine; autonomous business-policy engine; UniUI; MemoryV4;
Doghouse; AInbA; open-ended benchmarking; speculative capabilities.

## 5. Provider/legal boundary

Use only documented TypeSafe APIs. Treat TypeSafe as an external
provider. Do not reverse engineer, probe or security-test the service.
TypeSafe states that API updates may become incompatible, reinforcing
the adapter boundary. Phase-4 live fixtures should contain no sensitive
production data unless separately approved.

# 6. Anti-Loop Policy

Every task must map to an unfinished `J0–J26` criterion:

``` text
Task:
Criterion(s):
Provider/API requirement:
Why necessary:
Expected artifact/test:
Stop condition:
```

No criterion → no work.

Keep separate:

``` text
A PRODUCT ACCEPTANCE — determines completion
B REGRESSION PROTECTION — protects frozen work
C OPTIONAL/FUTURE — never blocks completion without owner promotion
```

The agent MUST NOT autonomously continue into Phase 5, redesign Hermes,
build a workflow platform, invent speculative capabilities, endlessly
benchmark/optimize, reopen frozen phases for convenience, or repeatedly
refactor a passing adapter.

### Live API loop guard

Every live test has a fixed request budget, timeout and bounded retry
count. No recursive retry or agent-generated query expansion.

When J0--J26 pass: regress → evidence → completion report →
commit/tag/freeze → terminate continuation jobs → **STOP** → request
Phase-5 authorization.

# 7. Repository layout

``` text
services/decision/
├── service/
├── provider/
├── providers/typesafe-jev/
├── config/
├── schemas/
├── tests/{contract,provider,live,failure,external}/
└── docs/{ARCHITECTURE,PROVIDER-CONTRACT,TYPESAFE-MAPPING,SECURITY,LIMITATIONS}.md

docs/phase4/
├── CHARTER.md
├── ACCEPTANCE.md
├── EVIDENCE.md
└── PHASE4-COMPLETION.md
```

# 8. Build steps

## Step 1 --- Charter

Freeze TypeSafe API baseline, ALICA baselines, service boundary, minimal
vertical slice, live-test budget, exclusions, J0--J26 and stop rules.

**J0:** Phase 4 explicitly ends before Phase 5.

## Step 2 --- Account/API smoke

Inject `TYPESAFE_API_KEY` via secret mechanism. Bounded calls:
`GET /v1/models` and one minimal Noul request. Record redacted
model/shape/usage evidence.

**J1:** authenticated model discovery and one live decision succeed.

## Step 3 --- Provider API baseline

Record exact OpenAPI version/reference/digest, endpoints, auth, schemas
and error behavior.

**J2:** implementation is traceable to a reproducible provider contract.

## Step 4 --- Generic decision-domain model

Separate generic concepts (state, named question, Boolean/Choice/Score
decision, batch, probability distribution, confidence, provider/model,
usage) from TypeSafe wire details.

Test: could another decision engine implement this?

**J3:** no unnecessary TypeSafe coupling.

## Step 5 --- Catalog gap analysis

Reuse frozen Catalog first. Missing reusable abstractions enter Proposal
→ PROPOSED → EXPERIMENTAL. Do not rename Jev endpoints into `alica.*`.

**J4:** all generic additions follow Catalog governance.

## Step 6 --- DecisionProvider contract

Define the smallest provider-neutral interface, conceptually:

``` typescript
interface DecisionProvider {
  evaluate(request: DecisionRequest): Promise<DecisionResponse>;
  listModels?(): Promise<DecisionModel[]>;
}
```

Preserve names, types, probabilities/confidence, model identity and
meaningful usage.

**J5:** contract implementable without TypeSafe imports.

## Step 7 --- Neutral reference provider

Build deterministic fixture provider for contract tests, failure
injection and provider-substitution proof.

**J6:** Decision Service contract works without TypeSafe.

## Step 8 --- Decision Service core

Validate request → resolve provider → enforce scope/grants → invoke →
normalize → bounded telemetry → typed result. No reasoning loop,
workflow orchestration, business thresholds or human-review engine.

**J7:** neutral-provider end-to-end passes.

## Step 9 --- Jev adapter

Translate generic request to `/v1/systemone`; translate response back.
Support shared state, model, named Noul/Choice/Score questions, mixed
batch, resolved model and usage.

**J8:** adapter fixture tests match public TypeSafe schema.

## Step 10 --- Noul

Preserve yes/true probability. Do not silently threshold to boolean.

**J9:** Noul semantics round-trip.

## Step 11 --- Choice

Preserve selected choice, confidence, every candidate probability and
criteria identity.

**J10:** documented Choice fields are lossless.

## Step 12 --- Score

Preserve expected score, confidence, legend and every level probability.
Do not round silently.

**J11:** documented Score fields are lossless.

## Step 13 --- Mixed batch

Test Noul + Choice + Score in one request against shared state;
names/types must correspond deterministically.

**J12:** mixed batch passes.

## Step 14 --- Model discovery

Use `/v1/models`; support configured default and controlled override;
return resolved model; normalize unavailable model.

**J13:** discovery/invalid-model behavior deterministic.

## Step 15 --- Secrets/auth

No key in repo, Catalog, logs, errors or evidence. Test missing/revoked
key and redaction.

**J14:** no credential leakage.

## Step 16 --- Error normalization

Normalize auth, 422 validation, unavailable model, rate/usage limits if
returned, timeout, network, 5xx, malformed response and contract
mismatch.

**J15:** consumers depend only on ALICA/ACAP errors.

## Step 17 --- Timeout/retry

Retry only explicitly safe transient failures; fixed max attempts;
deadline dominates; never retry auth/schema/policy errors; no recursion.

**J16:** bounded request count/time proven.

## Step 18 --- Usage telemetry

Preserve `input_tokens` and `output_tokens` as provider usage metadata.
Do not bake pricing into generic capability semantics.

**J17:** usage observable without TypeSafe billing coupling.

## Step 19 --- Bounded live qualification

Using non-sensitive fixtures, run exactly the approved matrix: model
discovery; one Noul; one Choice; one Score; one mixed request; one
intentionally invalid request. No open-ended benchmark loop.

**J18:** supported types pass real authenticated TypeSafe API.

## Step 20 --- Provider independence

Same external consumer against neutral provider and Jev provider.
Answers may differ; consumer code/contract must not.

**J19:** provider substitution proven.

## Step 21 --- Minimal Hermes consumer proof

If charter includes it, let accepted Phase-3 Hermes consume the generic
Decision capability once through ACAP. Do not make Jev a Hermes-native
provider or modify Hermes core. If excluded, document exclusion
explicitly.

**J20:** controlled Hermes proof passes OR charter explicitly excludes
it.

## Step 22 --- External consumer project

Public SDK + selected Catalog snapshot only; no Kernel source/TypeSafe
implementation source. Run against neutral and Jev providers.

**J21:** external workflow passes/cleans up.

## Step 23 --- Failure matrix

Missing/invalid key; provider unavailable; timeout; malformed state;
empty questions; invalid Choice/Score criteria; unavailable model; 422;
malformed response fixture; unload/restart; stale handle; Catalog
mismatch; incompatible capability version; retry exhaustion.

**J22:** every failure deterministic/bounded.

## Step 24 --- Data/privacy review

Document what leaves the Cell, redaction/logging, test-data policy,
provider disable switch and visible provider selection.

**J23:** operator can determine what/when data is sent externally.

## Step 25 --- Regression

Run Phase 1, Phase 2, Phase 3, original external workflows, Decision
Service suite, Jev fixture suite and bounded live qualification.

**J24:** frozen baselines remain green.

## Step 26 --- Purity audit

Expected:

``` text
Kernel structural changes: 0
ACAP structural changes: 0
Phase-2 STABLE mutations: 0
Phase-3 Hermes core changes: 0
```

Experimental Catalog additions are permitted only through governance.

**J25:** Jev remains an adapter/provider integration.

## Step 27 --- Documentation/reproducibility

Publish architecture, provider contract, TypeSafe mapping, security/data
boundary, model discovery, errors, live-test budget/results,
limitations, exact revisions and external guide.

**J26:** another engineer can reproduce Phase 4 from public docs plus
their own API key.

# 9. Acceptance Matrix

  ID    Requirement
  ----- --------------------------------------------------------
  J0    Charter/stop boundary frozen
  J1    Authenticated TypeSafe smoke passes
  J2    Provider API baseline reproducible
  J3    Generic decision model provider-neutral
  J4    Catalog governance used for new contracts
  J5    DecisionProvider contract independent of TypeSafe
  J6    Neutral provider passes
  J7    Decision Service core passes without TypeSafe
  J8    Jev adapter matches public API schema
  J9    Noul semantics preserved
  J10   Choice semantics preserved
  J11   Score semantics preserved
  J12   Mixed multi-question batch passes
  J13   Model discovery works
  J14   Secrets never leak
  J15   Errors normalized
  J16   Retry/deadline behavior bounded
  J17   Usage telemetry preserved generically
  J18   Bounded live Jev qualification passes
  J19   Provider independence proven
  J20   Hermes consumer proof passes or is explicitly excluded
  J21   External consumer workflow passes
  J22   Failure matrix passes
  J23   Data/privacy boundary documented
  J24   Phase-1/2/3 regressions green
  J25   Kernel/ACAP/Hermes purity preserved
  J26   Public reproducibility/docs complete

# 10. Required evidence

Record exact ALICA tags/commits, Catalog snapshot/digests, TypeSafe
OpenAPI baseline, model alias/resolved model (non-secret), adapter
candidate SHA, test commands/results, bounded live-call count, redacted
request fixtures, usage outputs, external consumer SHA, cleanup result,
purity diff and limitations.

Never record API keys.

# 11. Completion / Non-Claims

Phase 4 completion proves a provider-neutral ALICA Decision Service with
Jev as a real authenticated provider. It does **not** prove Jev is
infallible/deterministic, all future decision types are known,
production business automation is approved, or Phase-5 services are
integrated.

Completion:

``` text
J0–J26 PASS
→ freeze
→ regress Phase 1/2/3
→ bounded live qualification
→ purity audit
→ PHASE4-COMPLETION.md + EVIDENCE.md
→ commit
→ annotated tag (recommended: phase4-jev-v1.0.0)
→ public verification
→ terminate continuation jobs
→ STOP
→ request Phase-5 authorization
```

## Recommended engineering order

``` text
01 Charter / anti-loop / live budget
02 TypeSafe account smoke
03 OpenAPI baseline
04 Decision-domain analysis
05 Catalog gap/proposals
06 DecisionProvider contract
07 Neutral provider
08 Decision Service
09 Jev adapter
10 Noul
11 Choice
12 Score
13 Mixed batch
14 Model discovery
15 Secrets
16 Errors
17 Retry/deadlines
18 Usage telemetry
19 Live qualification
20 Provider-independence proof
21 Optional minimal Hermes consumer proof
22 External consumer
23 Failure matrix
24 Data/privacy review
25 Phase-1/2/3 regression
26 Purity audit
27 Documentation/evidence
28 Completion report
29 Freeze/tag/public verify
30 STOP
```

## Primary References

-   TypeSafe API docs: https://api.typesafe.ai/docs
-   TypeSafe OpenAPI: https://api.typesafe.ai/openapi.json
-   TypeSafe Jev/System One introduction:
    https://typesafe.ai/blog/introducing-system-one-models-and-jev
-   TypeSafe workflow evaluations: https://evals.typesafe.ai/
-   TypeSafe customer agreement: https://typesafe.ai/legal/mca
-   ALICA V2: https://github.com/BartSchuster22/AlicaV2
