# Cell durable-boundary non-vacuous recovery qualification
SCOPED PASS; parent selective publication pending. This is a NEW stronger claim bound to a changed test, not a retroactive upgrade of the earlier verified-durable publication or original staging run. The prior material gap was transactions.every(ABORTED) admitting an empty result without transaction identity binding.

Tested candidate
Base ae0e609c0829495b9fd22fb590b8724bd0c264a2 plus only tests/g7/cell-preparation.test.mjs, 11558B, SHA256 000424d6a831e114aa2dc83e7ceb56a7cdb1b3382c56b5a407178e058a76cdaa. No production/native changes. Independent exact git diff/source/runtime-binding review: SCOPED PASS in INDEPENDENT-REVIEW.md.
Reused native39704B SHA256 448f1ee5c0c2083b47ad9fe71727e432ed4f67b100f7dd19f203466fd17f6ff4, source ownership.c SHA256 f19c65e61cb3b437526f618eaa4b5465fa3e00437e46a5d9e1fe87fd39a99a8d. Prior source/build receipts reused, no rebuild.

New result
Both strengthened selectors ran once sequentially. Each TAP tests1/pass1/fail0/skip0/cancel0, exit0, reaped=true, violation=null; cgroups absent. After real SIGKILL/reap and before fresh Node recovery, exactly one persisted transaction and validated numbered journal are required; expected prestates STAGING or STAGING,VERIFIED. Recovery requires one same-ID ABORTED, original cellId, accepted null. Same-ID postjournal is validated with exact added RECOVERING,ABORTED. Original signal/exit/identity-byte/no-accepted assertions retained.
Actual diagnostic IDs:
staging-durable be146c3d-6491-4977-9f00-06b0c183e755: count1 ABORTED; STAGING,RECOVERING,ABORTED.
verified-durable 136d3b73-cf56-4446-b8eb-87fd64b5c360: count1 ABORTED; STAGING,VERIFIED,RECOVERING,ABORTED.
Empty/wrong-ID rejection checked in SOURCE ONLY, not an executed mutant test. Durable guard applies only to these two cases.

Limits and exclusions
Live memory1610612736B/swap0/tasks56/FD64/FSIZE65536/core0, CPU5000/10000 burst0, start5/runtime60/stop5, test timeout30000. Strict system/home, private network AF_UNIX, empty caps, NNP and control-group kill. Observed walls4.337660/4.546312s; sampled memory104828928/105664512B, per-process FD30/30, Cell1213/1259entries and42942464/43053056 allocatedB. Polling is not continuous accounting; no final CPU total claim.
Readonly overlay uses original test path; actual Node mount samples verify overlay/native/dependencies readonly AT SAMPLE ONLY, not whole lifetime. 696 bound files independently rehashed. Cell128MiB/3800 sampled; outertmpfs768MiB/4096 hard; persistent128MiB/4096 and DEV1908MiB/4096 unchanged. Prior r4 overshoot19 retained, no refunds. Signed synthetic archives/nonshipping runtime/SBOM/provenance fixtures on tmpfs: process-kill evidence only, not power-loss/full Cell/shipping/G7 acceptance.

Evidence
Authoritative evidence directory: /home/alica-dev/g7-integrated-reconciliation/cell-nonvacuous/. Following refs are relative to it, not copies implied present in git:
verification.json SHA256 dfbd68c3e45221640a8b55c5f45943bb276b1ad111413ffa55ea509e78331b87 binds g7-cell-exit-nonvacuous-{staging,verified}-r1 command/result/log plus admission-{staging,verified}.json, after-{staging,verified}.json and controls; all listed hashes checked.
hash-receipt.json SHA256 c2b9b74caa394b608a9d14bc9f6057038227c78069a3d7d0c020030b403477bf;
cell-preparation.test.diff SHA256 8c9cfa6078160ebb7fe30ab588e4fb0d1b6929bd0dc2ce02476ed5eb8c33a564.
Next ready unchanged published selectors: journal-link denies hardlinked/incomplete journal recovery; floor-rename precedes transaction creation and may legitimately recover an empty set. No blind nonempty rule and no implementation/rerun of next criteria in this review.
