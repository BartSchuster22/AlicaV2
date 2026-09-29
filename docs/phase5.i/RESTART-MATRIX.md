# I7 restart / persistence matrix

| Component | Restart authority and action | Preserved state / recovery | Assertions and limits | Evidence |
|---|---|---|---|---|
| P1 | Reference operator reconstructs isolated Host/context | Selected descriptors; echo has no domain persistence | Fresh instance/scope authority; prior baseline unchanged | p1-native-runtime-0/1.log |
| P2 | Reference-owned process/context ends; reconstruct supported service | Same record store, not fixture regeneration | Native and external consumer retrieve same stored reference result | whole-write.log -> whole-read.log; clean-r2-whole-* |
| H | In-process accepted adapter dispose then reconstruct; native CLI rerun | Synthetic profile configuration; no inference/session state | Fresh adapter instance IDs, registration and denials; zero runner dispatch and zero registrations/listeners/effects/pendingCalls after each round | h-profile-reconstruction.log; review-closures-result.json H |
| D | Dispose/reconstruct Decision Host/provider/consumer | No persistent result state is promised | Actual Jev seam reselected, offline success/failure and authority denial repeat; zero resources | review-closures-result.json D |
| M | Native MemoryV4 service/bridge reconstructs using same database | Same SQLite candidate/idempotency data | Original record read and idempotent behavior; no template DB replacement | m-native-v2.log; whole-write/read |
| G | Stop/dispose and rebuild actual service using same incident directory | Same incident IDs, lifecycle and observation counts | Explicit fresh caller mapping to historical scope; both independent-source records survive reconstruction; no new observations during recovery | g-native-r3.log; review-closures-result.json G |
| K | Operator terminates/restarts only namespace-owned backend | Same Hermes backend home/database | Independent SDK readback of original task IDs/content/events; restart doesn't authorize control effects | k-native-r2.log; whole-write/read; clean-r2-whole-* |
| Entire reference | Whole namespace/process generation exits, then a new generation uses designated state | P2/M/G/K state stays in reference-only state directories | Same records recovered; H metadata reconstructed; component contexts independent by design, no fake universal service | whole-reference-result.json and clean-reproduction-result.json |

Kanban backend SIGTERM here is operator cleanup of an exclusively reference-owned process, not the forbidden task/run termination API. No production/external backend was restarted. The second clean installation is a different test: starts with empty state and compares contract/package identities and acceptance results, not generated UUIDs or timestamps.
