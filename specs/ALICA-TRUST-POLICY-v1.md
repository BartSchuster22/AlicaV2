# ALICA-TRUST-POLICY-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Root and publisher model

`trust-policy.schema.json` defines policy version, Cell root key IDs, accepted publisher keys, allowed execution modes, expiry and maximum offline metadata age. Actual public keys are supplied in operator-controlled local trust records; policy key IDs are SHA-256 over raw public-key bytes. Root initialization is an explicit operator ceremony with out-of-band fingerprint verification. A bundle never introduces an automatically trusted key.

Ed25519 signs canonical bytes with domain separation. A detached signature envelope has algorithm=`ed25519`, keyId and base64 signature. `signature.schema.json` fixes the envelope. Base64 MUST decode to exactly 64 bytes and re-encode byte-identically; regex shape alone is not sufficient. Rotation behavior requires real cryptographic vectors before G3 verified-loader qualification. Verify algorithm, key length, signature, accepted publisher, policy expiration and artifact/contract digests before loading. Development keys are explicitly test-only and cannot satisfy production candidate policy.

Offline freshness is evaluated against trustworthy host time and separately cached operator-approved revocation metadata. The last verified metadata time and version cannot move backward. If time is untrusted, required metadata is missing/expired or age exceeds policy, activation fails closed. Running-instance expiry behavior is bounded quiesce/revoke at expiry, not indefinite continuation. Offline availability never justifies disabling signature, expiry or revocation checks.

Rotation requires authorization under the currently trusted root and the new root, with monotonic version and audit evidence. A lost/compromised root requires explicit offline recovery authorization, not accepting arbitrary replacement from the network. Threshold multi-party custody and remote update distribution remain deferred unless approved; Step 1 still requires tested bootstrap, rotation and fail-closed recovery behavior. Root keys, release keys and repository deploy keys are distinct roles.

## Signature domains and key records

Bundle bytes are signed under `ALICA-BUNDLE-v1\n`; trust policy bytes under `ALICA-TRUST-POLICY-v1\n`; root-rotation authorization under `ALICA-ROOT-ROTATION-v1\n`. Prefix ASCII bytes directly precede canonical JSON bytes, with no extra delimiter. Signatures from one domain are invalid in another. Trusted raw Ed25519 public keys are exactly 32 bytes; keyId is SHA-256 over those bytes. Operator trust records bind key ID to raw public key and publisher and are not obtained from unsigned plugin claims.

A root rotation record includes prior/new monotonic policy versions and both policy digests, signed in the rotation domain by both prior and new roots. Missing either signature is failure. Exact rotation record schema and cryptographic vectors are required before implementing that operation; unsigned development fixtures never qualify rotation. Revocation storage and enforcement are local-authoritative and cannot be reset by profile changes.
