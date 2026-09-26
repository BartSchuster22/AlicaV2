SOURCE REPAIR ONLY: B1+B2. Supersedes only packaging/deadline statements in
../ACCEPTANCE.md; the original and independent review remain intact.

B1: tools/g7-runtime-assembly.mjs exact patch against 4d1db95d20ab5bff72c4f5283335487a9d155484
adds receiver/config to actual tools selector. Every recorded relative edge must
exist in final pinned inventory before runtime-inventory.json is written.
Regression extracts actual selector and pure inventory projection/guard, parses
rotation->receiver->null config recursively, and fails original selection.
It does NOT execute/import assembler, native code, bootstrap or full runtime.
It is not a whole-repository dependency/physical-package qualification.
PUBLICATION-MAP.json explicitly maps ALICA and separate Hermes artifacts.

B2: receiver frame lifetime starts at secureConnection handler entry, uses
performance.now()+2000, independent absolute timer, and data/EOF/precommit checks.
EOF at deadline is rejected. Terminal paths clear absolute/inactivity timers,
release sole slot and discard buffered bytes. TLS handshake retains separate
2000ms handshakeTimeout; no claim that handshake+frame combined is 2000ms.
Gateway uses one monotonic 2s budget, decreasing connect/TLS/write/shutdown
socket timeouts and checks between phases. Trusted unscoped numeric_endpoint is
required separately from server_name; no DNS resolution or host fallback. Null
configuration remains unavailable. No endpoint or credentials provisioned.
CA/hostname verification via default SSL context and exact peer pin unchanged.
No executor/thread/task is spawned: synchronous raw-only delivery may block that
isolated gateway event loop up to budget plus scheduler/credential-I/O latency.
Cancellation cannot interrupt synchronous delivery, but slot is released on any
return/exception, including BaseException. No detached helper can survive it.
Mocks prove source logic, NOT hard wall-time cleanup/CPU/OS custody guarantees.
Trusted credential file I/O, SSL/kernel/scheduler behavior need deployment
qualification. No real network or sleeps requested to qualify mocks. Transport
EOF can arrive despite a later shutdown failure: no rollback/durable ACK claim.

Raw Telegram hook, genuine sender/private chat pins, explicit exact confirmation
and independent-anchor attestation unchanged. No metadata/default authority.
Same process AND same module singleton is mandatory for Cell lookup and receiver;
no separate daemon/factory map is shared. Boot/listen remains unimplemented.
Factory identity seam is fixed per factory, not a mutable singleton test path.
Volatile map only, no durable ACK/restart retention. No owner confirmation exists;
action booleans remain false. No actual checkpoint/recovery/admission performed.

Original extra reviewer probe remains TOOL-APPROVAL-BLOCKED, NOT executed.
New authorized synthetic defect repros ran separately and retain original FAIL
and repaired PASS outputs. setup-failure.txt and discovery-failure.txt retain this
repair's preparation failures; original failures were not deleted or overwritten.
Per-process limits 30+5wall/20CPU/2GiB/64FD/64KiB/core0; no aggregate-tree proof.
