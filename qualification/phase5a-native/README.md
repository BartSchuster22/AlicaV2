# Designated-DEV native activation qualification

These are the exact sources executed for Phase5.A candidate qualification, not a portable installer or production login system. `read-probe.mjs` and `controls.mjs` target the candidate checkout `/home/alica-dev/AlicaV2-native-candidate` and the prequalified `/home/alica-dev/phase5i/memory-python-r2/bin/python`. No host fixture imports or placeholder provider registrations are used in the real composition.

Run using the delivered `native-run-read.py` orchestration helper from the evidence packet only under an active qualification grant. It creates a fresh private state copy and short-lived TLS material, mounts candidate/venv read-only in a private mount/network namespace, enables loopback, and executes these exact files as UID996 with no-new-privileges. It first executes controls, then the real HTTPS read/reconstruction suite, and preserves failure receipts. It never deploys a public service or publishes credentials. Reference inputs are a designated copy, not a fake Memory backend; test signing material is ephemeral.

`binding.mjs` is byte-identical to the prior qualified read binding. `signing.mjs` only constructs ordinary signed package/trust inputs for qualification. `controls.mjs` tests Host behavior with simple native callbacks and a synthetic inventory-only cache tree; these are not claimed as Memory operation results. `read-probe.mjs` uses the real Memory provider and Python domain implementation.

See `docs/sdk/NATIVE-ACTIVATION.md` for public operator APIs, trust model and non-production limits. Test artifacts, TLS keys and database copies are deliberately excluded from this repository.
