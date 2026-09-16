# G6 R2 design evidence

This directory records successful executions against the working R2 candidate before its receipt commit. `summary.json` hashes the actual proposed design/schema/model/tool inputs. Raw stdout/stderr and schema-case results are retained; runtimeQualification is false throughout.

- `full-check.log`: complete existing and revised check pipeline.
- `schema-check.json`: closed frame/lane and carrier metadata checks.
- `model-check.log`: abstract endpoint/scheduler model, not a native adapter.
- `carrier-probe.json`: actual disposable Linux Python FD-transfer/shared-state primitive; not the authenticated Node runtime or final seccomp policy.

Corrections during preparation: the first carrier prototype timed out because a stream prefix-reader discarded a seqpacket remainder; whole-packet reading fixed it. Schema checks also caught the nonconforming draft feature name `wire.context-channels`; R2 uses `wire.contexts`. The final model explicitly tests foreign-offer acknowledgement fencing and reservations for descriptors not yet consumed, including physical-session failure at the hard offer timeout.

The compiler download record is metadata-only; no compiler was installed or native bridge built. Source/platform capability probes do not constitute syscall-filter qualification. Frozen specifications, runtime packages, SDK API snapshots and current toolchain/package locks were verified unchanged. CI status and owner approval are not inferred from local checks. See docs/g6/QUALIFICATION.md for all outstanding implementation/exit evidence.
