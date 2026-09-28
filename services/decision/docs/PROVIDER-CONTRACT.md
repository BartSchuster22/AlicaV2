# Provider-neutral contract

Canonical governed definition: ../../../catalog/proposals/decision-evaluate/SEMANTICS.md. Runtime: ../provider/contract.mjs; declarations: ../provider/contract.d.mts. Proposal, parent review, frozen-governance review/transition and selected snapshot are retained alongside that definition. EXPERIMENTAL only; no stable admission or signature-trust claim.

`DecisionProvider.evaluate(request,{signal,deadlineMs})` returns provider/model identity, exactly named/type-corresponding answers and generic inputTokens/outputTokens usage. Optional listModels describes provider-supported IDs. No TypeSafe import is required. Provider selection is trusted operator configuration, not a request-supplied endpoint or credential.

Questions share one structured state and contain structured instructions: boolean probability; choice candidates/distribution/selected identity/confidence; score levels/legend/expected score/distribution/confidence. Numeric probabilities and scores are canonical DecisionDecimal strings. No exponent syntax, plus sign, negative zero, redundant leading/trailing zeros, NaN or infinity; bounded digits/precision; no rounding or renormalization. The runtime uses exact integer-scaled decimal arithmetic. Probability tolerance is exactly 0.000001, not binary-float equality.

Structured documents are bounded canonical JSON strings with frozen-ACAP-safe integers. A sole-property object {"$decisionDecimal":"0.125"} represents a fractional numeric value. Literal "0.125" stays a string. Reserved-marker ambiguity is rejected by the contract; the Jev serializer emits numeric markers as exact JSON number tokens, never via an avoidable binary float. See normative SEMANTICS for precise bounds and closure rules.

The service validates semantic ranges, unique names/identities, totals, selected-choice correspondence and score/legend consistency. Provider confidence is metadata, not calibration/correctness proof. No generic pricing, vendor retries, billing policy or provider endpoint fields leak into the capability.

The neutral reference is deterministic contract evidence, not model inference. Fixture substitution and actual public Host behavior are proven; real Jev substitution remains blocked by discovery failure.
