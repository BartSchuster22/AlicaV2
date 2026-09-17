# Clean source-checkout receipt — component checkpoint only

Tested revision: `8bfd9a7fa7849392b72a315d8d0dbeed0bc9e33d`.
Target worktree: `/home/alica-dev/AlicaV2/.tools/g6-component-clean`.

A new detached git worktree was created from that commit. No existing package
`dist/` or node_modules were copied. The already pinned target `.tools` was
symlinked into the worktree; `npm ci --ignore-scripts --no-audit --no-fund`
installed 18 packages, then full `npm run check` exited 0. This is a clean
SOURCE checkout on the same qualified development host with shared toolchain
inputs, NOT a fresh-host installation, offline installation or release acceptance.
The only post-check untracked worktree entry is the explicit `.tools` symlink;
no tracked source changes were reported.

Results:
- 169 baseline JavaScript tests passed; zero failures.
- 193 specification tests: OK.
- 135 G6 frame-schema checks passed.
- 30 G6 design-model tests: OK.
- 48 native/wire/scheduler/reap-helper/boundary tests passed; zero failures.
- Build, typecheck, formatting, imports, secrets, reviewed dependencies,
  isolated conformance, SDK API and external publication checks passed.

Full log: `clean-check.log`.
SHA-256: `3a945c5b9880911c154d08194e89bfead361049cbc0c867e8d6fb231ada48137`.
The subsequent receipt commit changes evidence only, not tested implementation.

Native artifact hashes differ between the original and clean-worktree builds;
no bit-for-bit reproducible native artifact claim is made. Each native build
and its primitive tests passed at its recorded path. Investigate path/debug
metadata and deterministic packaging before later release reproducibility claims.

G6 remains INCOMPLETE. No integrated IPC SDK adapter or unchanged-consumer
transport-equivalence suite exists yet. Session helper compilation and native
primitive tests do not establish the full hostile PhysicalSession matrix.
The two protocol/SDK mapping gaps in docs/g6/SDK-INTEGRATION-GAPS.md remain
unresolved. No GitHub CI result or owner exit acceptance is inferred.
