# ALICA-BUNDLE-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Packaging and signature boundary

`bundle.schema.json` describes bundleId, format version, profileDigest and artifacts with path, SHA-256 digest, byte length and kind. No duplicate paths. The detached signature signs canonical bundle-manifest bytes with a domain prefix `ALICA-BUNDLE-v1\n`; the signature file is not included in its own signed inventory. Every executable, plugin manifest and contract descriptor must be bound by the inventory. Verify lengths/digests and reject extra executable artifacts. Archive extraction has bounded total size/count and rejects duplicate names, absolute paths, traversal and unsafe links before any activation.

Trust root is operator-pinned separately, not accepted because delivered in the archive. SBOM and provenance are themselves inventory-bound and describe real contents/source/build stages. An empty identity-only SBOM cannot satisfy dependency coverage. Detached signature encoding and key IDs follow trust policy; use standard vetted Ed25519 implementation, never custom crypto.

Offline bundles include the application runtime and all accepted application dependencies, schemas and verification material. The base OS and its declared prerequisites are a separate explicit qualification boundary. Application install and verification after disconnection require no package registry, transparency service or central ALICA endpoint. 'Offline' does not mean provisioning an unprepared blank machine unless that path is independently tested.

Install stages into a private directory, verifies, then atomically publishes accepted state. Failure leaves prior accepted state unchanged. Exact reinstall is non-mutating. Recovery reconstructs trusted state from verified artifact inventory and separately custodied identity/secret recovery data.
