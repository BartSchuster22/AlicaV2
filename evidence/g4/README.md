# G4 executed evidence

All results here were captured from actual executions, not synthesized examples.

- `execution.json`: tested implementation commit, UTC capture time, counts, clean-checkout state and gate limits.
- `working-check.log`: complete development-checkout `npm run check` output.
- `clean-bootstrap.log`, `clean-install.log`, `clean-check.log`: fresh independent clone, pinned bootstrap, `npm ci --ignore-scripts` and full checks.
- `clean-demo.log`: real retained Echo A/B runtime demo on the G4 implementation.
- `isolated-conformance.json`: machine report extracted from the successful clean-checkout run; public tarballs only, Kernel unavailable, generated client/typechecks and JSON boundary exercised.
- `artifact-sha256.json`: identical artifact SHA-256 values across development and independent clean checkouts, including built files, public schema copies and committed generated fixtures.

The isolated qualification also invokes the installed `node_modules/.bin/alicac` executable, not only `node <entrypoint>`. The provider is a separately implemented arithmetic/counting fixture, not the generated unimplemented scaffold. It is not a claim of a third-party security audit or OS sandbox.

The evidence names the implementation commit. Its evidence-only follow-up is checked again before push; the final pushed candidate is the commit whose GitHub `foundation` run the owner must confirm. Local execution does not establish private GitHub CI success, branch-protection enforcement, owner acceptance, production deployment or completion of G5/G6.
