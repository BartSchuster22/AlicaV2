# Finite qualification correction — R1/R2

Status: IMPLEMENTED AND RE-EVIDENCED, awaiting focused SAME-REVIEWER closure. Initial independent verdict remains BLOCKED_CONCRETE_FINDINGS, preserved verbatim in review/final-blocked.md/.json. This supplement is not reviewer approval, publication or Owner Acceptance. No optional hardening or new contracts.

## R1: genuinely unavailable container runtime/socket

`sudo -n /usr/bin/python3 -I services/doghouse/tests/no-container.py` executed successfully. It creates a disposable root from explicitly allowlisted repository source/build dependencies, locked Node24.21.0 and its ldd-resolved regular libraries; no host directory bind mount, credentials, socket or operational Doghouse input. A new mount/network/PID namespace and chroot isolate the copied filesystem. Test process runs as unprivileged uid1001; only temporary fixture state is writable. No /proc or /sys. The only created device is the fixture's /dev/null. No production path/service/socket is altered, copied or probed.

Before testing, the inside-chroot runner walks its own filesystem: zero sockets, no docker/podman/containerd/dockerd/crictl names or symlinks. Actual attempts to launch docker and podman return ENOENT. Known container-socket paths are absent INSIDE THE FIXTURE ONLY; no socket connection attempted. Empty environment/PATH=/node/bin, no container package managers or host socket descriptors passed (stdio only). No hostile-code sandbox certification implied.

Actual evidence/r1-native-unavailable.log: prerequisite PASS and61/61 tests PASS,0 failed. Includes native composition, public Host/SDK ingestion/get/list/acknowledge, restart/backup/crash/deadlines/canonical/authority/capacity and12 R2 tests. Copied-file manifest digest and Node executable hash emitted in the log. This supplies the missing unavailable-binaries/socket evidence; original network-only23/50-test receipts did not do so.

First attempt exhausted disk during copying/running and tee could retain only partial/empty evidence/r1-initial-enospc-partial.log. Actual tool output had prerequisite PASS, then1 pass/60 ENOSPC-related failures. Not counted as qualification. Removed ONLY the previous disposable .tools/phase52-reproduction directory after verifying its contracts bytes against1247195c; original archive, source and evidence retained. Successful rerun recorded fully. No production cleanup.

## R2: complete understood-correlation lifetimes

Only product change:14 lines in services/doghouse/contracts.mjs. After unchanged per-incident validation, group exact COMPATIBLE scope/target/rule correlation keys, sort a separate list by first observation time, and require every predecessor to be RESOLVED strictly before its successor starts. This rejects overlaps, equal recovery/start, equal starts and active/acknowledged predecessors regardless of serialized incident array order. Shared validator covers atomic import, store commit and store open. Unknown-rule HISTORICAL_ONLY semantics are not reinterpreted; no authority mapping changes.

services/doghouse/tests/review-r2.test.mjs has12 focused tests: five illegal histories in each array order, each asserting fresh import unchanged, existing durable store commit unchanged, corrupt store open rejects without rewriting bytes/retaining ownership; positive reverse-order valid recurrence/restart/authorized continuation; overlapping unknown-rule HISTORICAL_ONLY retained with independent current-rule continuation. Focused corrected run12/12; also12/12 inside R1's61-test run.

Counterfactual: identical new tests executed with original1247195c contracts in disposable .tools/r2-before:10 negative tests fail because the old implementation accepts them,2 positives pass. evidence/r2-before-negative.log. This demonstrates the negatives are not merely rejected by unrelated schema checks. Initial new historical-only fixture omitted updating resolution.rule:11 pass/1 fail in r2-focused.log; fixed fixture only, retaining coherent unknown provenance; r2-focused-corrected.log12/12.

## Evidence reuse and immutable history

Original catalog/proposals/assurance-incidents files, admission10 hashes, design reviews and qualification.json remain byte-identical. Admission's old source-hash check must be reproduced against its original revision606e1645, not reissued against amended contracts. New qualification-r1-r2.json is an APPENDED supplement with current hashes, prior-receipt hash and original revision references; verify.mjs now verifies this supplement. The original source archive remains untouched; new exact candidate archive uses a separate r1-r2 filename.

Changed domain path exercised in all61 native tests; separately reran the actual offline-installed public consumer1/1 (r1-r2-external.log), rather than assuming the changed validator cannot affect it. D19 broad unrelated regressions are reused, not rerun: frozen packages/Foundation/Decision/MemoryV4/root lock/toolchain bytes have zero diff against reviewed candidate and accepted baseline, and existing regression log hashes are retained in supplementary verification. Inherited Catalog checker and retired-v1 failures remain FAILURES, not green or repaired. No live providers or closed-grant renewal.

`git diff --check` scope correction: historical baseline-to1247195c exits2 on four whitespace lines in preserved raw failure logs (historical-range-whitespace.log); old claims only covered clean working-tree/staged changes. Original log bytes stay untouched. Current runtime/source correction check passes; no blanket historical-range clean claim.

## Gate correction / handoff

D13/R1 and D10/D15/D16/D17/R2 now have finite corrective implementation/evidence, SAME-REVIEWER closure PENDING. D13b original admission preserved as historical governance, not newly self-certified; EXPERIMENTAL/trustVerified=false unchanged. Other gate caveats/nonclaims retained. D21 publication/tag/anonymous verification remains BLOCKED pending reviewer clearance. No Owner Acceptance tag, Phase5.3, production adoption, restoration/control/SSH/MemoryV4/provider action, subworker, parent-lease operation or continuity sync. Parent handles governed checkpoint sync after exit.
