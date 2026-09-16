# Private G6 Linux OS bridge

Implementation under owner-approved ADR-013 R2. This component is **not an ACAP adapter or G6 qualification** by itself.

- `bridge.c`: owned close-once FDs, bounded socket I/O and atomic ancillary reception, kernel peer credentials, sealed memfds and pidfd supervision. Uses public Node-API only.
- `launcher.c`: private endpoint connection, sealed FD checks, parent-death handling, close-all-other-FDs, exact environment and pinned Node arguments. An early seccomp filter prevents io_uring creation **before** libuv initialization.
- `sandbox.c`: post-exec non-dumpability, no-new-privileges, bounded rlimits, Landlock ABI >= 3 read-only closure, and all-thread TSYNC syscall restrictions. Ancillary receive is limited to FD 6. No fallback if confinement fails; the dispatcher must terminate without loading provider code.
- `toolchain.lock.json`: approved checksum/length-pinned build-only compiler. `tools/build-g6-native.py` verifies it, builds without sudo, and writes source/header/compiler/artifact hashes into the ignored build receipt.

The full broker, approved frame validation, handshake and grant binding, lifecycle integration, and two-transport qualification remain implementation work. Native fixtures are **trusted synthetic test programs**, not signed ACAP providers. They may collect bounded native error diagnostics; production provider stderr must remain discarded/sanitized.

The native tests exercise actual launched PID credentials, sealed capsules, FD ownership, final Node confinement, two overlapping endpoint requests sharing state, and forced pidfd termination/reaping. Endpoint object identity must remain broker-owned; numeric descriptors must never become authority identifiers on the wire.

Startup fixes verified during development: the pinned Node rejects `--no-expose-wasm`, so the launcher uses the approved `--jitless` flag; startup io_uring must be prevented before the final filter; connected socket output uses `write()` and does not need a sendto exception. The final network/process denial was not weakened.
