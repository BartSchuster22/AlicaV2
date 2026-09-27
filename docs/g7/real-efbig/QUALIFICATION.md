G7-07 / WP4: FOCUSED REAL SHORT-WRITE/EFBIG PASS.
Independent review pending. Test-only candidate; NOT published or full G7.

Actual run: g7-real-efbig-r2 exit0; TAP tests3/pass3/fail0/skip0/cancel0
(parent test + create + replace). Two capped children exit0, signal=null.
Each child first successfully durable-wrote/read a 16B positive control.
Payload65536B, effective child RLIMIT_FSIZE soft=hard8192; parent65536.
Unmodified actual fs.writeSync in published durableWrite returned a short
write (one after-write boundary, residue8192B), then threw EFBIG, syscall
write, errno -27. No injected fs failure/source patch. Each child observed
2 SIGXFSZ callbacks: Python explicitly inherited SIG_IGN, then bounded
Node test-only handler. This is an observed EFBIG exception, not signal-only.
Free tmpfs before cases761749504/761724928B exceeded512MiB+65536;
production guard preserved. Hard tmpfs768MiB/4096 inodes verified.

Create target absent. Replacement independently seeded by parent before
lower-cap child: 46B, path scratch/tmp/replace/target.bin, SHA256
 e0848a267fd848382dc3154ec71d3a89cfd338dee60df82eb60d28261c570679
Byte equality + hash unchanged after failure; external readback confirmed.
Scratch=/run/g7-integrated-reconciliation/cell-exit-r1/real-efbig.
Residue: exactly2 next-* files,8192B each,total16384B,uid/gid1000,0600,
nlink1, exact payload prefixes, each SHA256
 f8ca02c69621dd84cd1212ebfd7d6cdc9ba6ad658854f29567723531912d1a35
Originals retained; root-owned0600 persistent copies plus seed retained.
Full paths/ownership/hash receipts: FINAL-VERIFICATION.json and observations.

Exact git show as alica-dev, base d537ccbb54c1339245de259bbad7858c10cfa46e:
durable SHA256 825c1f99cfe0760bd4f3d1c69fe13294ce1d3c962a23b0ceaa99f3634b2f3a40
archive SHA256 9fe1304cb74a2dd2517a54d15fb974925e875572bff4c05139018dacbf2c2a3d
New test SHA256 9cf2722af652721ea3aea727385d4ec00bca16790e89a087831990248b021cf9
Controller r2 157f262f1e00612384db06374ba4ba95427e9c966097d1a2972c475caf1f8cc0
Node24.21 SHA256 7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c
Ledger/resource-mode reviewed/staged, not executed. Minimal durable/archive
imports use readonly installed contracts dist + Ajv graph (551 pinned files),
not a freshly rebuilt published dependency graph. No native/Cell/signing/
TLS/live owner/stale signed fixture/build/deployment or production changes.

Reused controller live admission before Node; corrected extra check to wait
for actual gated shell, not systemd privilege-setup process. R1 NOT admitted,
no Node, unit124/controller1; cgroup absent. R2 actual shell/parent/children
limits checked. RAM1610612736/swap0/tasks56/FD64/core0/CPU5000:10000/burst0,
start5/runtime60/stop5/test30000, NNP/emptycaps/AF_UNIX/private network,
strict system/home/control-group kill. Actual Node RO source/runtime/gate
mounts sampled; only dedicated scratch writable. Both cgroups absent.
Posthash source/runtime/dependencies/named prior candidates unchanged;
HEAD/index/status + scoped ordinary tools/tests worktree hashes unchanged.

Costs: units final CPU0.109117s + reported1.516s; runtime4.062726s+3.825s.
Controller time user/system0.38/0.22s +1.47/0.74s, wall0.65+4.73s.
Conservative reported sums CPU4.435117s, overlapping wall13.267726s.
Rounded final reports distinct from sampled cpu.stat; no OS deadline proof.
Consumed2/2 units incl1 correction, no refunds; all prior grants consumed.
4MiB/128 persistent +1MiB/64 scratch internal; DEV1908MiB unchanged.
Before-write pool97648640B/616 entries; scratch now45056B/17 entries.
Before-report slice397312B/54 entries; final counts in FINAL-COUNTS.json.
Admission/free-space/cost/TAP/code/after-pins retained in this directory.
No CURRENT/M4/git publication or protected evidence/cache cleanup.
No bug found; no ENOSPC/disk-full/power-loss/full G7 qualification claim.
