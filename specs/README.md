# Normative specification set

Status: proposed, awaiting owner acceptance. Runtime implementation has not started.

- [ALICA-KERNEL-API-v1](ALICA-KERNEL-API-v1.md)
- [ACAP-CORE-v1](ACAP-CORE-v1.md)
- [ACAP-ERRORS-v1](ACAP-ERRORS-v1.md)
- [ACAP-EVENTS-v1](ACAP-EVENTS-v1.md)
- [ACAP-SCOPES-v1](ACAP-SCOPES-v1.md)
- [ACAP-SECURITY-v1](ACAP-SECURITY-v1.md)
- [ACAP-TRANSPORT-INPROC-v1](ACAP-TRANSPORT-INPROC-v1.md)
- [ACAP-TRANSPORT-IPC-v1](ACAP-TRANSPORT-IPC-v1.md)
- [ALICA-PLUGIN-MANIFEST-v1](ALICA-PLUGIN-MANIFEST-v1.md)
- [ALICA-BUNDLE-v1](ALICA-BUNDLE-v1.md)
- [ALICA-PROFILE-v1](ALICA-PROFILE-v1.md)
- [ALICA-TRUST-POLICY-v1](ALICA-TRUST-POLICY-v1.md)
- [ALICA-SDK-CONFORMANCE-v1](ALICA-SDK-CONFORMANCE-v1.md)

## Design validation

Run `python3 tests/design/test_specifications.py` on the development VPS. Uses its existing Python 3 and jsonschema 4.10.3; this is design tooling only, not a product runtime dependency. Tests are SCHEMA/DESIGN level, not runtime security or transport conformance. Schemas use JSON Schema 2020-12. No validator installation was needed.

Open exact-envelope issues are tracked in the review record. The core examples deliberately use test-only digests and keys; none constitutes a signed release.

## Completed G1 baseline and public surfaces

Read [normative completion clauses](ALICA-NORMATIVE-BASELINE-v1.md) first; these explicitly resolve the initial draft's ambiguities. [Public interfaces and dependency diagram](ALICA-PUBLIC-INTERFACES-v1.md) define provider and transport author surfaces.

The full current test command is `python3 -m unittest discover -s tests/design -p 'test_*.py' -v`; see `tests/design/README.md`. Root rotation record and cryptographic vectors are now included. Per-frame IPC schemas remain required before G6 implementation.
