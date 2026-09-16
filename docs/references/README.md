# G0 reference index and provenance

## Owner sources

- [Original plan attachment](ALICA_V2_Kernel_ACAP_SDK_Step1_Building_Plan.original.md): preserved bytes; its appended initial directive is truncated.
- [Complete initial directive](ALICA_V2_Initial_Project_Directive.original.txt): preserved transcription of the replacement owner message; whitespace normalization is disclosed.
- [Source hashes/provenance](user-source-provenance.json): origin, capture boundaries and missing concept-document status.
- [Initiation assessment](../planning/ALICA_V2_Assessment_and_Step1_Building_Plan.md): assessment, not an owner-authored normative document.

## V1 distribution reference

- [Immutable source lock](v1-baseline.lock.json): pinned commit, URL, raw digest, size and actual verified retrieval timestamps. Original pass timestamps were absent and remain unknown.
- [Manifest snapshot](v1-manifest.reference.json): public reference metadata only; raw hash checked against pinned source.
- [Complete distribution inventory](v1-inventory.json): all manifest components; unknown owner/source/storage facts remain explicit.
- [Artifact index](v1-artifact-index.json): separates declared executable artifact digests from independently verified SBOM/provenance bytes.

No V1 executable, OCI image, runtime source module, secret or application data is imported. This is not a fresh certification of D6, a signature-chain verification, or a rebuild of private components. Public documentation references do not authorize modifying protected V1 systems or licensing evidence.

See [G0 decisions and contradictions](../decisions/G0-SCOPE-AND-INPUTS.md), [ADR register](../adr/README.md), and [G0 execution evidence](../../evidence/g0/execution.json).
