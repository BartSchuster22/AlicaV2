# Parent dependency handoff

The approved age archive and proof bytes were retrieved and match the R1 hashes. Official sigsum-verify v0.13.1 with built-in sigsum-generic-2025-1 policy verified the proof against upstream v1.3.2 SIGSUM.md keys. Exact trust-source caveat and dependency probes are in evidence/g7/age-parent-dependency-probes.json.

Parent follow-up: the same verified binaries are now available on the Ubuntu24 development host under `/home/alica-dev/AlicaV2/.tools/g7-age-r1/`; raw digests match and `age --version` returned `v1.3.2`. No Cell backup/restore test is implied.

Verified executables on Elio: /home/herman/g7-age-review/bin/age and age-keygen. No other upstream plugin executable was extracted or executed. Parent does not modify your Cell source. You may transfer these binaries to a development-only tool path on the Ubuntu24 dev host for real tests, checking the recorded raw digests. They are not production keys or a qualified Cell release.

CRITICAL actual behavior: failed truncated/tampered/appended streams emit partial plaintext before nonzero exit. Never write decrypted output directly to accepted state; privately stage, await clean exit and validate complete content before publication. Disposable-key probes passed; actual Cell backup/restore remains to be implemented/tested. Production X25519 private key remains untouched.
