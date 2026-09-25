# Restore input binding: selective consumer preparation

Source-reviewed UNEXECUTED WIP. This change adds an optional input digest to the ordinary supervisor/owner boundary. A supplied digest is checked against the same parsed input before startAccepted. Supplying it without an accepted selection is rejected by the supervisor. Existing calls remain unbound and backward compatible.

The restore producer/coordinator does not yet supply this value on this recovery branch: this is NOT end-to-end restore integration or acceptance. Producer/custody integration remains open.

Excluded: diagnostic durable writes, random UUIDs, changed inherited-root-FD lifetime, Cell changes, protected native changes. Existing custody and error paths are preserved, not newly qualified.

The added test source uses mocked imports and fixture hashing; it does not prove signatures, Kernel behavior, native ownership, supervisor forwarding, filesystem failures or real cleanup. Its process.exit sentinel is caught by the owner catch; observing exit-0 is not real clean-reap evidence. Six mutation-denial cases and two positive controls are source only. No tests were run for this candidate. Historical test results for different source bytes do not transfer.

Independent parent review covered the complete three-path patch, exported check interface and exact supervisor delta. Exact blob hashes, patch application and whitespace checks were verified; Python AST parsing is not runtime execution. No credentials, private keys, vendored code or new dependencies were found in the selected diff. No release or legal clearance implied.
