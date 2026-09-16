# ALICA-PROFILE-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Composition

`profile.schema.json` contains profileId, version, plugin selections and optional explicit provider pins. Selections bind exact plugin version and package digest. No environment variable interpolation, secret value, Cell identity or trust-root override is permitted. Unknown keys are rejected. Runtime operational paths and local credentials are supplied separately.

A resolution lock records profileDigest, plugin artifact bindings and chosen capability/provider/version/descriptorDigest. Lock generation is deterministic for the same accepted catalog/policy inputs; it MUST include a digest of the applicable immutable policy, not secret values. Reordering the input catalog cannot change selections. The lock schema is `resolution-lock.schema.json`; CLI presentation is non-normative and must preserve these fields.

An explicit provider pin that is absent/incompatible/denied fails; no silent fallback. A profile's permission requests are constrained by operator trust policy and scope/grant authorization. Accepted profile/lock bytes must match online and offline qualification hosts; generated Cell identity and local paths intentionally differ.

Lock plugin entries are sorted by plugin ID ascending; bindings by scope, consumer ID and capability ID ascending. Duplicate plugin IDs or duplicate (scope, consumer, capability) bindings are rejected. All binding providers and consumers must exist in the locked plugin set, and provider artifact/version must match its plugin entry. Scoped instance generation is runtime state and is not included in portable lock bytes. Lock scope IDs are profile-local logical scope names instantiated beneath the local Cell root.

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.
