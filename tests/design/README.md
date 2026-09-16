# G1 schema/design validation

Run from repository root on the dedicated VPS:

```sh
python3 -m unittest discover -s tests/design -p 'test_*.py' -v
```

Existing tooling used: Python 3, jsonschema (Draft 2020-12), cryptography and OpenSSL. No production runtime dependency or additional installation is introduced. Tests intentionally live under tests/design and do not supply a Kernel or SDK.

`test_specifications.py`: original closed-schema and value checks, resolution and scope/lifecycle design examples.
`test_g1_completion.py`: semantic schema checks, optional negotiation, binding/generation authority, complete lifecycle transition examples, root rotation, offline freshness and canonical vector verification.

`specs/vectors/canonical.json`: literal-byte anchors plus two independently authored Python canonicalizers. OpenSSL independently verifies digest outputs. This is **independent implementation**, not cross-language encoding verification. Cross-language compatibility remains required before release. Ed25519 ephemeral keys stay in process memory; temporary files contain only public keys, messages and signatures. No signing private key is serialized or committed.

The fixtures contain synthetic identifiers and placeholder package digests. They validate public shape/semantics, not installability. Tests are not production parsers, a complete policy engine, real transport equivalence or an independent security audit. Model tests explicitly do not claim to prove concurrency enforcement or contain uncooperative same-process code.
