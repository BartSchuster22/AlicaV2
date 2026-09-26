# G7-10 REPAIR RESULT — TESTED; independent rereview pending
Candidate: /home/alica-dev/g7-owner-ingress-v2/durability-boundary/repair/tools/g7-durable.mjs
Baseline: 061f48aefaa7c1ffb57d66dd13e472eaca4f7ded
Narrow same-file close ownership/cleanup correction; public API unchanged. Transfer/clear before close, no released Linux FD retry. Preserve primary error, execute remaining cleanup, propagate first cleanup-only error. Includes read/list/bounded/old-selection identical defects.

Real runs (runs.json pins source/test/log hashes and exact commands):
before-close: exit0, 23 scenarios, four original defects asserted.
after-close: exit0, 23/23; reused unrelated FDs survive, no leaked owned FDs.
final18: exit0, 18/18 boundary cases against FINAL candidate.
final8: exit0, 8/8 published bounded-write cases against FINAL candidate.
Initial before-close-v1 exit1: harness lowest-free-FD assumption; retained source/log/runs/scratch. Corrected bounded filler harness, unchanged candidate.

SHA256 (relative to repair/):
tools/g7-durable.mjs 825c1f99cfe0760bd4f3d1c69fe13294ce1d3c962a23b0ceaa99f3634b2f3a40
tests/g7/close-ownership.mjs 2cd9063f9f938874b62a460f4d058aafd791d6abc090c0de163af1eafbe3fad8
tests/g7/boundary.mjs 875b809ecaa09133769b9e7c583dfc9e3c7401758dd8fcba0472f5d6e0d4e0c4
tests/g7/bounded.mjs 443227d1cef82b98ab035d302fee6b353c07ced5ce01bf5c2d94801075c525ef
QUALIFICATION.md a806c9f042500ecdc4b211d9a1d8fb1d56aeb688a458f5c1986b26c5ecdf0f6f

Exact proposed publication mapping: publication-map.json (source + 3 candidate-bound VM tests + QUALIFICATION.md + this result); NOT published/approved. Original source/report/evidence retained.
QUALIFICATION.md maps all changed close paths and limits. No independent self-review claim: focused rereview cannot be executed here without a reviewer/delegation tool. Prior CHANGES_REQUIRED remains uncleared. Next approach: parent supplies ONE independent reviewer on frozen files; no same-cycle retry.
EIO is injected AFTER real Linux close, not hardware/cross-platform qualification. No success/rollback claims following publication. Tests serial30+5wall/20CPU/2GiB/64FD/64KiB/core0 per process, not aggregate. Tiny new slice scratch only; existing Node. No native/Cell/child/network/crash tests. Gates unchanged; G7 incomplete.
Prospective ALLOCATION-REPAIR.json: root64MiB/1024entries, slice6MiB/384; reserves8MiB+64 and1MiB+64 retained. Total1012/4096MiB; original192MiB and new32MiB/12009355B breaches retained, no deletion/refund. MEASURED.json includes directories, logs, existing index and retained artifacts. No live Git/CURRENT/M4/cron/lease changes.
