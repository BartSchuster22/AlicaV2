# Experimental request-scoped execution semantics

execute accepts bounded task text and returns bounded final response text. The response is not a transcript, durable task identifier, proof of correctness or guarantee of general reasoning competence. Providers document their supported domain; a syntactically valid unsupported task fails INVALID_ARGUMENT. Selection grants no additional tools, secrets, endpoints or scopes.

Common-domain task: `Read the approved fixture and return its text exactly.`
Expected text: `ALICA request-scoped fixture`.
The neutral reference supports only this task. Hermes must actually read its identically valued immutable fixture through the allowed native tool. Mock model execution does not establish live H12.

Invocation requires explicit execute authority within Host application/session scope. No persistent task state, resume, deduplication or automatic retries, including uncertain failures. Task text cannot change trusted operator policy. Diagnostics must exclude credentials and arbitrary exception text.

Existing absolute deadlines and AbortSignal bound local delivery and owned-resource cleanup. They do not guarantee remote provider cancellation or a generation/billing cap. Cleanup failure is not a successful result.

Governance: parent.review.json faithfully records the existing distinct parent source-review disposition of commit325c114f824b1fe459da9186c72418257be980be (same model family, not a human audit). Run admit.mjs from the repository root to execute reviewProposal, transition, reference conformance, additive namespace validation and snapshot consumption using frozen public APIs. Generated admission.json records the actual result; no admission is claimed merely because this source exists. Snapshot0.2.0 extends frozen entries without changing the frozen0.1.0 release files. EXPERIMENTAL is not STABLE or Phase3 completion.
