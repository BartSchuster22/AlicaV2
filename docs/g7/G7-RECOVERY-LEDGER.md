# G7 recovery ledger — finite R0/R1; parent reviewed for selective integration

Adopted recovery plan/owner continuation/30m/publication authority preserved. Inherited lease untouched. Local source/git/evidence only; no tests/imports/native/protected reads/network/setup/services/DB/commits or renewed grants. Paths checkout-relative.

## R0: reference and preservation

Verified commit79702d16d41153ea3ad4518be7b04eb8a45b43c1 exists/HEAD ancestor (exit0). Parent ea38b4a9cd406ff75ef491e0aecca664b54d1c91 differs only docs/evidence, no runtime. docs/g6/FULL-QUALIFICATION-LEDGER.md binds clean check to parent; docs/gates/G6-OWNER-ACCEPTANCE.md binds publication/acceptance to79702d1. Local evidence/g6-runtime/github-ci-owner-acceptance.json: foundation35221811392/attempt1/success/owner “Accept G6”. Historical, NOT fresh qualification; target publication-check.log cited, not reread. Old design-only restriction superseded.

HEAD b74e1bffffaeb336f4e075239680a28535a409f9 unchanged. Recovery ref refs/heads/g7/g6-reference-recovery-20260925 =9c10d258beabe4ce05e6da2748c4286d5b8bfe34, parent=current HEAD, only plan changed. NOT clean-G6 branch. Initial cached diff empty; index/HEAD/ref/mixed tree preserved, no staging/reset/clean/copy.

Initial modified paths: native/g7/ownership.c; tests/g7/{cell-fixture.mjs,owned-coordinator.test.mjs,serving-faults.mjs}; tools/{build-g7-native.py,g7-cell-owner.mjs,g7-cell.mjs,g7-owned-bridge.mjs,g7-owned-coordinator.py,g7-supervisor.py}. Native ownership may contain protected original NULL target: path metadata only, no content/diff/hash read. /home/herman/g7-h-custody-root-implementation-11 and -null-fix-review06 remain locator-only, not inspected. Ordinary reports supply native history, not read authority.

Untracked: shipping/runtime/backup/restore/Step2/Step3 docs/evidence RETAIN history; tools/g7-{backup,restore,runtime-*,signed-bootstrap}/tests selective candidates. operational-* tests WIP where unrun. Custodian docs/schema/evidence, run-*-dev.sh and qualification drivers DEVELOPMENT-ONLY. Native notice-location changes retain prior grants/source WIP. No deletion/blanket staging.

## Exact source groups / compatibility

A RETAIN: tools/g7-bootstrap-trust.py at a8942466; tools/g7-{archive,inspect,durable,release}.mjs at f84bf378; packages/kernel/src/{index,trust}.ts and tests/g7/release-admission.test.mjs at728d335a. G6-to-HEAD package diff ONLY two Kernel files: additive selected-release discovery/admission/revocation. Legacy discovery still uses verifyPackage. ACAP contracts/SDK/G6 package transports unchanged in this range. Preserve independent pins, authenticated admission, no replay, uncertainty/reap/capacity and public API contracts.

B RETAIN/REWORK Cell: tools/g7-{cell,cell-owner,owned-bridge,admin,owner-channel,stopped-verify,cell-cli,owned-cli}.mjs and g7-{supervisor,owned-coordinator}.py; tests/g7/{cell-preparation,cell-activation,cell-lifecycle,supervision,exact-reinstall,cross-process-reinstall,owned-coordinator,serving-continuation}.test.mjs. Commits054efdd1,ce6d7242,0b70b71f,59f5eef3,d9f0c026,0ccc6048,122ac0d3,bd907305,974ee15e,a314e56a,b74e1bff cover successive preparation→activation→supervision→admin→upgrade→recovery. Current tools/g7-cell.mjs SHA256ccfebc8816b4ca23246118fd2c2cda3e52c29a0262f77835dd37282fc367246c; mixed deltas do not inherit qualification.

C RETAIN bounded backup/restore; REWORK complete acceptance. tools/g7-backup.mjs SHA256710616910a6d0184aff8fe6865eaa2a460b31aec2b8df4aa572437e241fbd163; tools/g7-restore.mjs 00a5efe0b2d5e65ea3374f634eab3a913b5c9f65ef0f7eb644972e650428a027 plus B. Tests/g7 stopped-backup-qualification.mjs, guarded-restore-qualification.mjs, restore-transport-qualification.mjs, restore-state-{worker.mjs,qualification.py}, restore-input-binding.test.mjs.

D RETAIN engineering/REWORK release: tools/g7-runtime-assembly.mjs SHA25680cc5f50daca308f465345686f8c28c12c31d1c2e8dec39351fd1fb3f5053e1a; tools/g7-runtime-{layout,inputs,dependencies}.mjs; g7-runtime-{age,binary-inputs,bootstrap,native-debug,native-notices,node-source}.py/g7-signed-bootstrap.py; tests/g7/runtime-{assembly-qualification,signed-qualification}.mjs/test_runtime_*.py. Build/attribution helpers DEVELOPMENT-ONLY unless shipped.
Assembler24–47 selects acap-types/acap-contracts/plugin-sdk/kernel, not alicac. Shipped supervisor.py/owned-coordinator.py are product lifetime dependencies, NOT rejected development accounting controllers. TypeScript is build-time. E6 denies checkout/assembly reads, not universal closure. No shipping development-agent/compiler/controller/V1 dependency; future qualified bytes/dependencies/processes/RSS/start/stop measurements, no invented thresholds.

## Evidence (docs/g7 unless specified; overlapping totals never added)

E1 docs/gates/G7.md/parent reviews:41 archive/inspection/durable tests independently repeated;24 preparation;36 activation; later154 G7 regression;88 admission. Scoped components, not host acceptance.
E2 SHIPPING-FORMATTED-CURRENT-RESULT.md: diagnostic/full check PASS; old archive94581510...,978 payload/335 notices. Changed Cell bytes preclude current credit.
E3 STOPPED-BACKUP-DEV-R2-FRESH-RESULT.md: seven scenarios PASS; capture/source invariant/late-fault denials/partials. Tested Cell39d117d3... differs; empty-secret IPC single-writer only.
E4 RESTORED-STATE-PARENT-VERIFIED.md qCJBTn:33 files/four replies/two incarnations/exact destination reap. RESTORE-READINESS-NATIVE-PARENT-VERIFIED.md qDluBT: real readiness expiry/wrong-PID rejection. Disposable same-process, not permanent handoff/opaque replay; old Option1 decision-pending superseded.
E5 OPTION1-OWNER-APPROVAL.md + STEP2-CURRENT-REGRESSION-COVERAGE.md: focused3/3,coordinator15/15; eunupkei full exit0, Node170/162/394, Python193/30/11/9/121,466 frozen records. Independently rehashed local evidence/g7/step2-regression/dev-return-eunupkei/{public-manifest.sha256,full-check.log,result.json,source-before.json,source-after.json}: manifest47fd2fac245b45888a7ab3bd2f69e11da502648880e0f00c15f9220b3fc2ee90; log/result/snapshots match it, before=after. integratedLocalRemoteQualification=false retained; resolved transfer metadata != whole-tree equivalence.
E6 STEP2 current artifact: actual notices5/5/debug7/7; two985-file assemblies/340 notices/eight isolated outcomes; SERVING/STOPPED/fence RETAINED. Archivebe77a4de178fbd4d6236e4efde17dbbd1df2320f5720cb1cf4da1aaaffac5d71. STEP3-OPERATIONAL-COVERAGE.md supersedes return-open: parent public evidence verified. Report-based, not fresh native audit.
E7 STEP3: Kernel trust/restarts22/22, dual-root signatures/injected clock, NOT Cell rotation. Three CLI denials != successful guide. Fixture expired; preactivation crash/EFBIG driver unrun. No fresh tests here.

## G7-01..20 remaining executable criteria

RETAIN = scoped, not row PASS; REWORK = gap. No mandatory deferral; old NOT RUN matrix is not current ledger.

01 A/B/D,E1/E6 RETAIN: clean online exact-byte signed IPC calls/teardown; deny in-process activation.
02 D,E6 RETAIN/REWORK: independent disconnected same bytes/dependencies, IPv4/IPv6 denial/no fetch; specific second-host authority.
03 A,E1/E6 RETAIN: exact-artifact tamper/length/missing/extra denial before code, prior-state invariant.
04 A,E1/E7 RETAIN: shipping independent pins, cross-domain/substitution denial, no archive override.
05 A/B,E1 RETAIN: current profile/lock canonical order/pin mismatches, portable secret exclusion.
06 A/C/D,E1/E3 RETAIN: exact-artifact traversal/link/special/race denial/no outside write; not exhaustive races yet.
07 A/D,E1 RETAIN/REWORK: bounded exhaustion/short-write with intact state; operational-preactivation.mjs EFBIG unrun, not ENOSPC.
08 A/B,E4/E7 RETAIN: current-clock online/offline stale/expiry/backward-clock denial and bounded quiesce, not injected-clock credit.
09 A/B,E7 RETAIN Kernel/REWORK Cell: authenticated Cell/operator root-rotation preserving both floors and policy/profile binding across restart.
10 B,E1/E7 RETAIN/REWORK: every durability boundary/fresh-process reconciliation, preactivation abort distinct from activated target; custodian design approval not tested behavior.
11 B,122ac0d3/974ee15e RETAIN: current exact reinstall retains identity/secrets/floors/checks current trust.
12 B,0ccc6048/974ee15e RETAIN: current concurrent admin exclusion including read-only races, A1+B1 EOF sealing unchanged.
13 B/C,E4/E5 RETAIN/REWORK: failure/upgrade trusted recovery, revoked prior release not revived, fresh handles/no replay; Option1 limited criterion separate.
14 B,E1/E6 RETAIN/REWORK: original Case05 creator THREAD exits/S lives/L PDEATHSIG uncertainty; actual reap/capacity/noncooperative cleanup, fence retention != clean reap.
15 C,E3/E4 RETAIN/REWORK: independent exact-artifact clean restore/current authority/fresh calls/teardown/source invariant; development same-process scope insufficient.
16 A/C,E3/E4 RETAIN/REWORK: wrong/missing key/tamper/stale denial/no rollback and lost-root procedure; no production key authority inferred.
17 D,E6 RETAIN/REWORK: actual shipped complete SBOM/notices/source/provenance; LGPL/source/relinkability/legal open, DWARF != preprocessor closure; fresh native binding gated.
18 D,E6/E7 RETAIN: exact verifier/runtime tamper and unsupported ABI/confinement denial before code/no downgrade.
19 A/C/D,E1/E5 RETAIN: exact-artifact planted-secret redaction/key separation; disposable tests != production ceremony.
20 A–D,E5/E6 RETAIN/REWORK: verbatim clean-host guide/G1–G6 unchanged/exact-source CI/manual control/publication/explicit owner acceptance.

## Original WP exits and accounting

WP1 RETAIN CURRENT interface/integration34; B→13/14. Loader/client/request/clock/native bindings open, protected inputs unread.
WP2 REWORK funded execution admission; run-m1-notice-locations.py334da72d... source-only R1, no fit proof/shared-service rewrite.
WP3 RETAIN A–D/REWORK producer wiring. tools/g7-runtime-native-notices.py/tests/g7/test_native_notice_locations.py WIP (CURRENT hashes); M4 fresh location/binding/map/receipt open.
WP4 REWORK authorized/enforced/funded tests; E1–E7 != M1/M2 admission; compiler/total five-case QA unused.
WP5 REWORK exact NULL admission/write/verification; native/g7/ownership.c unread. Original single nontruncating write/exclusive outputs, no staging/rename/fsync/rollback.
WP6 RETAIN E1–E7/REWORK remaining01–20/Case05/legal/signing/owner gates.
Historical failed controllers/launchers/endpoints/receivers/custodian assets DEVELOPMENT-ONLY; G8 DEFER. No liabilities/reserves/copies released. Revisions/tool/session/readback/log effects/possible atime remain attributable, not free. No extra copy file; revisions remain in tool/session history. UNKNOWN fit != zero; CURRENT caps/grants unchanged.

## ONE next slice: integrate already-tested Option1 product coverage

tests/g7/option1-public-authority.test.mjs,6116B,SHA256848207c76034cf781de3b543c9a7fa569ac215de89ba9ccd6ca31f3562849582. G7-13/20,WP6: stale grant/retired handle checks, positive counters/state invariants; runtime.ts:391 confirms UNAVAILABLE. Injected clock, not opaque replay. Test, tools/g3-fixtures.mjs, packages/acap-contracts/src/runtime.ts, packages/kernel/src/{index,trust}.ts, package.json/package-lock.json ALL match E5 tested hashes. No new native/M1 dependency; not full transitive audit.
Parent: focused source/license/secret review then exact-path/isolated-index integration of test with existing Option1/E5 references. No runtime edit/bundled Cell/native deltas. No date-refresh rerun; changed-source behavioral claim needs separately admitted focused test. Parent owns commits/publication: SSH host-key mismatch/GitHub unauthenticated block push, no retries/trust/auth changes. Local-only until remote SHA verified.
Prefer selective existing-tree integration: additive Kernel delta/isolated runtime evidence, no proven entanglement requiring restart. Parent source review accepted Option1 test integration; direct fixture/runtime/Kernel/package inputs match recovery parent. Historical tests retained, no fresh execution or complete transitive audit; not G7 complete.
