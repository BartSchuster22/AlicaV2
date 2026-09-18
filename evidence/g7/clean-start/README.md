# Clean-start evidence index

Uncommitted component based on `59f5eef3bf792d89a7193d753df0a85158a9a62c`; NOT G7 acceptance. See `docs/g7/R1-CLEAN-START-EXECUTION.md` for results/failures/limits and `docs/g7/R1-CLEAN-START-CHECKPOINT.md` for the authority model. The separate admin decision brief is a draft, not approval.

## Primary receipts

- `full-check-corrected.log` / `.exit`: complete successful development `npm run check`; exact final source and frozen-file hashes before/after. Node suites 170, 160, 189; Python suites 193, 30, 11, 119. All passed. The final returned source is bound to this log, not merely an earlier targeted run.
- `targeted-final-candidate.log` / `.exit`: 35 real custody/supervision tests, zero failures/skips, before the whitespace-only stable-format correction; included again in the final 189-test G7 suite.
- `full-check.log` / `.exit`: retained FAILED first full attempt, stopped at formatting (no tests ran).
- `format-first-pass-g7-cell.mjs.txt`, `format-correction.diff`, `format-correction.log` / `.exit`: exact failing-format source and the subsequent whitespace-only correction/checks. Do not substitute the historical `.txt` for final source.
- `source-and-preservation-verification.json`, `verification-run.log`: assertions binding final local/development/full-log hashes and showing all out-of-allowlist prior files unchanged, zero removed, no G7 owner/supervisor left and no process-inspection permission errors.
- `before-local.json`, `before-development.log`, `after-development.log`: raw source/prior-evidence hash inventories; the after snapshot also records HEAD/status/process observations. Existing ignored build outputs are not a comprehensive filesystem snapshot.
- `transfer-allowlist.txt`: exact six source/test paths; no broad sync or delete.
- `return-final-source.json`, `return-final.exit`, `return-final-transfer.stderr.log`: final exact allowlisted return from development. Earlier `returned-source.json` / `return-transfer.stderr.log` preserve the first-format return.
- `local-transfer-input.json`: unformatted final-candidate local transfer-input bytes, captured after dispatch and before return. Not presented as the final tested hashes.
- `commands.jsonl`: exact timestamped SSH command/transfer receipts. The initial first-format return preceded the labeled return logger; its hashes/stderr are retained separately.
- `local-final-checks.log`: initial local diff/credential checks. `local-handoff-checks.log`: repeated checks after final documentation/evidence were written.
- `positive-initial.*`, `targeted-expanded.*`, `transfer-*`: intermediate raw outputs/exits retained without replacing current proof.
- `verification-script.py.txt`, `transfer-runner.py.txt`: local execution helper source retained for audit, not runtime imports or transferred implementation paths.
- `checkpoint-manifest.json`: SHA-256 inventory of final changed source, new checkpoint docs and this evidence directory, excluding only the manifest itself.

All logs retain raw subprocess stdout/stderr. An empty successful transfer log means tar/SSH emitted no text; its `.exit` is the receipt, not fabricated output. The first return had no separately saved exit file; successful extraction plus its hashes/stderr are intermediate evidence only. No prior worker/G6/failing evidence was overwritten or deleted. The separately observed monitor-wait clamp/timeout is described in the execution record; the actual full regression later exited zero.
