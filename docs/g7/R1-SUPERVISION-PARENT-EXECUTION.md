# Parent supervision verification — corrected component passed

Parent-tested continuation of baseline 0b70b71f69f9548574d38d51937769499cdb5ff1. This is a bounded supervision source checkpoint, not standalone delivery or G7 acceptance. This record supersedes the worker handoff for current source/execution status.

The parent verified all eight worker source hashes, frozen schema/limit hashes, raw log hashes and before/after full-check hashes. The worker full log reported Node 170/160/161 and Python 193/30/11/119 passing. Parent independently reran all seven initial supervision/custody tests plus format/diff checks successfully. These results apply to the worker draft, not the subsequent correction.

## Reproduced defect and correction

Source review found that inherited-socket close/error callbacks could not terminate an owner blocked in synchronous IO when the supervisor died. A new actual regression blocked the owner in a named-FIFO open, obtained an OS pidfd, killed only the supervisor, and waited for owner death. The original source failed: the blocked owner survived. The test safely terminated that exact owner via its held pidfd on failure; this is test cleanup, not production death authority.

The native host bridge now checks actual SO_PEERCRED on the inherited socketpair against the current parent/UID, installs Linux PR_SET_PDEATHSIG(SIGKILL), and rechecks the parent to close the setup race. The owner invokes this before adopting custody or executing Cell operations. No caller-supplied PID or private Kernel API is used. This prevents reliance on an event-loop callback for parent-death delivery; it does not make uninterruptible Linux IO hard-real-time, undo an in-flight syscall, or prove descendant reap.

Pinned native rebuild succeeded. The first post-fix run observed prompt owner death but found the test expected live-flock CONFLICT after both processes had died. Corrected the test to expect the existing durable-residue FAILED_PRECONDITION rejection instead. The final regression passed: exact owner death observed by pidfd, no accepted selection, and takeover denied by residue. Neither residue nor a bare PID is death proof.

All failure/success logs are preserved. Renderings trim trailing whitespace only; where bytes change, a lossless raw base64 companion and SHA256 receipt are supplied. Native build/input/output evidence is included in the first post-fix log.

The corrected parent full regression exited 0: Node suites 170/160/162, Python suites 193/30/11/119, formatting and diff checks all passed. All eight current source/test hashes match both before and after execution. Frozen schemas and limits are unchanged. Raw execution output and final bindings are preserved as `evidence/g7/supervision/parent-full-check.log` and `parent-source-binding.json`, with lossless raw base64 where rendering normalized whitespace. The corrected native source, owner entrypoint and test were synchronized development-to-local after formatting. Historical worker evidence is retained separately and is not substituted for this corrected-source run.

## Still open

Both admin restrictions remain: required write-half-close is not explicit in frozen framing; unknown accepted selection cannot be represented truthfully in the frozen response. These cases fail closed; full admin conformance is not claimed. Status/stop only; restart, offline-mutation custody release, upgrade/reinstall/recovery, runtime assembly/SBOM, backup/restore and two-host qualification remain incomplete. Direct supervisor cleanup expiry is covered, but the prior in-process outer-cleanup timer expiry, full external verification expiry and distinct-UID negative test remain unqualified. Trusted development runtime only; no production signing or owner acceptance.
