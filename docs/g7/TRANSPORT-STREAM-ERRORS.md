# Transport stream-error correction

Source-reviewed, UNEXECUTED WIP. Each transport gains exactly one stdout error listener routed to the existing failure handler. No other production behavior/API is intentionally changed. Parent read complete patch and independently verified exact one-line additions, source hashes and patch application.

Regression SOURCE loads actual modules with VM dependency mocks: backup/restore, stdout/stdin first failure, and feeder/close ordering. It requires original error identity, termination requests on the same mocked child, both close and feeder settlement, no success publication, retained partials and descriptor cleanup. No tests were executed. Standalone future command: node --experimental-vm-modules --test tests/g7/transport-stream-errors.mjs (requires separate execution authority). Existing real transport qualification suites unchanged.

This mock source cannot prove OS kill/reap, containment or deadlines. Existing fail can itself throw or re-enter if child.kill fails. Missing close/feed settlement can remain uncertain; timer does not establish bounded cleanup. Finally errors can mask earlier errors. None is silently certified by this listener correction.

Historical backup PASS remains on prior source bytes, not these modified modules; historical restore mismatch also remains. End-to-end producer integration, native admission and operational qualification remain open. No protected source, new dependencies, real secrets, native changes, security changes or grant renewals.
