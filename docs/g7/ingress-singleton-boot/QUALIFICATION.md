RESULT CLOSE FIX: TESTED; independent review pending; UNPUBLISHED.
Base 0a3f7b2774c14efb009d9b86e0b2e872e5a0de52; live HEAD b74e1bffffaeb336f4e075239680a28535a409f9 preserved (HEAD is not source baseline).

Correction: candidate-r3 only has revised boot/test and exact unchanged ingress.
Boot observes close before listen/abort. Abort initiates cancellation, not success.
Explicit close is requested only when public server.listening remains true;
callback errors reject, close event proves completion. Already-observed close is
recognized without a duplicate request. Unknown cleanup times out/requires reap;
late close cannot turn a rejected close into success. Immediate permanent revoke,
record clearing, connection termination, one-shot claim and deny-before-TLS remain.
No ERR_SERVER_NOT_RUNNING suppression; no authorization bypass claimed.

Executed pinned Node24.21.0:
7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c
r3-negative: old boot + new focused regression: exit1, 0PASS/1FAIL,
2 close calls versus expected1. Actual bounded negative control, not source-only.
r3: full boot file plus existing receiver/deadline files in one unit:
exit0, 16PASS/0FAIL/0SKIP/0CANCEL (14 boot + 2 regression tests).
Existing regressions report 118 assertions and 12 synthetic deadline cases.
New mock models synchronous abort->close handle clearing, asynchronous close event,
and duplicate callback ERR_SERVER_NOT_RUNNING. Tests include waiting for completion,
pending cancellation, unsolicited close, throw/error/hang and irreversible timeout.
Throw/error fallback is explicit fault injection of cancellation not initiating close.

SHA256 candidate-r3:
boot 744207b2ada7f6f64d53fd79f3b9801afc2ca804189f21741b3fee74138f0137
test 64e82cbe1465c784730ad911710fee3fffed72f1970f2a2bf217e1e3ab98b3ac
ingress 3baacb9698dffdc579267a251f1bf842fac48e90ff8ef0a64900ee74c6dad6fb
Diffs: r3-g7-owner-ingress-boot.mjs.diff and r3-owner-ingress-boot.test.mjs.diff;
reconstructed/verified against prior candidate. Ingress EOF catch unchanged.
Versioned Node net.js and internal/tls/wrap.js were retrieved/read; both hashes
match INDEPENDENT-REVIEW.md, including signal handler and close callback semantics.

Evidence: BASE-r3, ADMISSION-r3[-negative], AFTER-r3[-negative],
g7-ingress-singleton-boot-r3[-negative]-command/result/log and FINAL-CLOSE-FIX.json.
Fresh hashes preserve every prior candidate/r1/r2/review/evidence file, repo HEAD,
index/status/scoped worktree and prior runtime candidate. No stale HEAD copied as base.
Readonly canonical graph with only boot/test/unchanged-ingress file overlays;
VM mocks config/TLS/clock only, real canonical origin/lookup modules. Older factory
regressions are not singleton proof. No live TLS/socket endpoint, native/Cell/build.

Two attempts consumed under prospective internal engineering reallocation;
old r1/r2 grants remain consumed, no refunds or overall cap increase.
Combined unit wall 1.771869s; sampled CPU 794742us (NOT final CPU).
Conservative two-unit quota plus controller CPU bound112s within120CPU/180wall.
Costs: [{"run":"r3-negative","exit":1,"wallSeconds":0.570763046038337,"sampledCPUUsecNotFinal":246359,"controllerCPUSeconds":0.800904737,"peakMemory":30191616,"maxObservedFD":24,"reaped":true},{"run":"r3","exit":0,"wallSeconds":1.201106325024739,"sampledCPUUsecNotFinal":548383,"controllerCPUSeconds":1.010747144,"peakMemory":40460288,"maxObservedFD":29,"reaped":true}]
Gates verified before Node; actual Node readonly overlay mount samples verified;
runtime/source hashes verified after. Both cgroups absent after and at final check.
All requested unit limits/sandbox retained; see admission/command/gate evidence.
Slice4MiB/128, pool128MiB/4096, scratch1MiB/64 within limits; DEV1908MiB unchanged.
Prewrite projection and fresh inventories retained.
Mock deadlines are NOT real OS timing guarantees.
No production/config/identity seam, deployment, custody, CURRENT/M4, publication,
protected artifacts or next packaging work. Review must precede publication.
