# Signed payload staging bound correction

Source-reviewed UNEXECUTED WIP. One Cell line now passes the existing limits.fileBytes to archive.read when copying verified archive entries to durable storage. The write already enforced that file bound; the archive default remains the smaller metadata bound. No configured limit, resource grant or signed acceptance rule changed. Parent independently read the patch and surrounding archive/staging source and verified exact one-line composition, hashes, unchanged regression identity, patch application and whitespace.

Existing regression source retains a signed 1048577-byte payload: default read rejects, explicit file read succeeds, Cell stages VERIFIED without acceptance and stored payload matches. No test was executed. The historical named test used different Cell/fixture bytes; no PASS transfers. This is not upper-bound, exhaustion, crash-cleanup, installed-runtime or end-to-end acceptance evidence.

Metadata parsing, release inspection/signature/trust, signed entry identities, archive integrity, disk reserve, watchdog/deadline and durable-write checks remain. Existing backup protection, restore mandatory preparation and transport fixes preserved. No dependencies, literal private keys, native/NULL/security changes or cap increases.

Future narrow test requires separate exact-composition/native/fixture-crypto/resource admission: node --experimental-vm-modules --test tests/g7/runtime-artifact-staging.test.mjs. Adding the test to the existing G7 wildcard is not permission to run that suite or its native builds.

Convergence review: runtime assembly still has missing ordinary dependency helpers plus protected native/build/receipt inputs; adding cosmetic helpers alone would not produce a runnable standalone path. Full Cell rotation remains an unapproved scope decision; native artifact qualification, failure-inclusive fit, original Case05/NULL and final owner acceptance remain OPEN.
