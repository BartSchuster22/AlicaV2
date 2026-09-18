# R1 continuous-owned cross-process reinstall and upgrade — candidate

This is implementation/qualification work on baseline `bd90730511bb20950bd5564cb394055e82105fe8`, not parent acceptance or G7 completion. Historical reviews, manifests, IPC fixture correction, approved schemas and numerical limits are unchanged. Final execution results belong in the companion execution record, not inferred from this design description.

## Authority and actual process path

`tools/g7-owned-cli.mjs` creates a `CellPreparation` and holds its original Cell-directory flock before starting the shipped Python coordinator. An inherited anonymous SEQPACKET channel and the SAME open-file-description lock are passed only to that spawned child. Per-message SCM_CREDENTIALS authenticate actual peer PID/UID/GID; retained pidfds pin lifetimes, and Linux parent-death guards contain parent loss. An inherited descriptor is inception plumbing, not a supplied clean permit.

The coordinator performs the existing actual initial installation and owner lifecycle through its forked custodian. It seals listeners and already admitted clients, requires the owner's normal clean shutdown and exact reap, and normally reaps its exact custodian. Only that lexical path emits the authenticated CLEAN selection to its maintenance parent. The parent compares the original accepted selection, rereads independently supplied trust/authorization/archive inputs and calls the existing exact-reinstall operation. No original Cell is replaced at this boundary. The original owner process and the maintenance process are different processes.

The coordinator stays alive as an independent maintenance watchdog while holding the same flock. Verification retains its 300000 ms ceiling; activation and cleanup each retain their 30000 ms ceiling, bounded also by the overall maintenance deadline. After maintenance, normal exact coordinator reap is required before CLI success. EOF, force-kill, cached STOPPED, a PID, socket path, checksum or a serialized clean receipt is never sufficient authority. Fault containment does not certify completed IO or reap.

The no-op exact reinstall checks both original accepted inventory and original supplied archive, accepted authorization and current trust. It copies original opaque Kernel bytes verbatim into a private temporary working state, invokes the public Kernel with `initialize:false`, and checks normal cleanup. Production code does not decode, reset or rewrite original Kernel state. The original identity, accepted selection, journals, G7 floor and Kernel high-water bytes/inodes must remain unchanged. New trust may be checked without advancing the original no-op high-water state, consistent with the existing exact-reinstall contract.

## Mutating extension

`ownedUpgrade(priorInputs, targetInputs)` first completes exact reinstall of the real prior selection in the same continuous ownership. Only then may it stage a distinct target. Existing immutable release admission, authorization validation, public-Kernel grants/planning, IPC activation, provider readiness, consumer synthetic calls and durable publication are reused. Upgrade transactions record the actual prior accepted release/revision and the next target revision; installation remains revision 0 to 1. Committed history is contiguous and unique independent of directory/UUID order. Aborted attempts must refer to a real committed prior, historical trust floors cannot run backward, and at most one unfinished transaction may extend the committed tip.

Accepted-selection replacement remains inside the original ACTIVATING to COMMITTED transaction. Uncertain rename/fsync/commit never causes rollback, replay, fabricated terminal success or automatic prior revival. Runtime is shut down before a successful foreground owned upgrade returns STOPPED. This is not a new live v1/v2 admin operation. Existing A1+B1 request EOF, unknown-selection/version separation, shared eight-connection cap and admission deadlines are preserved.

## Public foreground commands

From the repository with its qualified toolchain and host prerequisites:

```
PATH="$PWD/.tools/node/bin:$PATH"
node --experimental-vm-modules tools/g7-owned-cli.mjs exact-reinstall /absolute/private-cell /absolute/private-inputs.json
node --experimental-vm-modules tools/g7-owned-cli.mjs upgrade /absolute/private-cell /absolute/private-prior-inputs.json /absolute/private-target-inputs.json
```

Each private input object has exactly `archive`, `trust`, `authorization`. These are independently supplied inputs, not permissions extracted from the candidate archive. The root must be suitable for the actual from-inception lifecycle. These commands do not adopt an already stopped detached Cell or an earlier fenced owned run. The coordinator installs the original once, normally stops it, then the independent maintenance process reinstalls that SAME accepted Cell; the upgrade command subsequently advances that SAME Cell. Re-executing the command on retained supervision residue is denied.

## Fence and remaining implementation boundary

The supervision fence is never removed or repurposed. There is no ordinary-constructor loophole, restart permit, certified return to serving or post-crash ownership adoption. Successful foreground maintenance exits with `fence:RETAINED`; uncertainty remains fenced and may park until independent containment. This intentionally limits repeated lifecycle operation. A certified continuously owned successor/re-serving path and safe crash reconciliation/recovery remain engineering and qualification requirements, not a need for another owner approval.

Component fixtures are disposable test-signed candidates. They are not production distribution/signing evidence. Original accepted archives, inventories and final fault residues are retained under `evidence/g7/cross-process-reinstall`; target preparation must not replace original accepted bytes. Process crash tests do not establish physical power-loss qualification. Distinct-UID negatives, full crash-boundary coverage and parent review must not be inferred from same-UID process tests.

## G7 work still required

- Certified serving continuation/repeated owned maintenance and uncertain-crash reconciliation/recovery, including trusted prior recovery without reviving a revoked prior.
- Actual distributable assembly and complete SBOM/provenance/license/bootstrap qualification. `/home/herman/g7-bundle-inventory-preparation` is preparation only.
- Approved age/X25519 encrypted stopped-source backup/restore, stale/tampered/wrong-key negatives and preserved source.
- Independent online/disconnected two-host qualification against the actual immutable assembled bytes and network-denial evidence.
- Owner-controlled production signing, independent parent rerun/review/publication, and final owner acceptance.

No deployment, new dependencies/global installs, RAM/swap/services, production signing or protected licensing/archive changes, commits or pushes are part of this candidate.
