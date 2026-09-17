# G7 online custody and initial trust ceremony

Status: owner-approved online software custody exists; encrypted off-server copy verified. Initial root signing is complete; both actual signatures were independently verified, including through the public Kernel bootstrap API. No G7 release or candidate acceptance is claimed.

## Approved simplification and residual risk

The owner rejected the offline/USB ceremony as excessive effort and approved server-held custody on ElioHermes1. Windows 7 is only the terminal/download endpoint, not the key-generation host. Both this endpoint and ElioHermes1 must nevertheless be trusted during passphrase entry.

The operator invoked custody creation under a dedicated non-login `alica-signer` account. Private keys are passphrase-encrypted PKCS8 files beneath `/srv/alica-custody`, with owner-only files/directories; a GPG-encrypted safety archive contains encrypted private-key files and public records. Recovery self-testing was reported by the operator. The agent independently checked account, permissions and archive hashes without reading private-key contents or decrypting anything.

An encrypted archive was sent via Telegram only after explicit owner approval of that transfer risk, then downloaded to the owner's Windows computer. The owner's certutil screenshot matched the server archive SHA-256 `0b8cc334dda207052b0a68e7980e2b05ada8c2cadb5e81de022a1e6cb4096a66`. This verifies the downloaded bytes, not a clean Cell restore. Keep the archive and unlocking passphrase separately. No private key, encrypted private-key archive or passphrase belongs in this repository.

`herman` already has broad sudo rights. The dedicated account prevents routine accidental access but is NOT a security boundary against an administrator or a compromised agent with administrator access. Encryption protects locked key files; it does not protect unlocked process memory against host compromise. No sudo/SSH policy was relaxed and no automatic signing service was installed.

## Approved public identities

Key IDs in normative ALICA records include the `sha256:` prefix. The custody setup displayed the same raw fingerprint without that prefix; these are not new keys.

| Role                     | Algorithm | Public key ID                                                             |
| ------------------------ | --------- | ------------------------------------------------------------------------- |
| Root                     | Ed25519   | `sha256:a1495a5dbcdf08ad844c5cc27e860b35e78d296cc751c440e6cb24109ef1e395` |
| Release                  | Ed25519   | `sha256:93ea41d456775cfea241ace10bb60eb4450313f1e14072ffe75cca7efca51df1` |
| Reserved backup recovery | X25519    | `sha256:6e99f07def51156e96deadc75b9c7c267f6fd4248d0a028d1fe64aed7e810389` |

The X25519 key is reserved for the separately reviewed application backup format. It is NOT automatic root-replacement authority, and generating it does not implement Cell backup/restore.

## Initial authorization implemented in this slice

`tools/g7-bootstrap-trust.py` is operator-side tooling, not a Cell runtime dependency or a general release signer. Its production entry point:

- Requires ElioHermes1, the `alica-signer` UID, owner-only custody paths, a real terminal, and the exact public root/release fingerprints above.
- Requires explicit `INITIALIZE` confirmation and hidden passphrase entry. No password argument, environment variable, chat entry or unattended signing endpoint is provided.
- Loads the existing root only after confirmation; generates no production keys and does not read/decrypt the release or recovery private key.
- Signs only the initial policy and initial revocation record, using existing canonical bytes and `ALICA-TRUST-POLICY-v1\n` / `ALICA-REVOCATION-v1\n` domains.
- Authorizes the release key for publisher `org.aquiero.alica`, **IPC mode only**. This does not issue runtime capability/secret/event grants or permit in-process fallback.
- Uses monotonic initial policy/revocation version 1. Policy nominal validity is 90 days; revocation validity and maximum offline metadata age are 7 days. Actual issue time is captured during owner execution, not invented during preparation.
- Atomically publishes public documents at `/srv/alica-custody/trust-bootstrap` with filesystem sync, exclusive locking and no-replace rename. Existing initialization and symlink substitution fail closed; failed staging is preserved for inspection.

IMPORTANT: the existing Kernel checks freshness of BOTH policy and revocation metadata. Therefore nominal 90-day policy validity does not permit 90 days of disconnected use. Both documents need approved renewal within the 7-day freshness boundary; renewal/versioning tooling and its profile-lock consequences still require implementation/review. Never rerun initialization to reset versions or freshness.

## Owner command — already completed; do not rerun

After the reviewed source has been installed root-owned/read-only at the path below, run in the `herman@ElioHermes1` PuTTY window:

```bash
sudo -u alica-signer /usr/bin/python3 -I /usr/local/libexec/alica-g7/bootstrap-trust.py
```

Read the public fingerprints and restrictions, type `INITIALIZE`, then enter the existing custody passphrase privately. Do not paste the passphrase in chat. If the command fails, preserve output and do not retry blindly. Success only means initial trust documents have been signed; it does not mean any release has been approved, installed or accepted.

An agent-safe `--preflight` checks public metadata only, without reading a private key or signing. `--test-fixture` generates ephemeral test-only keys and outputs only their public signed material; these fixtures must never substitute for production custody.

## Tests and remaining boundary

Python tests cover the normative canonical vectors, rejected values/duplicates/depth, wrong/test public records, file owner/type/modes/symlinks, distinct roles, signature domain separation, immutable initial publication and failure-before-publication. Node tests use the public Kernel bootstrap API—not private-module allowlist exceptions—to validate Python-generated Ed25519 signatures, canonical digests, tampering/root substitution, prohibited mode expansion, expiry, clock rollback and existing-state protection.

Development tests use the repository's existing hash-locked Python cryptography dependency. The operator helper uses the independently inspected host Python/cryptography installation; this is an explicit signer-host prerequisite, not an undeclared dependency of an offline Cell. Cell bootstrap verifier delivery and its trusted digest are still outstanding.

The completed ceremony and public-only Kernel verification are recorded in `evidence/g7/initial-trust.public.json` and its verification receipt. Bootstrap source a894246 passed exact-revision foundation CI run 35265226631.

Pending: root pinning on the acceptance environments; controlled metadata renewal; exact manifest/inventory-bound release signing; final journal/profile/restore contracts; signed candidate and complete offline bundle; full G7 install/adversarial/recovery qualification and exact-candidate CI/owner acceptance. The application candidate must not establish its own root merely by shipping a key.
