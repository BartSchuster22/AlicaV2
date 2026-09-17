# R1 component execution results

Status: INCOMPLETE G7 IMPLEMENTATION; NOT ACCEPTED; no signable application candidate.

Executed on `alica-dev@167.233.135.142`, `/home/alica-dev/AlicaV2`, starting from HEAD `6c9530adace11fb235a52d838ac10bc1dbf22ae2` plus the explicit uncommitted files recorded in `source-files.json`. All npm commands used `export PATH="$PWD/.tools/node/bin:$PATH"`. Observed Node `v24.21.0`, npm `11.19.0`.

## Actual commands and outcomes

- `npx --no-install prettier --write` on the explicit new/changed JS files and package.json: succeeded; formatted bytes copied back to the local worktree.
- `npm run build && npm run typecheck && npm run test:g7-implementation`: exit 0 on the initial implementation; 37 new executable tests passed. Build and type checking also ran in each full check below. New `.mjs` tools are exercised by Node, not claimed covered by TypeScript checking.
- `npm run test:g7-implementation` after adversarial/CLI additions: exit 0; **41 passed, 0 failed, 0 skipped**. Raw output: `targeted-final.log`.
- Initial `npm run check`: exit 0. Raw output: `full-check.log`. Preserved rather than overwritten after the additional tests.
- Final `npm run check`: exit 0. Raw output: `full-check-final.log`. This includes all build/typecheck, formatting, public-import boundary, schema, secrets, dependency, isolated/external SDK, native build and existing runtime checks; **160 IPC tests passed with 0 failures/0 skips**; **57 G7 Node tests passed with 0 failures/0 skips** (including the 41 new tests); existing 11 bootstrap Python tests and 119 contract-model tests passed. Model success is not application runtime evidence.
- Local and remote `git diff --check`: exit 0.
- Explicit code/test/operator-document SHA-256 values on the remote match the local source record. Output: `remote-final-source.log`.
- `sha256sum` on the two parent-supplied age binaries matched the parent handoff. Output: `age-supplied-digests.log`. These hashes are not a separate independently anchored proof authentication.
- The binary transfer/extraction command to `.tools/g7-age-r1` returned tool status `pending_approval`, security rule `tirith:archive_extract`; it did not produce an executed transfer result. No age adapter run is claimed.

The five new SIGKILL cases kill real metadata writers and read surviving bytes from separate processes. They establish only those replacement boundaries; not Cell journal crash recovery, power-loss durability, supervised application reap, or backup/restore.

The reproduced Kernel admission mismatch is asserted as a rejection test, NOT relabeled a successful runtime activation. It returns `CONTRACT_MISMATCH` for the R1 release-wide bundle inventory through public `Host.discover`.

See `/home/herman/g7-implementation/docs/g7/R1-IMPLEMENTATION-CHECKPOINT.md` for the exact blocker, missing functionality, operator inspection command and eventual signing requirements. No commits/pushes, service installation, production signing, private custody reads, clock/floor resets or acceptance-host work were performed. Existing local approval edits, remote unrelated untracked evidence, and parent age handoff files remain intact.
