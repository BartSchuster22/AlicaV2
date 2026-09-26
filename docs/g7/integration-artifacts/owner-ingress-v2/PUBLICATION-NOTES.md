# Publication-only reconciliation; not deployment

Authoritative focused outcome: existing DEV repair-reviewer-run.log reports B1/B2
logic PASS, original repros expected FAIL, repaired synthetic tests PASS, and all
32 manifest hashes unchanged. Formal repair/INDEPENDENT-REVIEW.md was tool-filter
blocked; it does not exist. No signed review has been created or substituted.
The original logs/evidence remain on DEV, not exported in this publication map.

FINAL-MAP.json in the DEV publication directory supersedes the historical
repair/PUBLICATION-MAP.json destinations only. No tested source bytes changed.
The original ACCEPTANCE.md and repair/ACCEPTANCE.md are both published unchanged
at this relative layout. repair/REPAIR-RESULT.md is historical: its pending-review
wording predates the authoritative reviewer log; this note reconciles chronology,
not review scope. Historical accounting/audit/log references remain DEV-only;
they are not missing runtime dependencies or claimed published evidence.

All tools at the repository tools/ paths are ALICA candidates. Everything under
this integration-artifacts directory is NONACTIVE evidence/source material.
Hermes gateway modules, Telegram patch and baseline identity are inert artifacts:
NEVER apply them to live Hermes as part of this parent publication script.
Original source fixtures at tools/ and gateway/ here are deadline negative-repro
inputs only. Repaired fixtures/tests retain the exact repair/ relative layout.
The original standalone acceptance notes are superseded ONLY for repaired
packaging/deadline points; all security and deployment caveats remain in force.

Reproduce from this directory with an existing Node supporting vm modules and
Python3 stdlib; no installation is needed. Use the same bounded serial runner
contract as repair/run.py (adjust its fixed Node locator to existing Node if
needed; it is an administrative runner, NOT a no-child test). Direct test commands:
  python3 -B repair/tests/gateway_test.py
  python3 -B repair/tests/deadline_gateway.py
  node --jitless --experimental-vm-modules --max-old-space-size=256 repair/tests/receiver_test.mjs
  node --jitless --experimental-vm-modules --max-old-space-size=256 repair/tests/deadline_receiver.mjs
  node --jitless --experimental-vm-modules --max-old-space-size=256 repair/tests/packaging_test.mjs
  node --jitless --experimental-vm-modules --max-old-space-size=256 repair/tests/g7-cell-recovery-preflight.test.mjs
Append original to either deadline test or packaging test for the retained
expected-failure repro. Tests use explicit synthetic objects/mocks only. Never
execute/import assembler, actual Cell, native, bootstrap or Kernel for these tests.
Gateway test writes only the deterministic synthetic.frame under repair/tests/.
Dependencies: Node builtins assert/fs/vm/events/crypto/tls/path/perf_hooks/timers;
Python stdlib asyncio/ast/copy/hashlib/struct/os/sys/pathlib/types/unittest.mock/
importlib/re/socket/ssl/time/ipaddress. No third-party test package required.

Limits: serial 30+5 wall,20CPU,2GiB,64FD,64KiB per-file,core0; per-process only,
not aggregate-tree or OS-hard guarantees. Scripts/modules do not provision keys,
accounts, endpoints or services. Default configurations stay null/None. Receiver
lookup needs same process/module singleton; boot/listen unimplemented; volatile,
no durable ACK. Credential I/O, scheduler and cancellation limitations remain.
No checkpoint authorized; action booleans false; production ingress unfinished.
Source-scoped synthetic evidence is not physical-package/native/runtime/security
custody/deployment qualification, owner acceptance, or G7 completion.
