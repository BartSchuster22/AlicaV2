PARSER CORRECTION: TESTED SOURCE/MOCK; INDEPENDENT REVIEW PENDING. UNPUBLISHED.
Base ca0ca635d3ab288be331002ced2a100a175fdcee. No custody/digest bypass claim.

candidate-r2 SHA256:
tools/g7-cell-owner.mjs b6a2ecb0d409f5ee9fb1e3629ea0c4428dbf711e32fa50f334f06b0c8dc268b7
tests/g7/owner-ingress-integration.test.mjs e43c9ebd080abe7c292adcf28b35a9fec9bfeeed4cc9a06f1344a4a53f142580
tools/g7-runtime-assembly.mjs e85c01aef901bd92e421cb0320ed9d0e4c03a9756cc10ec334e9890dfec6bb3a (unchanged)
Exact prior-candidate -> r2 unified diffs:
g7-cell-owner.mjs.r2.diff 257444faf428e195e4e2dfcdb2e29ba2859a5c6018bc93fbb26670bf166cce09
owner-ingress-integration.test.mjs.r2.diff 44c11eb31709f51807d411ed3002f471a10ccf63abeaedf8ab9a49a457a5bcb2

Minimal owner change: complete arity4..6 and option-token validation; only zero
or one trailing flag/path pair; absolute/NUL-free <=104-byte ingress path.
Validation follows existing parent guard/channel/custody adoption and FD close,
before boot/input-open/install/startAccepted. With usable custody/channel,
malformed input sends uncertainty/exit1, never readiness/stopped. Missing channel
retains custody failure, not fabricated uncertainty delivery. No helper/refactor.
Both digest positions, owner budgets, canonical boot, null/no-listener default,
STOP/revoke/close/shutdown and failure ordering preserved. No supervisor/env/
config/identity changes. Other staged tools verified against exact git base.

EXECUTED (actual owner VM graph, pinned Node24.21):
Node SHA256 7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c.
Negative: readonly prior owner + new focused test, exit1, 0PASS/1FAIL:
"input-open must not happen" for six valid symbolic pins + dangling flag.
Corrected: exit0, 37PASS/0FAIL/0SKIP/0CANCEL, including all prior8 cases.
Covers pair+extra, duplicate/misplaced/dangling/unknown options, excess/short
arity, invalid paths incl UTF8 byte limit; valid4/5/6 with/without opt-in.
Production owner input-digest conditional directly executed with mismatch,
empty and swapped-pin negatives under parse/digest/check stubs. NOT real crypto
or real Cell accepted-digest validation. Accepted negative proves argument
binding and mocked Cell rejection propagation only. Cell/native/custody/TLS/
file IO/process exit are mocked, not operational qualification.

BOUNDING / COSTS / GRANTS
Existing controller/live admission reused: RAM1610612736 swap0 tasks56 FD64
FSIZE65536 core0 CPU5000/10000 burst0 start5/runtime60/stop5 test30000;
NNP/empty caps/AF_UNIX/private network/strict system+home/control-group kill.
Gate before Node; readonly source+runtime mounts sampled (old-owner override
also RO); posthash and fresh cgroup absence verified for both units.
parser-negative: wall0.580796087s, CPU sample207255us, controller sample0.833250768s, RAMpeak28712960B, FDsample24.
parser-r2: wall1.328082209s, CPU sample560952us, controller sample1.071708695s, RAMpeak49356800B, FDsample24.
Samples are NOT final CPU or OS deadline proof. Prospective180wall/120CPU;
conservative112CPU for2 units. Prior r1 consumption retained; remaining original
unit consumed by negative; one prospectively allocated internal-engineering
unit consumed by full suite. No renewals/refunds/retries; DEV1908MiB unchanged.
Before final writes slice413696B/59entries;
pool82710528B/606. Slice4MiB/128 within persistent128MiB/4096;
scratch1MiB/64 within Cell128MiB/3800 and hardtmpfs768MiB/4096.
Free DEV8GiB/local2GiB/tmpfs512MiB+payload checks passed.
All original candidate/r1/review/evidence byte-identical. Evidence: ADMISSION-*
parser*, AFTER-parser*, *parser*-command/result/log, COST-REAP-PARSER-r2.json,
PARSER-r2-ALLOCATION.json and PARSER-r2-FINAL-PINS.json.
No CURRENT/M4/repo/index/worktree/cache/publication/protected writes; no real
owner/Cell/native/build/TLS endpoint/checkpoint/signing/recovery/deployment.
