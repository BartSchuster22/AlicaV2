# Synthetic collector regression

From the repository root, under externally admitted resource/isolation bounds:

    node --no-global-search-paths tests/g7/collector-regression.test.mjs

This executes eight serial synthetic groups. The test reads the exact sibling
operational-preactivation.mjs, verifies its SHA256, and extracts only capture().
It does not import/execute that driver, spawn a child, load a fixture, sign, or
invoke native/runtime work. Injected child/timers and real Readable asynchronous
destruction test collector behavior; awaited call-site checks are static only.
This is not real process crash/reap or full operational acceptance.

The driver is artifact-specific WIP: its original historical archive/inventory
hashes, capture implementation and call sites are deliberately retained. It is
not qualified against current source/artifacts. Do not run the whole driver as
a collector test or infer current-source operational acceptance from this suite.

Parent-reviewed repair keeps pipe error handlers until close after destroy().
The existing assertions cover late stream errors, combined 65536-byte capture,
overflow-before-copy, UTF8/marker splits, exit/status/boundary semantics, first
cause, one absolute 5000ms cleanup, single settlement and listener drainage.
No generic helper extraction or weakened assertions were introduced.

Actual E1 evidence: prior original 7/8 (late-error failure), sealed candidate 8/8;
integrated sibling layout 8/8, zero failures, exit 0 under final E1 systemd Node
profile (alica-dev, no capabilities, readonly sources, isolated fresh output).
Integrated raw: 3987 bytes, SHA256
717d9ccc503e95b58a3411472da25047495e1f86659b06655af8e3c7a2d79c03.
Driver: 11186 bytes, SHA256
 ebe2935deaec15d42fa3766f9e1026f0ad0c1d452a76d38a51fcd1cfc8377a8f.
Integrated test: 7866 bytes, SHA256
 df54c0d7fd1ab64e5ca0cddbc030e8202fd6d2612c2644611da580c252e502b0.

Custody evidence (outside the repository):
- /var/lib/g7-e1-receiver/{baseline,green,final}: prior red/green and sealed pair.
- /var/lib/g7-e1-integration-receiver/green: exact admitted command, manager exit,
  raw output/hash, live cgroup bounds/membership and cleanup readback.
- /home/herman/g7-control/G7-SUSTAINABLE-E1-INTEGRATION-RESULT.md: integration
  identities, reservation/preservation and parent-publication handback.
These local custody paths are evidence references, not portable dependencies.
