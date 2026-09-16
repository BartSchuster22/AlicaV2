# G5 executed qualification

All results were captured from real executions. No fixtures or pass results were invented.

- `execution.json`: exact implementation commit, counts, clean-tree status and delivered kit digest.
- `clean-bootstrap.log`, `clean-install.log`: independent locked toolchain bootstrap and npm ci.
- `clean-check.log`: complete check pipeline, including existing G4 checks, SDK tests, API freeze and external tutorial.
- `external-conformance.json`: commands, public-only author build, contract checks and separately installed real-host execution.
- `artifact-sha256.json`: identical development/clean-checkout build, schema and public declaration hashes.
- `echo-demo.log`: retained Echo demonstration.

The evidence commit follows the implementation commit; it does not alter tested runtime code. Exact-candidate GitHub foundation success and owner acceptance remain separate requirements. The kit contains synthetic demonstration source, not actual signing keys or credentials. Mock limitations and the inproc boundary are documented in `docs/sdk/`.
