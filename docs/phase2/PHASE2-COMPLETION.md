# Phase2 Catalog completion status

Status: M1–M4 implemented, tested and published; M5 documentation and exact-candidate
release acceptance pending. This is not yet the final completion or freeze claim.
Scope is [C1–C15](CHARTER.md), not historical G7 or Phase3 acceptance.

| Criterion | Delivered behavior and evidence                                                                | Status                                    |
| --------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- |
| C1        | Independent Catalog package uses public ACAP; no Kernel dependency or protected-source changes | PASS                                      |
| C2        | Schema-validatable definitions map to existing executable ACAP descriptors                     | PASS                                      |
| C3        | Namespace policy and local-reference enforcement                                               | PASS                                      |
| C4        | Explicit reviewed lifecycle transitions, no automatic promotion                                | PASS                                      |
| C5        | Independent Catalog, contract, ACAP, platform and plugin version axes                          | PASS                                      |
| C6        | Conservative compatibility classifications and review-required cases                           | PASS                                      |
| C7        | Semantic capability dependencies; selected required dependencies resolve                       | PASS                                      |
| C8        | Permission vocabulary without authority grants                                                 | PASS                                      |
| C9        | Proposal schema, review process and checked example artifacts                                  | PASS                                      |
| C10       | Deterministic checkout validation                                                              | PASS                                      |
| C11       | Reproducible lookup index                                                                      | PASS; final committed-index check pending |
| C12       | Immutable local snapshot consumption and integrity rejection                                   | PASS                                      |
| C13       | Separate external author, public APIs, no Kernel, manifest correspondence                      | PASS                                      |
| C14       | Neutral Echo, two conformant providers, unchanged consumer, clean disposal                     | PASS                                      |
| C15       | Docs, regressions, exact candidate, public discoverability and final freeze                    | PENDING                                   |

See [executed evidence](EVIDENCE.md) for actual revisions, test outcomes and pending
final acceptance. Test counts are supporting evidence, not substitutes for criteria.
[Architecture](ARCHITECTURE.md), [author guide](AUTHOR-GUIDE.md), [CLI](CLI.md),
[Catalog source](../../catalog/README.md) and [external example](../../examples/catalog-author/README.md)
provide the developer entry points.

## Limitations and explicit non-claims

- Echo is experimental; lifecycle validation does not confer production maturity.
- Snapshot hashes establish integrity against a trusted pin, not provenance.
  `trustVerified` is false; namespace policy is not proof of domain ownership.
- External Catalog runtime evidence is SDK_TESTKIT_NOT_PRODUCTION. Phase1's
  independent real Kernel-load regression remains distinct, not production
  hostile-code isolation qualification.
- Packages are packed from the checkout. Public npm distribution is not claimed;
  dependency installation may require network access.
- The companion manifest mapping covers capabilities, not a general event-binding
  system. It does not modify PluginManifest grammar or runtime protocol.
- Compatibility is deliberately conservative, not a proof of all behavioral
  equivalence. Ambiguous selected versions fail rather than being auto-selected.

## Freeze rule

Finish only the remaining C15 acceptance and publication, then verify the annotated
`phase2-catalog-v1.0.0` tag resolves to the accepted public candidate and STOP.
Keep Phase1 tag and Kernel/ACAP unchanged, preserve G7, and do not start Phase3,
integrations, infrastructure or optional hardening without separate authorization.
Optional future work: authenticated distribution, broader contract families,
general event correspondence and deeper production integration qualification.
These are backlog items, not reasons to reopen accepted Catalog milestones.
