# ACAP-SECURITY-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Trust zones and grants

Trust zones: operator/host, Kernel, trusted in-process code, isolated local providers, untrusted input/artifacts. In-process plugin code can access process memory and OS privileges; ACAP grants are not a sandbox against malicious same-process code. Such code MUST NOT be described as untrusted/sandboxed. Isolated providers require OS-restricted identity, filesystem/network limits and no inherited secrets. Same-user processes without isolation do not provide a strong hostile-code boundary.

`grant.schema.json` expresses grantId, principal, scope, capability, exact permitted operations, issuedAtMs, expiresAtMs and revision. These are policy records, not bearer authorization just because the caller sends JSON. Kernel authenticates principal from its own context/IPC session, checks issuance authority, scope ancestry, operation membership, lifetime and current revocation revision. Wildcards and delegation are absent in v1. Grant validity is issuedAtMs <= now < expiresAtMs; expiry must be after issuance. Operator revocation increments authoritative revision; retained proxies and streams recheck it.

Profile requests are not grants. Policy is immutable to plugin code. Scope/authority propagation is constrained at every call; a provider receiving a request cannot impersonate caller authority on outbound calls. Outbound calls use its own principal unless a later explicit delegation contract is approved.

## Secrets and isolation

Secret identifiers are references, never values in manifests/profiles/locks. A grant must explicitly permit a declared secret reference; access is audited without value. Only local test secrets are used in Step 1. A returned secret cannot be erased from malicious trusted code; state this limitation. IPC providers receive only authorized per-call material, not a copy of all environment variables.

Malformed signatures, untrusted publishers, digest mismatches, stale metadata and trust overrides fail closed before code evaluation. Audit failure does not prevent emergency revocation. See trust policy for bootstrap/custody and threat model for host compromise limits.

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.
