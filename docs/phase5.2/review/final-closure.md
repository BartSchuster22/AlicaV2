# Phase5.2 — same-reviewer finite R1/R2 closure

Verdict: **ACCEPT_FOR_TECHNICAL_PUBLICATION_WITH_CAVEATS**

Reviewer continuity: same independent reviewer session `20260929_064940_7d88a4`, resuming the original final review, not the implementation worker. Scope: closure of R1/R2 only. No optional architecture/hardening expansion.

Exact candidate: `47e88349ed6c0399eb2e5088b41d4b5d9ac26140`
Correction implementation/test/evidence revision: `7a8050f1b7d3baae1de0d5b611213ca620f2b7a0`
Prior reviewed candidate: `1247195c2c78c091460159c8f83e0bb790b8d90f`
Accepted baseline: `ad3df9bbd0a23aedc5edcd3eae8194e04152eebd`
Archive: `/home/herman/g7-control/phase52-r1-r2-final-review-source.tar.gz`
Archive SHA256: `3cd8ead370c024c689955798df354097f6c2abd09028c791ae5aa133ba85ef7a`

R1 CLOSED. R2 CLOSED. No remaining blocking findings in this finite closure. This clears the independent review gate for this exact candidate; it does not claim publication has happened or grant Owner Acceptance. Parent may direct the separately authorized sole publication writer through D21, exact tagged-source/anonymous verification, then STOP for Owner Acceptance.

## R1 — native no-container prerequisite: CLOSED

Inspected launcher source before execution:
- `services/doghouse/tests/no-container.py:21–49`: explicit repository/runtime allowlist; regular-file copies, repository-contained dependency traversal, locked Node and resolved runtime libraries; no host bind mounts or container socket inputs.
- `no-container.py:50–65`: temporary root, fixture-only /dev/null, minimal environment, fresh mount/network/PID namespaces, chroot, non-root test identity, bounded execution and own-temporary-root cleanup.
- `services/doghouse/tests/no-container-run.mjs:6–14`: checks occur only after entering the disposable root. Walk rejects symlinks and finds zero filesystem sockets/container executable names; actual docker/podman launches must fail ENOENT; container socket paths, /proc and /sys are absent inside this fixture. Then it runs the selected native/core/public/continuity tests.

Independently executed the inspected launcher:

```sh
cd /home/herman/alica-phase52
sudo -n /usr/bin/python3 -I services/doghouse/tests/no-container.py
```

Actual result: exit 0; prerequisite PASS; docker ENOENT; podman ENOENT; filesystemSockets 0; proc false; sys false; uid 1001; **61 tests passed, zero failed**, followed by `R1_NATIVE_UNAVAILABLE_QUALIFICATION_PASS`.

Independent execution reproduced the worker's copied manifest exactly:
- copiedFiles: 1234
- copiedManifestSha256: `c27b7fb64c274381b552edcc6b084b748ebb6cfc1c937b2b70840be9cdcac9b1`
- nodeSha256: `7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c`

This proves the missing unavailable-binaries/socket prerequisite for the qualified disposable native runtime, rather than merely proving containers were not invoked. No inference about host-wide binary absence or hostile-code sandboxing is made. No production socket was inspected, copied, connected to or modified. Tests included actual public Host/SDK ingestion/query/acknowledgement and store/lifecycle behavior, not just environment checks.

Independent raw log: `/tmp/phase52-review-closure-9a_0rktk/r1-independent.log`
SHA256: `a1f721232508b0968b9c9d014ed78d0504f4499d213cb2ee016dd2bb35a22d47`

## R2 — impossible current-rule histories: CLOSED

Only product correction is the 14-line addition at `services/doghouse/contracts.mjs:61–74`. It groups incidents only for the understood rule by the already validated exact correlation key, sorts separate per-key lists by first observation time, and requires each predecessor to be RESOLVED with its resolution strictly earlier than the next incident's start. It does not mutate serialized incident array order, reinterpret unknown historical rules, change schemas or import authority.

The corrected shared validator remains used by `core.mjs:92` for import and `store.mjs:13,19` for open/commit. Therefore invalid histories are rejected before committing or serving them. The change enforces the previously frozen semantics rather than silently modifying them.

Actual independent executions:
1. Ran `services/doghouse/tests/review-r2.test.mjs` under `unshare -Urn` with locked Node: **12 passed, zero failed**, exit 0.
2. The same 12 cases passed inside the R1 disposable runtime.
3. Reran the unchanged original reviewer R2 reproduction, selected by `--test-name-pattern='REVIEW R2:'`: **1 passed, zero failed**, exit 0. The original FAILED_PRECONDITION expectation now succeeds; the illegal history is not imported/continued.

The new tests were read before execution. `review-r2.test.mjs:15–27` covers resolved overlap, equal recovery/start, equal starts, OPEN predecessor and ACKNOWLEDGED predecessor, in both incident-array orders. Each case checks fresh import rejection with state unchanged, existing store commit rejection with unchanged bytes, and invalid store open rejection without rewriting bytes or retaining the writer marker. Lines 29–35 positively exercise reversed valid recurrence through restart/authorized continuation and overlapping unknown-rule HISTORICAL_ONLY preservation with separate current-rule continuation.

Original reviewer fixture SHA256 remains `2bd7fb4a7b09b1b9b50596caa9c7a994a0e0999e0e1b63c63f37cb0b89d7ebf7`.
Original reproduction command:

```sh
cd /home/herman/alica-phase52
unshare -Urn .tools/node-v24.21.0-linux-x64/bin/node --experimental-vm-modules --test --test-timeout=30000 --test-name-pattern='REVIEW R2:' /tmp/phase52-independent-review-flX8sg/reviewer.test.mjs
```

Independent raw log: `/tmp/phase52-review-closure-9a_0rktk/r2-original-repro.log`
SHA256: `4afadf2674c322b31dff1e5cde16be0562152b14ae90fb1c3a90c85851643813`

The worker's hash-bound counterfactual record reports 10 negative failures/2 positive passes on the old validator. That counterfactual was not independently rerun in this closure; direct independent evidence is the corrected tests plus the original unchanged reviewer reproduction that failed in the prior review and now passes.

## Exact-source binding and receipt continuity

Independently verified:
- HEAD is exactly the named candidate. Compared all 60,382 regular archive files to the candidate's Git blob identities: zero mismatches, extras or missing files. Archive SHA256 matches the supplied pin.
- Candidate is a two-file manifest/verifier child of the correction revision; no product change after the qualified correction. Prior-candidate-to-current diff is 20 files, with the sole product change above; the rest is corrective test tooling, documentation, raw evidence and preserved review copies.
- Executed `node docs/phase5.2/verify.mjs`: VERIFIED, 90 hash-bound entries, correction revision `7a8050f1...`, 61 tests/0 fail recorded. Hash verification is not treated as test execution; independent executions are separately described above.
- Supplement SHA256: `cec63532c8a33fe739700943e91c7d1798a4e7e401756af738fc0eca5a793e78`.
- Corrected contracts.mjs SHA256: `84658e24fe25d5daca822a6e8acec26ccf267029de2198159a6f85bf441139b4`.
- The full Catalog proposal/admission tree, original qualification.json, approved DESIGN/design contracts and parent design review are byte-unchanged against the prior reviewed candidate.
- Independently verified all original 46 qualification hashes against `1247195c...` and all original 10 admission/conformance hashes against `606e1645`, not against revised runtime bytes. No admission command was invoked or admission reissued.
- `QUALIFICATION-SUPPLEMENT-R1-R2.md:23–33` and `README.md:41–51` now correctly distinguish original historical admission from supplementary current runtime qualification. The old admission alone is not claimed to hash-certify the corrected validator.
- Original source archive still hashes to `11526a9569e5f521523e0a0164968655fcb82eaddf2a62879e648562210b17af`.
- Original review MD/JSON remain verbatim, with hashes `67724e1a4cf6e2990f759c615d299bf822ddbd77e51538f85731811188ef05dc` and `5633569c153d1a06cfa62b80e42829a2912e77aa2e0a85938d1a7fa6327cf8fd`; repository copies match them byte-for-byte. This closure supplements, not overwrites, the prior BLOCKED verdict.
- Frozen packages/Foundation/Decision/MemoryV4/phase5.1 and root package/lock/toolchain tracked paths still have zero diff against the accepted baseline. Original admission/design paths also have zero diff against the prior reviewed candidate. Working tree has only the same two inherited untracked generated Catalog schemas.

## Evidence scope and retained caveats

- The changed runtime was independently exercised in the 61-test native suite. The separate independent-consumer worker rerun log (`r1-r2-external.log`) is hash-bound and records 1/1 passing; its previously reviewed offline packaging fixture is unchanged. I did not rerun that packaging or unrelated broad D19 regressions during this R1/R2-only closure.
- D19 evidence reuse is explicitly labeled, supported by unchanged frozen sources and hash-bound original logs. Inherited Catalog dependency and retired-v1 failures remain failures, not repaired or counted green. No live authorities renewed.
- Historical source-range whitespace in raw failure logs remains preserved and is now correctly scoped in the documentation. Current Doghouse correction diff check passed. No demand to rewrite historical raw evidence.
- Worker ENOSPC/preparatory fixture failures remain disclosed, not counted as successful qualification. The R1 launch in this independent closure completed successfully without cleanup outside its own disposable root.
- Existing caveats remain: EXPERIMENTAL/trustVerified=false; historical semantic mapping rather than old-format migration; operator-trusted native composition, not hostile-code confinement; cooperative deadlines, not preemptible fsync; no cross-version migration or power-loss certification; no probes/control/remediation/manual resolution/public health transport; no production adoption or Phase5.3.
- D21 publication/tag/anonymous exact-source verification is still pending. Clearance here concerns the exact reviewed candidate; any release packaging of this closure must preserve runtime/design/evidence identities and make the technical-publication versus Owner-Acceptance distinction explicit.

## Boundary and disposition

No remaining R1/R2 blockers. No new optional work is required for this finite review. Parent may consume this result and direct the sole authorized publication writer. After the authorized technical publication and verification, STOP for Owner Acceptance.

Reviewer performed no lease acquire/probe/release, continuity or MemoryV4 sync, implementation edit, production/socket access, SSH/provider test, subworker/cron launch, publication or tag operation. The only persistent reviewer writes are this closure and its companion JSON; test writes were disposable fixture state/logs. Original review files were not changed.
