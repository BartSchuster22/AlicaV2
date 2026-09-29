# Evidence and failure ledger

Original runtime evidence remains on DEV `/opt/alica-phase5k/evidence`; selected small publishable logs copied here. Builds/downloads/dependencies/runtime/source expansion occurred ONLY DEV. ElioHermes1 held small orchestration/status files.

Conformance attempt7:19/19 preadmission, actual backend restart,10 tasks no execution; hashes bound by catalog conformance.json at commit61ebcdbb. Attempt8 failed before tests because Catalog returns null-prototype JSON objects and fixture deepStrictEqual compared prototypes. Product/schema unchanged. Attempt9:19/19 actual experimental catalog, real backend restart and no-worker audit. Archived preadmission fixture retains original byte hash; verify-release.mjs checks it and current product hashes.

Earlier attempts1–4 are preserved: wrong expected error for unsupported operation (actual NOT_FOUND); HTTP synthetic fault servers reused a port and hit stale pooled sockets; a five-second offline package install exposed a stale backend keepalive connection. Corrected fault fixtures use independent ephemeral ports, REST connections explicitly close without retries, response reader preserves bounded-body errors. Attempt5 passed15;6/7 expanded19. No failed log is labeled passing.

Frozen regressions (all isolated, no operational providers):
- Core/contracts/kernel/SDK CLI suite170/170 (first attempt169/170 lacked synthetic/etc/hostname; fixed enclosure only).
- Catalog15/15; Foundation41/41; Decision offline54/54.
- Assurance/Doghouse/Phase5.2 public event suite62/62 (first61/62 test cache read-only; sandbox writable private cache fixed).
- Current MemoryV4v2 integration8/8 plus Python domain78/78; pinned private Python3.11 dependencies.
- Hermes selected safe upstream tests5/5 (event tail, update hook, comment queries). Not all upstream tests or dispatch tests.
- Both separately packed offline Decision proofs PASS after private npm cache metadata preparation. authenticatedLiveRequests=0; synthetic fixture requests explicitly distinct; original closed grant ledgers untouched.
- Typecheck/public import boundaries PASS.
- Preserved failures: dependency checker rejects existing `@alica/catalog` (allowlist predates Catalog), and retired MemoryV4v1 provider tests0/3 FAILED_PRECONDITION against evolved manifest/descriptor. Executed on accepted-baseline source copy, not introduced by Phase5.K. No accepted originals changed or those failures hidden. There is no claim of an entirely green repository-wide umbrella run.

Runtime reports and source-tree audit distinguish accepted original files from new scoped paths. WebSocket application frame-size guard is after native buffering; hostile peer memory exhaustion is not qualified. Isolation is a root-provisioned namespace/chroot boundary with no route, not a claim that ALICA Host itself is a hostile-code sandbox.
