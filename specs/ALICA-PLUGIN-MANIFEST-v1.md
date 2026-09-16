# ALICA-PLUGIN-MANIFEST-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Manifest semantics

`plugin.schema.json` defines data-only plugin metadata: plugin ID/version, publisher, execution mode, relative entrypoint, provided descriptor bindings, required capabilities, requested secret references. All mandatory declarations must be present; an empty list means none, not unrestricted permission. Provided binding includes capabilityId, version, descriptorDigest and relative descriptorPath. The descriptor document remains a separate immutable artifact. Resolution rejects declaration/content mismatches.

The manifest does not include its own package digest, avoiding circular hashes. A signed bundle inventory binds manifest, descriptors and code artifacts by path/length/digest. The loader verifies signature against operator policy, then verifies all bytes before interpreting code. Signature validity does not make a publisher trusted automatically.

Entrypoints and descriptor paths are relative slash-separated safe components, no `.`/`..`, absolute paths, backslashes or executable interpolation. Symlinks escaping staging and duplicate archive paths are rejected. Execution mode is `inproc` or `ipc`; mode selection is trust-policy-constrained, never a plugin escape hatch. Required capability requirements are checked before ACTIVE. Secret declarations request permission but do not grant it.
