# Release evidence format and signed-candidate design

Design only; no release orchestration or signing private key is introduced in G2.

Each future candidate evidence record contains schemaVersion, sourceCommit, dirty=false, toolchainLockDigest, dependencyLockDigests, target OS/architecture, commands with exit codes, input/output artifact SHA256 digests, UTC execution time, executor identity, explicit skipped/blocked checks, SBOM/provenance digests and gate acceptance status. A PASS must not mask a missing required check. The G2 execution record is development evidence, not a signed release.

A candidate package inventory follows G1 package/bundle schemas. Canonical inventory bytes are signed with the specified Ed25519 domain prefix; signatures are detached, and the operator root is provisioned separately. Release-signing keys, GitHub deploy keys and runtime Cell keys remain separate roles. Keep release keys outside the repository/build workspace; initial release signing requires explicit owner custody approval, not automatic Actions write/token permissions.

Future release qualification must validate clean provenance, declared SBOM coverage, artifact/descriptor hashes, trust/revocation freshness, recovery and the online/disconnected matrix. Do not add a registry, remote signing service, deployment database or large release framework in G2.
