# G7-07 / WP6 bounded-write source regression
Base: 4df51e7590e4aa5316779817f9c208a467e3c7ae
Ledger row07: bounded exhaustion/short-write with intact state; operational-preactivation.mjs EFBIG unrun, not ENOSPC.

Actual durableWrite, unchanged: 8/8 PASS exit0 (test-r1.log). Replace/create each cover short writes, zero progress, ENOSPC, EFBIG. Partial failure retains prior bytes/inode/mode/nlink/mtime/ctime; new selection absent; private 3-byte residue retained; no FD leak. Original injected error identity propagates; zero returns INVALID_ARGUMENT. Short writes complete exact bytes/digest and publication boundaries. No production defect demonstrated or repair made.
Initial test.log exit1 before scenarios: TS transformer requires Wasm under --jitless. Initial test retained. Harness corrected with checked finite type erasure of exact AcapError/fail/check/rawDigest excerpts; no compiler or unrelated contracts initialization.
Audit: test builtins assert/strict,fs,crypto,vm; VM linker allows only fs/crypto/contracts/archive. Helpers import fs/crypto + named contracts utilities + archive safePath. No child/network calls in executed closure; source audit, not syscall containment certification.
Real tiny scratch FS inside this DEV slice; 19-byte target. writeSync-only synthetic injection after 3 actual bytes: ENOSPC is NOT actual disk exhaustion; EFBIG is NOT actual file-limit qualification. No diskfill/large allocation/Cell/native/services/keys/signing.
Run: /home/alica-dev/g7-preflight-repair-dev/toolchain/node --jitless --max-old-space-size=128 --experimental-vm-modules tests/g7/durable-write-faults.test.mjs. NODE_OPTIONS/NODE_PATH unset; timeout30+5, CPU20s, AS2GiB, FD64, file64KiB, core0: per-process, NOT aggregate-tree proof.

SHA256 (source copies reverified against exact git show):
tools/g7-durable.mjs 7df0c4b46b9729017ce1638f96e6cbc0b9481f3621aaa2feb6f960330cd2eb50
tools/g7-archive.mjs 9fe1304cb74a2dd2517a54d15fb974925e875572bff4c05139018dacbf2c2a3d
packages/acap-contracts/src/validation.ts 0351a2c75dc5fa106c64e0ba3aa592f6f846d9e85d830864dd0f24d77975db8c
tests/g7/durable-write-faults.test.mjs 1c86361eca660648520ff3245db7244954c9813d0c17f5dda0616f3edfac51fa

Publication map (candidate -> repo):
tests/g7/durable-write-faults.test.mjs -> same
RESULT.md -> docs/g7/BOUNDED-WRITE-SOURCE-RESULT.md
No helper changes. Source copies/logs/scratch/initial test evidence-only.
TESTED candidate; NOT independently reviewed/integrated/published. Parent review/publication pending. Source failure-path coverage added; full row07/WP6 OPEN: preactivation EFBIG unrun, actual ENOSPC and complete Cell/native/crash qualification excluded. No renewed grants; native/NULL/protected/signing/production/final gates persist. No CURRENT/M4/lock/index/ref changes. 980MiB commitment/old192MiB breach retained; no refunds/deletions.
