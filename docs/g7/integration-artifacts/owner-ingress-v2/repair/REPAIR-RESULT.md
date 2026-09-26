SOURCE REPAIR B1+B2 TESTED; NOT PUBLISHED. Focused independent re-review required.
Baseline: 4d1db95d20ab5bff72c4f5283335487a9d155484.
All new artifacts remain in /home/alica-dev/g7-owner-ingress-v2/repair.

B1: exact runtime-assembly.patch adds receiver + null config to the actual closed
selector. Relative dependencies must occur in final pinned inventory. Regression
parses the 3-module ingress closure and executes only extracted selector/pure
inventory projection/guard. Original FAIL: missing receiver; revised PASS.
No assembler invocation/import, full repository copy/diff, native/runtime/bootstrap
execution. Whole-package physical assembly is NOT qualified. PUBLICATION-MAP.json
maps all ALICA/Hermes source, patches, baseline dependencies and synthetic tests.

B2: receiver has monotonic 2000ms absolute frame timer plus data/EOF/precommit
checks, exclusive boundary, timer cleanup and slot release. Drip feed cannot reset
lifetime. TLS handshake retains a separate 2000ms bound. Gateway has one 2s
monotonic budget across connect/TLS/pin/write/shutdown. Required trusted numeric
endpoint avoids DNS; separate TLS hostname and CA+exact pin preserved. No endpoint
provisioned; CONFIG=None/null retained. No executor/thread/detached task. Delivery
is synchronous: cancellation cannot preempt it, but every exit releases the slot.
Scheduler/kernel/SSL and credential-file-I/O hard resource bounds are NOT proved
by mocks; deployment qualification remains required. No sleep/network proof asked.

ACTUALLY RAN, serial with recorded exit/log/CPU/wall evidence:
- Existing gateway44, receiver118, preflight61 INCLUDING prior9, durable13: PASS.
- Original packaging/receiver-drip/gateway-cumulative repros: exit1 as expected;
  repaired packaging PASS, receiver12 deadline cases PASS, gateway17 cases PASS.
- Assembly parser --check: PASS, no module execution. Python source AST parsed.
Tests cover drip, deadline boundary, withheld timer dispatch/no late commit,
cleanup, concurrency release, cancellation/error and cumulative delivery phases.
AUDIT.json binds pre-execution inspected test bytes. Limits per process:
30+5wall/20CPU/2GiB/64FD/64KiB/core0; NOT aggregate-tree containment proof.

Original candidate/review/failures preserved; original manifest reverified.
Previous reviewer extra probe remains TOOL-APPROVAL-BLOCKED, NOT executed; these
new authorized repros are separate. Setup binary-text read and missing optional
standalone durable-test lookup failures recorded, not hidden. Durable13 ran in
preflight harness. No live repo/Hermes, accounts, keys, services, checkpoint,
recovery, CURRENT/M4/cron/index/ref/commit/push changes or nested lease.

Raw TG hook before cleaning/batching unchanged; actual sender/privatechat and
explicit exact owner confirmation required, no config metadata defaults. Receiver
and lookup MUST share process/module singleton. Boot/listen unimplemented remains
prerequisite. Map volatile; no durable ACK. No owner confirmation exists. Action
booleans false. G7 incomplete. SOURCE tested != deployment/owner acceptance.

Exact SHA256 (all source/patch/test hashes in SOURCE-SHA256.json):
assembly 74b4e3193ac96660c4f381fa190fbfe985b813978a61733d0f24e1605b131651
receiver 2331efffc3a2a94b119f0f3216687c05338593bee9122688f90c0cf539980c03
gateway  2515c6b32c31a44ff45dc624ecc27f37de47ec91553028b0e60c6999c3de38b6
manifest 9e24408ff6efcec259f4b258b8dd6571f91f53b68291071ccfbcc2f62e222095

ACCOUNTING.json gives final root-inclusive totals/free checks. Root cap32MiB/512;
commitments old224+new32+previous724=980MiB/4GiB, prior192 breach retained, no
refund/delete. Local256 retained controls only; no source/evidence file downloads.
Existing Node reused read-only. No publication performed or implied.
