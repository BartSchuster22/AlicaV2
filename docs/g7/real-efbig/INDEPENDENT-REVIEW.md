# Independent focused G7-07 / WP4 review

PASS, narrowly: real Linux RLIMIT_FSIZE short-write/EFBIG target preservation.
Review of existing execution, not a reviewer rerun or whole-G7 acceptance.
Base d537ccbb54c1339245de259bbad7858c10cfa46e. No implementation changes.

Identity and executable path
- git show as alica-dev independently matched candidate source bytes:
  tools/g7-durable.mjs SHA256
  825c1f99cfe0760bd4f3d1c69fe13294ce1d3c962a23b0ceaa99f3634b2f3a40
  tools/g7-archive.mjs SHA256
  9fe1304cb74a2dd2517a54d15fb974925e875572bff4c05139018dacbf2c2a3d
- Candidate tests/g7/real-efbig.test.mjs SHA256
  9cf2722af652721ea3aea727385d4ec00bca16790e89a087831990248b021cf9
  imports ../../tools/g7-durable.mjs: correct at that publication path.
  Its child reexecutes import.meta.url; Python launcher is inline. No missing
  test helper, operational-preactivation dependency or replacement writer.
- durableWrite uses real writeSync, advances offset, calls boundary AFTER write,
  preserves the primary failure and temporary residue. No injected fs failure,
  source patch, bypass of ownership checks or 512MiB+payload free-space guard.

Nonvacuous evidence
Read ADMISSION/r2, both commands, r1 failure, r2 result/TAP, controller diff,
FINAL-VERIFICATION, FINAL-COUNTS, AFTER, costs, source/dependency/preservation
pins and both observations. TAP is 3 PASS, 0 FAIL/SKIP/CANCEL (parent + two
cases). Each child exit0/signal=null, effective soft/hard FSIZE8192 under
parent65536, payload65536. Each first durable-writes/reads 16B positive control
in the SAME capped process/root. Thus a guard/import/permission precondition
failure cannot masquerade as the intended failure. Actual EFBIG/write/errno-27,
events exactly open,write and 8192B payload-prefix residue establish a short
write followed by failure, before fsync/link/rename. Free space before cases
761749504/761724928B exceeds the unchanged guard. Test-only SIGXFSZ policy is
Python inherited SIG_IGN plus Node handler; observed two callbacks each.
Not an assertion that default production signal policy behaves identically.

Live readonly verification
Both private case directories uid1000 mode0700. Create target absent;
replacement independently seeded by parent before child cap, 46B, unchanged
bytes and SHA256 e0848a267fd848382dc3154ec71d3a89cfd338dee60df82eb60d28261c570679.
Exactly two next-* residues, each8192B uid/gid1000 mode0600 nlink1, bytes A*8192,
SHA256 f8ca02c69621dd84cd1212ebfd7d6cdc9ba6ad658854f29567723531912d1a35.
Root-owned0600 single-link evidence copies and retained seed match originals;
both live positive controls and observations match. Originals untouched.

Provenance and admission limits
Node v24.21.0 pin 7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c;
controller-r2 pin 157f262f1e00612384db06374ba4ba95427e9c966097d1a2972c475caf1f8cc0
and reused controller independently verified. All source/runtime and 551
installed dependency file hashes/sizes rechecked; manifest digest matches.
Contracts package exports dist/index.js; reexports validation/runtime/stream/
tooling/conformance/schema-data. validation uses Ajv2020 and real check and
SHA256 rawDigest; internal imports reviewed. Ajv8.20.0 declares the four pinned
support packages. acap-types is not a runtime import on this inspected path.
These installed dist/Ajv bytes are NOT a freshly rebuilt published dependency
graph, complete system dependency closure, or fresh full-graph qualification.

R1 failed admission, no gate/Node, unit124/controller1, retained without refund.
R2 waits for actual sh/dash, not transient setup MainPID. All existing live
cgroup/property checks plus effective FSIZE/FD/core/empty capabilities/NNP
remain before gate release. Correction also preserves existing dependency
manifests/symlink and enables operator output; no safety check removed.
RAM1610612736/swap0/tasks56, cpu.max5000 10000/burst0, FD64/core0,
start5/runtime60/stop5, test timeout30000, AF_UNIX/private network/strict
system+home/control-group kill are evidenced. Actual Node readonly source,
runtime, gate and dependency mount samples present. IMPORTANT: enclosing
scratch tmpfs is rw in that sample: RESULT's 'only dedicated scratch writable'
is NOT certified exclusive write confinement. Sample is not lifetime attestation.
Live tmpfs remains768MiB/4096 inodes; both unit cgroups absent. R1 gate absent,
r2 gate present. Parent/child limits independently inspected in receipts.

Costs/preservation
Final systemd CPU0.109117s + reported1.516s is distinct from last sampled
cpu.stat1.490091s. Reported controller costs and overlapping conservative sums
are not OS deadline proof. systemd884.0K memory report is NOT workload peak:
controller observed memory.peak75685888B; neither proves final lifetime peak.
Consumed2/2 incl correction, no refunds. HEAD/index/status,125 scoped ordinary
worktree pins and58 prior candidate pins independently unchanged. No repo,
CURRENT/M4, shared cache, protected NULL/Case05/held restore or services changed.
Before review writes: slice409600B/57 entries; pool98062336B/674; scratch45056B/17;
Cell42975232B/1248. Two bounded notes fit existing4MiB/128 slice inside persistent
128MiB/4096. DEV1908MiB, Cell128MiB/3800 and tmpfs caps unchanged.

Next unfinished permitted acceptance slice
G7-08 real-current-clock expiry denial, not another closed crash-row/EFBIG review.
Published operational-preactivation.mjs:142-149 checks exit1 and state but not
specific denial; its initialization overrides Date.now. Strengthen an isolated
expiry test with exact error, no spawn/signal failure, positive valid control,
and unchanged identity/selection/floors, then separately admit qualification.
Published Cell uses Date.now for trust floors/grants. Do not call this real-clock
rollback or bounded online quiesce coverage. No such implementation/run here.
Real TLS/OS isolation/custody and explicit OWNER CellID+exact-byte checkpoint
pins remain separate gates; no signing, deployment, native/Cell execution,
ENOSPC, power-loss, complete G7-07/WP4/G7 or owner acceptance claim.
Historical pending labels in retained RESULT/receipts remain unchanged.
