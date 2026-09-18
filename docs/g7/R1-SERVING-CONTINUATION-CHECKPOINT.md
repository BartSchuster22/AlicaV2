# Continuous serving and repeated maintenance — implementation checkpoint

Baseline: `974ee15e460e3a8bebabd9d7251d1fcd5f0c5028`. Development disposable Cells only. Candidate for independent parent review/rerun/publication; not G7 acceptance.

## Continuous authority

`CellPreparation.ownedBegin(inputs)` creates the same from-inception child coordinator as the prior exact-reinstall implementation. The coordinator installs the real original Cell once, seals admission, requires normal shutdown and exact owner reap, then normally reaps its exact custodian. The maintenance parent revalidates the authenticated stopped selection and actually exact-reinstalls it. It retains the coordinator, its private credential-authenticated packet channel, pinned pidfd, and the SAME initial flock open-file description.

`ownedServe(inputs)` is reachable only on that object while the relationship remains live. It rechecks the original archive, accepted inventory and independent inputs, then requests a successor over the inherited private relationship. This is not a public clean-receipt API and is not a new live admin operation. The coordinator forks a new exact custodian, establishes its pidfd before GO, and that custodian starts a new real owner against the committed accepted selection. The owner independently rereads current trust and authorization and uses the existing `startAccepted` path: original identity and opaque Kernel state, current public-Kernel trust continuity, fresh instance-bound grants, actual IPC readiness, actual provider and consumer synthetic calls, and exact expected selection.

`ownedMaintain(inputs, optionalTargetInputs)` seals all successor listeners and admitted connections, including unsealed v1/v2 clients. It requires fresh normal owner shutdown/reap AND normal exact custodian reap. Only the newly authenticated CLEAN packet under the continuing original relationship permits further Cell access. It performs a real exact reinstall; an optional distinct target uses the existing real upgrade transaction and shuts it down before returning. The object may then serve again. There is no detached adoption, cached receipt reuse, PID/socket/EOF permission, caller clean flag or replayed mutation. Concurrent orchestration is rejected. Ordinary mutating methods and close cannot bypass an active session.

`ownedWait()` observes coordinator loss while the foreground caller is idle. The exact spawned child's exit invalidates the session and wakes the foreground CLI; it never certifies cleanup. `ownedFinish()` requires stopped continuous custody and normally reaps the independent coordinator before success. It retains the durable fence. A later invocation cannot adopt the completed session.

## Fence, administration and deadlines

The original supervision directory/inode is retained throughout. Only after actual predecessor owner and custodian reaps does a lexical successor archive the predecessor incarnation with a no-replace hardlink, sync it, retire the old incarnation name and reaped socket names, and publish its own incarnation/endpoints. Prior incarnation bytes/inodes remain in `supervision/retired-<uuid>.json`; they confer no authority. A crash anywhere leaves the original fence and denies detached entry. No remove-fence workaround exists.

The detached supervisor still exclusively creates its directory. Its directory-creation hook is overridden only by the coordinator's lexical owned successor. No CLI option, clean boolean or serialized receipt selects this branch.

A1+B1 is unchanged: v1/v2 separate endpoints and closed envelopes, explicit write EOF before dispatch, unknown-selection semantics, aggregate eight connections, one mutation slot and 30000 ms admission deadline. Ordinary admin stop retains its existing meaning and restart eligibility under that custodian; it does not release ownership or authorize offline maintenance. The private seal additionally closes admission for owned orchestration.

Verification remains bounded by 300000 ms, activation and cleanup by 30000 ms. The coordinator independently contains a blocked maintenance parent; the successor custodian independently supervises its owner. Each new maintenance budget starts only after NEW actual normal reaps, never from a heartbeat or caller reset. Idle serving has no arbitrary overall lifetime timer; this does not extend grants or trust. The minimal profile's existing grant lifetimes still expire/fail closed, with no new renewal policy or automatic revival. RUNNING returned by `ownedServe` is the just-observed readiness result; subsequent live observations use admin, not a parent-side cached liveness flag.

## Foreground commands

With the qualified development toolchain and an initialized private disposable Cell:

```
PATH="$PWD/.tools/node/bin:$PATH"
node --experimental-vm-modules tools/g7-owned-cli.mjs serve /absolute/cell /absolute/inputs.json
node --experimental-vm-modules tools/g7-owned-cli.mjs cycle /absolute/cell /absolute/prior.json /absolute/target.json /absolute/target.json
```

`serve` remains foreground. SIGINT/SIGTERM requests private sealing, actual reaps, exact maintenance and final coordinator reap; a signal itself is never a clean receipt. `cycle` serves the initial accepted selection, performs each requested maintenance/upgrade and returns it to serving, then seals/exact-reinstalls/finishes. Repeated identical target inputs mean exact maintenance, not a transaction replay. Inputs remain closed private `{archive, trust, authorization}` objects. Neither command adopts an existing fenced run. Existing exact-reinstall/upgrade commands keep their stopped fenced terminal behavior.

## Crash reconciliation boundary

The approved R1 recovery table still controls. In particular, missing/invalid current trust or uncertain reap requires NEEDS_OPERATOR. Accepted pointer or COMMITTED bytes describe configuration; they are not runtime cleanup or restart authority. The new process/fence/commit death tests must preserve residues and reject fresh adoption. No automatic rollback, interrupted mutation replay, stale custody reuse or revival of revoked prior is authorized or implemented.

A lost foreground maintenance parent loses the continuous certificate; parent-death containment is not normal clean reap. Safe general post-crash adoption/reconciliation is therefore NOT delivered here. This is an engineering/qualification gap, not an invented request to reapprove R1. A surviving custodian/reconciler that can establish the required actual process cleanup and independently current authority, or a separately owner-decided exceptional recovery procedure, is still needed. No such exception is silently inferred from a stale socket, pidfd death, fence record or receipt. Existing early pre-activation recovery remains as previously bounded.

## Remaining G7 work

This checkpoint does not complete assembly/SBOM/provenance/license/bootstrap qualification (reuse inventory preparation, not its result as delivery), age/X25519 encrypted stopped backup and independent same-identity restore, online/disconnected two-host qualification of identical actual assembled bytes, owner production signing or final acceptance. No production service/deployment, production key access, dependencies/global installs, RAM/swap, protected licensing/archive changes, commits or pushes are part of this work.

Actual execution, original failures, final source bindings and coverage limits belong in the companion execution record and `evidence/g7/serving-continuation`.
