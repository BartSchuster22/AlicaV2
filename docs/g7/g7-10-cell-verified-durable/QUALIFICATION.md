# G7-10 scoped Cell process-crash evidence
Status: independently reviewed PASS for ONE preactivation criterion; prepared for selective publication, not yet published by this review.
Candidate: 761038abe8ddeccd45d22b06e81676dab9467b13.
Original test: tests/g7/cell-preparation.test.mjs
Exact selector: ^external SIGKILL at verified-durable with fresh-process readback$
Test SHA256: 085e5ddf852c581dfd510b5bf4d057648f06532d19bdfafe6e04caf9df468b2b.
Native source SHA256: f19c65e61cb3b437526f618eaa4b5465fa3e00437e46a5d9e1fe87fd39a99a8d.
Fresh addon: 39704 bytes; SHA256 448f1ee5c0c2083b47ad9fe71727e432ed4f67b100f7dd19f203466fd17f6ff4.

Receipts (relative evidence references):
cell-exit-r1/native-source-build-receipt-r5b.json
SHA256 d1108c4ef70f6acfac4bccd1328a309686914ca04692ba86622bf369bc05419a
cell-exit-r1/native-build-binding-r5.json
SHA256 d4b4708ef0f976cd87655c5ec83c164e5746e7c80fdd45a29c5aefad4416aca1
cell-exit-r1/g7-cell-exit-r5c-test.log
SHA256 e9dd04c296820e129e207e5d4671a67ebf5c7e6867632f28745a947faf3930c5
cell-exit-r1/g7-cell-exit-r5c-test-command.json
SHA256 9ff4acbd628c9fb2e693c3910f5b1fe280d89084b34155fbe14a26a4f28a013b
cell-exit-r1/g7-cell-exit-r5c-test-result.json
SHA256 692b0af56965702f288a035b6a2d038f04b59f8070f7f2da03da6fb940b4161f

TAP: 1 PASS,0 FAIL,0 SKIP. Original observer pauses after real transaction-directory fsync with two journal records. Test asserts actual SIGKILL, fresh-process recovery exit0/all reported transactions ABORTED, unchanged identity bytes and absent accepted.json. Source/fixture assertions unchanged. Synthetic signed archive and nonshipping fixture metadata; no activation.
Build r5 FileBusy corrected only by removing conflicting readonly compiler_rt child mount; r5b succeeded. Test r5 missing echo-a corrected only by binding exact source-reviewed dependency; r5c passed without rebuild. Retained failures/cache provenance remain attributable; shared cache hash unchanged.

Live receipts: RAM1.5GiB,swap0,tasks56,FD64,CPU5000/10000 burst0,start5/runtime60/cleanup5 seconds; build FSIZE16MiB under approved engineering amendment, original test FSIZE65536/timeout30s. Four cgroups reaped and independently absent. CPU quota with bounded lifetime is not a measured cumulative total; last CPU readings and observed peaks are not final totals. Requested readonly bindings and afterhashes are evidenced; setup mount snapshots are not final post-exec mount attestations.
Cell128MiB/3800 entries sampled, not hard inner quota; outer tmpfs768MiB/4096 hard limits. R4 overshoot19 retained; no refund. DEV1908MiB/4096 and persistent128MiB/4096 reservations unchanged.
Not power-loss persistence on tmpfs, full dependency/reproducibility qualification, G6 activation, full Cell/G7 qualification, release or owner acceptance. G7-10 other boundaries remain open. Next unchanged selector: ^external SIGKILL at staging-durable with fresh-process readback$ in the same published test.
