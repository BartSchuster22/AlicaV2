# G7 lifecycle continuation — development execution

Baseline: `0ccc6048660cc3f3330588c2e979a37a7edc763e`. Uncommitted handoff for independent parent review/publication, not G7 acceptance. Scope/architecture/remaining requirements are in `R1-LIFECYCLE-COMPLETION-CHECKPOINT.md`.

## Real execution

Development checkout: `alica-dev@167.233.135.142:/home/alica-dev/AlicaV2`, existing pinned toolchain, `PATH="$PWD/.tools/node/bin:$PATH"`. No toolchain/dependency installation or RAM/swap/service change.

- Focused: `node --experimental-vm-modules --test tests/g7/exact-reinstall.test.mjs tests/g7/cell-activation.test.mjs` — exit 0; **31/31** passed, zero failures/cancellations/skips. Includes 19 new exact-reinstall tests and 12 unchanged activation tests.
- Full: `npm run check` — exit 0; Node **170/170**, **160/160**, **228/228**; Python **193/193**, **30/30**, **11/11**, **121/121**. No Node failures/cancellations/skips. Original toolchain, format, build, type, schema, boundary, secret/dependency, isolated/external SDK, G6/native and G7 chains completed. A1+B1 regressions remain included and passing.
- Formatting used only the explicit two-file source allowlist. `git diff --check` passed locally; remote final checks are retained separately.
- The initial focused run and full run both passed; there is no suppressed failed test run. A discovery-only `git | python3` command was rejected by the local tool security scanner before execution (pipe-to-interpreter heuristic); direct file discovery/reads were used instead. This was not a test or remote execution failure.

Raw output under `evidence/g7/lifecycle-completion/`:

- `focused.log`: SHA-256 `94ee0e043e5e9890681f340d4ff4b04f8297d6964633b9cdc8e6cb680ce6d715`
- `full-check.log`: SHA-256 `91cdc39b64469779d2510cf7333140148ee6b7ef342abbc9631c5ffce2543ea0`
- Matching `.exit` files and exact remote commands/timestamps in `commands.jsonl`.
- 36 returned before/after Cell receipts: 18 from focused execution and 18 from full execution. Each pair is identical, covering raw file hashes/lengths, inode identities, modes and modification times, including journals and both high-water files. The close/reopen denial test is in both raw logs but does not emit a separate receipt. These are disposable test Cells, not custody/production state or acceptance-host fixtures.

## Tested bytes and preservation

Final formatted source hashes, present both before and after the full check:

- `tools/g7-cell.mjs`: `3bcfd00e59943e6516aa54c9ea3d9a983fc6963c55a1c427b60d1787af6f46dc`
- `tests/g7/exact-reinstall.test.mjs`: `c0e7fd138b40458dff84b76711f5d7c19d033c207be9380541db38027ceb2909`

`return-tested.tar` contains exactly these two formatted source files and was returned to the local working tree. Its SHA-256 is `fb692a5f1ed209d833c865d4d540103ab572d5fdc697f200a96b095414ca5a0d`. `source-input.tar` preserves pre-format transfer bytes; it is not substituted for final tested source. The two new documentation records were added after the full code check and contain no runtime/schema changes.

`local-before.json` and `remote-before.json` were collected before source edits/transfers. Preservation scope is all Git-listed tracked/untracked regular files plus recursive docs/evidence regular files (including ignored protected evidence); the new lifecycle evidence directory is excluded to avoid self-reference. Ignored toolchain/build directories outside docs/evidence are not represented as a whole-filesystem forensic snapshot. No claim of hashing every system file is made.

`source-and-preservation-verification.json` and `local-verification.log` record the final comparison: original files outside the two-file source allowlist preserved, local/remote final source and new-doc hashes identical, both full-run hash blocks agree with the returned source, and all returned process receipts match the remote manifest. `verify.py.txt` reproduces those checks. The original schema, limits, approvals, historical parent reviews, manifest-bound evidence and protected unrelated G6/admin evidence are not rewritten. Final evidence is bound by `evidence-manifest.json`.

No accepted replacement transaction was added. This checkpoint's actual new capability is the same-owner stopped exact reinstall no-op, with full current validation before any transaction and no original high-water rewrite. It is not generic offline custody transfer, production upgrade/recovery, standalone assembly, encrypted restore or completion of G7. The parent must independently verify and continue the remaining scope. No commits/pushes, production signing/key access, deployment changes, extra workers/agents/cron, licensing changes or G8 work.
