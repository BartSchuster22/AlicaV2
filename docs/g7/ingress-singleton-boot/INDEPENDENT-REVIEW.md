INDEPENDENT CLOSE R3 REVIEW: PASS, SOURCE/MOCK SCOPE ONLY.
Base 0a3f7b2774c14efb009d9b86e0b2e872e5a0de52; candidate-r3 only.
Prior INDEPENDENT-REVIEW.md remains CHANGES REQUIRED for r2, not retroactively
accepted. Reused unchanged positive findings; read all three r3 files, diffs,
CURRENT/DELIVERY, acceptance and receipts. No implementation edits or reruns.

CLOSURE FINDING CLOSED
Node v24.21.0 net.js:2130-2144,2530 installs synchronous abort->close;
2814-2849 clears handle/registers duplicate callback error;2861-2879 waits
for drain and schedules close. listening reflects _handle. TLS inherits
net.Server at internal/tls/wrap.js:1527. Versioned sources retrieved read-only:
https://raw.githubusercontent.com/nodejs/node/v24.21.0/lib/ plus names below.
net.js SHA256 b4bc6d76e255c67673a3bdf4676e0816e1f13906e4a46a6bdcc07dd614329ffa
internal/tls/wrap.js SHA256 7aeba969aee7e8bbbd8cd7258d7ccfcb384a7edd825a38f11a9ad9ca8784d44b
API-source corroboration, not binary/source reproducibility proof.

Close observer precedes listen; finishClose precedes abort. Abort is initiation,
never success. Explicit close only while listening remains true avoids the
normal duplicate request. Observed close resolves; no ERR_SERVER_NOT_RUNNING
suppression. Already-observed unsolicited close needs no further request.
Pending cancellation rejects ready; late listening cannot re-enable stopped
records. Node emitListeningNT checks handle; close increments _listeningId,
and obsolete asynchronous cluster handle arrivals are discarded. Bind failure
rejects ready while successful cleanup can resolve close: separate outcomes.
Errors during pending close reject; throws/unknown cleanup reject or time out.
done/closing prevent late events upgrading rejection. No material lifecycle
failure/race blocker found in this scope.
Revocation precedes teardown, clears records and terminates tracked connections.
Ingress close/error listener precedes boot observer. Late EOF cannot commit.
Synchronous permanent claim, one-shot failures, null-config/endpoint denial and
transport identity guards remain. Canonical origin uses lexical singleton lookup;
factories cannot populate it. No production config/root/runtime/identity seam.

RETAINED EXECUTION, NO REVIEWER RERUN
r3-negative command mounts NEW test over OLD boot: actual exit1,0PASS/1FAIL,
2 close calls versus expected1 at test line201. This is an executed negative.
r3 actual exit0:16PASS/0FAIL/0SKIP/0CANCEL:14 boot +2 baseline-derived
regressions reporting118 assertions/12 synthetic deadlines. Mock implements
synchronous abort close/handle clearing, asynchronous close and duplicate
callback ERR_SERVER_NOT_RUNNING. Regression checks pending completion, one
request/no duplicate error; a separate assertion proves duplicate callback.
Pending cancel, unsolicited close, throw/hang, irreversible timeout, origin
isolation, identity denial and real ESM null config have non-vacuous assertions.
Coverage limit: error-mode test advances timeout before queued callback and
permits TIMEOUT; it proves rejection, not callback-error precedence. That branch
is source-reviewed, not independently isolated by this assertion. Nonblocking;
no additional run needed. Mocks cover config/TLS/clock, with real crypto and
actual canonical origin/lookup source. Older injected-factory regression is
not singleton proof. No hard OS timing or actual TLS/custody qualification.

PROVENANCE / RESOURCES
All58 FINAL-CLOSE-FIX pins freshly match; r3 diffs reconstruct exactly. Rotation,
null config and acceptance equal exact baseline git objects read as alica-dev.
Runtime/library/reused-controller pins match. Runtime Node SHA256:
7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c
Read BASE-r3, both ADMISSION/command/result/AFTER sets, FINAL-CLOSE-FIX and gate
controller. Actual Node mount samples show readonly canonical tree, intended
file overlays (test-only negative, three-file r3), and Node. Live limits precede
gate release; reap receipts and fresh absence of both cgroups agree.
Wall1.771869s; sampled CPU794742us NOT final CPU. Conservative quota+controllers
bound112s within120s. Samples are not lifetime mount/FD-maximum proof.
Prior58 pins retain r1/r2 failures/review and executed r3 negative. Prior runtime
candidate preservation rests on controller checks/AFTER, not unrelated fresh
hashing. Fresh HEAD/index/status/scoped worktree match final receipt.
No native/Cell/build run. No protected reads or compiler requalification.
Before write: slice69entries/393216B; pool539entries/67358720B including roots.
Enforce review6144B/note4096B; slice4MiB/128 inside128MiB/4096; exclusive creation
and readback. No entry reallocation needed. DEV1908MiB, Cell128MiB/3800 and
hard tmpfs768MiB/4096 unchanged. Historical overshoots and all consumed attempts
retained, no refunds. Oversized in-memory review rejected before any file write.
Inherited scope: no CURRENT/M4/repo/index/worktree/cache/publication/protected
artifact writes. Only this review and publication note are new artifacts.

NEXT PERMITTED SOURCE/MOCK IMPLEMENTATION, NOT DEPLOYMENT
After parent selective publication, integrate tools/g7-cell-owner.mjs lifecycle
and tools/g7-runtime-assembly.mjs selector. Exact baseline owner guards parent/
custody and runs Cell but never boots ingress; selector has ingress/config,
not boot. Trusted opt-in composition must use that same process/canonical graph,
await readiness before dependent operations, revoke/await close on STOP/failure
before clean-stop reporting, and retain fail-closed cleanup uncertainty. Include
boot/relative edges in inventory. Keep inert/null defaults; no arbitrary config
or identity injection. repair/ACCEPTANCE.md:34-38 requires this singleton, not
separate daemon/factory. Focused source/mock owner ordering/STOP/failure and
selector checks are the next acceptance target, not native owner execution.
OS/TLS/custody, explicit OWNER exact-checkpoint confirmation and independent
anchors remain separate. Not G7 completion, deployment, signing or acceptance.
