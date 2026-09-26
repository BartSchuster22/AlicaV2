# Independent v6 run review: PASS within stated scope
Read-only evidence review plus these two outputs; inherited WIP lock untouched. No tests/builds/publication/CURRENT/MemoryV4 actions. Root access used only as explicitly authorized.
Exact qualification mapping: PUBLICATION-QUALIFICATION-NOTE.md
SHA256 a767da291d902d71f83669fe3b669a68aaa818b883049b4096d4cbfa17c1e74a
Candidate a4b276c9c1ae275902f50b94338f48e2c9784e79. Full G7-10 OPEN.

Verified 16 exact candidate files against git show; 12 installed compiled identities; 14 relevant source identities; all 722 manifest entries; retained manifest and v6 command identical to tmpfs originals; both emitted build hashes match. TAP 5/5, exits0. Original assertions require boundary IPC, actual SIGKILL exit, fresh spawned reader exit0 and exact prior/target bytes. Real syscalls in unchanged durableWrite, no mocked space check. TS --noCheck is emission, NOT typechecking. Baseline source identity is not emission proof; inspected real check/rawDigest and reexports support this narrow primitive test, not whole-runtime equivalence.

Mount/FD/dependency review: tmpfs768MiB/4096 inodes, nosuid,nodev,noexec; candidate/build test inputs read-only, installed Node/compiler/Ajv closure and compiled modules read-only bound, only dedicated logs/tmp writable during tests. v6 binds exact node-v24 source to existing probe/node and execs via /bin/sh inside namespace; no global /bin change. stdout dedicated bounded file, stderr inherited to it; child ignore/pipe/pipe/IPC, fresh reader ignore/pipe/pipe. Descriptor-relative no-follow owner checks retained. These are command/source evidence, not a retained per-PID FD/mount trace. Probe confirms outside-write/network denial, local IPC and fork enclosure; reap recorded and cgroups now absent.

Live v6: RAM1610612736,swap0,tasks56,FD64,FSIZE65536; CPU5000/10000,burst0 with sequential startup5+run60+cleanup5 gives 140wall/70.01CPU bound <120CPU. Post-reap properties show defaults/infinity and are NOT live limits; parent-live-v6 is the enforcement evidence.

Failure history: v1 EXEC203 home-node path; v2 missing destination; v3/v5 NAMESPACE226 with erroneous node-v34/v54 from careless global replacements; v4 client noexec. v6 corrects exact source/namespace launch without relaxation. Excessive parent correction loop breached anti-loop discipline. Failures/costs/breaches retained, no refund; scoped test PASS does not cure that process failure.

Measured BEFORE these outputs: persistent 48 entries/360448 allocated B (253505 logical), remaining133857280B/4048 entries; tmpfs103 entries/622592 allocated B (498336 logical), remaining804683776B/3993 entries. Two <=3072B outputs budget8192 allocated B/2 entries; postwrite measured readback required. Dev free63934238720B; local5956362240B (>8GiB/>2GiB). Committed1908MiB/4GiB, unallocated2294284288B; prior reserves retained. Installed baseline not recopied; generated/copies counted. No claim of freshly measuring all historical pool entries.
