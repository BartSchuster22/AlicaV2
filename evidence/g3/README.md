# G3 executed evidence

- `working-check.log`: full executed engineering/runtime/design check output.
- `echo-demo.json`: first real provider substitution, resolver, inspection, audit and lifecycle run.
- `clean-bootstrap.log`, `clean-install.log`, `clean-check.log`: independent checkout setup and checks.
- `clean-demo.json`: a second real demo run in that independent checkout.
- `clean-checkout.json`: machine-derived provenance, test counts, gate limitations and implementation SHA.
- `artifact-sha256.json`: hashes of built files; working-tree and independent-checkout outputs compared equal.
- `*-stderr.log`: real Node experimental-VM warnings, deliberately retained rather than hidden.

The clean checkout was created with `git clone --no-hardlinks` from the implementation
commit into a separate directory. `.tools` and `node_modules` initially did not exist.
`tools/bootstrap.py`, `npm ci --ignore-scripts`, `npm run check`, the executable demo
and clean Git checks all completed there. This is the same supported Linux host,
not a claim of cross-platform or isolated-OS qualification. Generated UUIDs, audit
times and ephemeral synthetic signing keys differ between demo executions by design.
Build output hashes, rather than these dynamic demo values, establish reproducibility.

The following evidence-record commit changes only evidence/documentation. Its exact
HEAD is rechecked from the clean checkout before pushing. Evidence does not fabricate
remote CI: the agent's GitHub CLI is unauthenticated; the development account has no
GitHub CLI or GH_TOKEN/GITHUB_TOKEN. SSH Git access can push but cannot prove an Actions
result. Owner must confirm successful `foundation` for the final candidate SHA and
approve G3 before the gate is marked accepted. GitHub remains private.

No private signing keys, real secret values, production deployment or live service
integration are included. The demo uses ephemeral synthetic trust material only.
