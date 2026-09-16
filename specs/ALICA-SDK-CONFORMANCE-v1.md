# ALICA-SDK-CONFORMANCE-v1

Status: **PROPOSED NORMATIVE BASELINE — owner acceptance pending**.

MUST/MUST NOT are requirements; SHOULD permits only a recorded justified deviation. This document defines intended behavior, not a claim of implemented runtime enforcement. JSON Schemas and executable examples accompany this baseline. The owner approval gate precedes production Kernel implementation.

## Public surface and test levels

The SDK exposes definePlugin, owned provide/require/optional handles, typed events, effects, scoped secret references and structured logging. Consumer/provider generators use approved descriptors and produce deterministic files. Exported types cannot import Kernel implementation. No private monorepo path alias is a valid external SDK dependency.

Conformance levels are distinct: SCHEMA validates data, DESIGN runs illustrative reference rules, PROVIDER verifies real provider behavior, TRANSPORT verifies inproc/IPC equivalence, CELL verifies signed standalone/recovery operation. Passing SCHEMA/DESIGN does not imply PROVIDER/TRANSPORT/CELL. Reports name level, source revision, executed command, runtime, test identifiers and actual result. Mocks must state guarantees they do not enforce.

Required provider cases include substitution, contract negotiation, input/output validation, permission rejection, deadline/cancellation races, idempotency declarations, event visibility, lifecycle cleanup and revoked handles. Required transport cases additionally include identity spoofing, framing limits, slow receiver, disconnect and no replay. Required Cell cases include trust rejection, install no-op, disconnected install and clean-host restore.

An external tutorial starts from an empty directory and uses published/public package surfaces only. G5 must execute it outside the repository. A generated interface without a working independent provider is not conformance completion. Every negative test must prove the expected specific rejection; merely catching any exception is insufficient.

## G1 completion clauses

[ALICA-NORMATIVE-BASELINE-v1](ALICA-NORMATIVE-BASELINE-v1.md) resolves feature ranges, generations, lifecycle failure, secret/event grants, canonicalization, package digests and trust semantics. Its explicit completion clauses supersede conflicting earlier-draft wording.
