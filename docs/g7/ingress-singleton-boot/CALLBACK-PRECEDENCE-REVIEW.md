# Independent review: callback-error precedence

PASS for the narrowly scoped test-only change against 47bbdc4ca3c755848925d6a5814cd6a9c8ff475e.
Reviewed the complete test graph, exact unified diff, negative-control mutation,
unchanged production close state machine, commands, TAP and execution receipts.
All FINAL manifest hashes and published dependency pins independently verified.
Test SHA256: 5ecf4a9ce3c6f444f9e467c8634fddd3cd346c57f0c7ab11684c97975cd54eef.

The new test flushes the callback before advancing the mock clock and requires
original error identity/code. Revocation and pending-socket destruction are
checked before promise settlement. Late close/listening and an explicitly saved
cancelled timer cannot upgrade rejection or allow another boot/close request.
The only common mock change supplies a stable error identity. Production is
unchanged. No production defect is claimed; this closes a coverage caveat.

Recorded worker execution: focused TAP 1 PASS, 0 FAIL; sensitivity TAP 0 PASS,
1 expected strictEqual failure when only callback error identity is cloned.
Reviewer inspected and hash-verified these actual receipts; no reviewer rerun.
Both attempts consumed. Both cgroups independently observed absent.
Only the selected new case ran, not a fresh full-suite regression.

Limits: synthetic TLS/clock, not native, real expiry or live identity qualification.
Read-only mount observations are samples, not lifetime attestation. The enclosing
scratch tmpfs is rw: exclusive dedicated-scratch confinement is NOT certified.
Sampled CPU is not final usage. No full G7 acceptance or production authority.
No added dependencies, external licensed code, real credentials or protected data
in the selected test/review. All existing evidence and mixed tree are preserved.
