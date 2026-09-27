# Executed Phase2 evidence

This record distinguishes product acceptance, regression protection and publication.
It is not a production trust or historical G7 qualification claim.

## M1–M3 and regression baseline

M3 public revision: `e0dd674a01d49c9de80744f3c0cac0dc269c1911`.
On the authoritative DEV checkout, pinned-toolchain build and typecheck passed;
Phase1 tests passed 170/170 and Catalog tests passed 15/15. The real separate
Phase1 external author/operator flow returned 42, with clean DISPOSED state,
no failed disposers, timeouts or restart requirement. Secrets and diff checks passed.
Operator logs are retained under `/home/alica-dev/phase2-m5-evidence/`:
`build.log`, `typecheck.log`, `phase1-tests.log`, `catalog-tests.log`,
`phase1-external.log` and `secrets.log`. These paths are operator evidence locations,
not files claimed to be included in this public checkout.

A fresh separate clone at exact M3 ran `npm ci --ignore-scripts`, build and Catalog
tests successfully. CLI validate, index and snapshot each ran twice with byte-equal
results. Offline snapshot validation passed (one entry, trustVerified false).
Tracked sources stayed unchanged. Build produced two untracked packaged schema
copies; they are generated artifacts, not additional authoritative definitions.
Logs: `clean-install.log`, `clean-build.log`, `clean-catalog-tests.log`.

SHA256 of exact CLI output bytes, including final newline:

- index: `36bf70df4fc946dfd31f6ffcc5f86c495e1cb22c0415c3ce74f36510a79bc344`
- snapshot: `0a4b08643682e6d7c4cd62205881a5914708e81030eb25432071ca48633bf57d`
- validate: `2fbb33a54ca18ba3d13158db66d28ca75f4130f4e9cd0bcb67c37627b1164363`

The generated index was absent at M3, so no committed-index comparison was claimed.
After M4 publication, DEV generated `catalog/generated/index.json`, compared it
byte-for-byte against another CLI index output, and obtained the same index hash
above. Final-candidate committed-index verification subsequently passed as recorded below.

## M4 external author

Published revision: `5269438a9f0bcc464df258f2787f94cac6e87c79` on `phase2/catalog`.
Public anonymous GitHub access and remote branch hash were verified.
The corrected runner passed the existing unchanged boundary checker and actual
external execution before publication. Relevant Prettier, secrets and staged diff
checks passed. The owner/parent supplied the corrected runner through the normal
approved exact transfer and corrected only its ownership.

Actual retained report: `/home/alica-dev/phase2-m4-catalog-report.json`.
Its sourceRevision reflects the pre-M4-commit source base, not a claim of post-commit
execution. It reports separateExternalProject, authorProjectHasNoKernel,
publicImportsOnly, deterministicSnapshot, manifestCorrespondence and
providerAgnosticConsumer all true. Two providers passed eight conformance checks
each; 13 negative correspondence cases passed. Both returned neutral text to the
same consumer and reached DISPOSED with no residual providers or pending resources.
Self-comparison was BACKWARD_COMPATIBLE. Snapshot internal digest:
`sha256:9ae1e21129397d88624e9c05b1d224739119d9437199c6ad423632c16da10442`.
This internal digest is not the hash of complete serialized snapshot output above.

A focused post-publication rerun of boundaries and the actual external runner also
passed at exact M4 revision `5269438a9f0bcc464df258f2787f94cac6e87c79`.
Its retained report is `/home/alica-dev/phase2-m5-evidence/m4-published-report.json`;
sourceRevision equals that published commit. All six acceptance booleans remain
true, two conformance suites pass eight checks each, all 13 negatives pass, both
results are neutral, cleanup is DISPOSED and compatibility is BACKWARD_COMPATIBLE.
The Phase1 tag still peels to `ab0273e8581fa70cbcf15c07f73e990b5dcc725e`.

Evidence level is explicitly SDK_TESTKIT_NOT_PRODUCTION; trustVerified is false.
Echo remains experimental. Kernel/ACAP tracked diffs against Phase1 were empty.

## Exact final-candidate acceptance (executed)

Tested executable parent: `dc2a4b958ef09c69926ac1f1c7b45a83130f3487`,
publicly committed on `phase2/catalog`. The final release is its documentation-only
child, identified by the annotated `phase2-catalog-v1.0.0` tag. Execution below
belongs to this exact parent, not to a claimed rerun on the documentation child.

Build, typecheck, Phase1 tests (170/170), Catalog tests (15/15), the real separate
Phase1 external flow, Catalog external runner, boundaries, secrets and tracked
source diff checks all passed. Retained operator evidence is in
`/home/alica-dev/phase2-m5-evidence/final/`, including `candidate.txt`, execution
logs, `catalog-report.json`, reproducibility outputs and `protected.diff`.
These are operator evidence locations, not files bundled in this public checkout.

The Catalog report's sourceRevision equals the full tested parent above. All six
acceptance booleans are true; both providers passed eight conformance checks,
all 13 negative cases passed, and the unchanged consumer received neutral results
twice. Cleanup was DISPOSED; compatibility was BACKWARD_COMPATIBLE.
Evidence remains SDK_TESTKIT_NOT_PRODUCTION and trustVerified=false.

A fresh detached clone of that exact parent passed `npm ci --ignore-scripts`,
build and Catalog tests. DEV and clean-clone validate/index/snapshot output was
byte-identical, as was repeated clean-clone output. Both committed indexes matched
the regenerated index. Offline snapshot validation passed with one entry and
trustVerified=false. The output SHA256 values are the three recorded above.
Both tracked trees remained unchanged; generated packaged schema copies stayed
untracked and are not part of the release.

Kernel, acap-contracts and acap-types tracked diffs against Phase1 were empty.
The Phase1 tag still peels to `ab0273e8581fa70cbcf15c07f73e990b5dcc725e`.
The release child changes only this evidence record and the completion report;
no further executable retest is attributed to that documentation-only child.
A separate README-only main commit supplies public release discoverability
without merging Catalog or unrelated code into main. Publication acceptance
requires anonymous verification of that pointer, this report and the exact
annotated release tag. Preserve G7 and STOP before Phase3.
