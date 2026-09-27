# Author a capability contract and consume it independently

Use the pinned Node 24.21.0 / npm 11.19.0 toolchain, then `npm ci && npm run build`.
The current packages are distributed by packing the checkout; do not assume these
versions are published on the public npm registry.

## Propose, review and select a contract

1. Read [namespace policy](../../catalog/governance/NAMESPACE.md) and select a
   permitted URI namespace. A namespace entry is policy, not proof of domain ownership.
2. Start from [Echo's definition](../../catalog/capabilities/core/echo/definition.json)
   and [executable descriptor](../../catalog/capabilities/core/echo/descriptor.json).
   Describe generic observable behavior, guarantees, errors and scope rather than a
   preferred provider. Use the existing bounded ACAP schema vocabulary.
3. Keep URI major, semantic contract version, executable identity and canonical
   descriptor digest consistent. Reference files relative to the Catalog root.
   Required capability dependencies must resolve in the selected release.
4. Submit the [proposal template](../../catalog/proposals/templates/proposal.json)
   with motivation and evidence under the [review process](../../catalog/governance/REVIEW.md).
   Candidate providers belong in evidence, never normative provider selectors.
5. Validate the proposal and selected release with the [CLI](CLI.md). Compare old
   and new roots before review. BREAKING requires the applicable major-version
   treatment; REVIEW_REQUIRED requires human review. Validation alone does not
   approve lifecycle promotion or grant runtime permission.

## Produce and consume an offline snapshot

From the repository root:

```sh
node packages/alicac/dist/index.js catalog validate
node packages/alicac/dist/index.js catalog list
node packages/alicac/dist/index.js catalog show acap://alica.io/example/echo@1
node packages/alicac/dist/index.js catalog snapshot --out snapshot.json
node packages/alicac/dist/index.js catalog validate --snapshot snapshot.json
```

`--out` refuses to replace an existing file. Obtain the snapshot's digest through
an independently trusted distribution channel; hashing alone cannot prove origin.
The snapshot is sufficient for local consumption without a Catalog server.

## Prove an external author and provider-neutral consumer

```sh
CATALOG_REPORT=/tmp/catalog-author-report.json node tools/test-external-catalog.mjs
```

This actually packs public packages, installs a separate temporary author project,
checks that Kernel is absent and private exports are inaccessible, creates two
identical snapshots, and runs the author outside the repository. Installation may
use registry access; snapshot consumption does not fetch references.

Read [the standalone example](../../examples/catalog-author/README.md). Its
`correspondence.mjs` validates a manifest plus exact companion bindings for
`provides`, `requires` and `optionalRequires`. All declarations must be mapped once;
URI/version, identity, digest, actual provided descriptor bytes and negotiated
required operations must match. The example deliberately rejects uncatalogued
capability declarations; it is not a general event-binding validator.

`provider.mjs` implements two neutral Echo providers. `consumer.mjs` stays unchanged
between them. `verify.mjs` runs public ACAP conformance, 13 negative correspondence
cases, calls both providers and verifies clean disposal. Runtime grants are supplied
explicitly by the test host. The report is SDK_TESTKIT_NOT_PRODUCTION and records
`trustVerified: false`; this is not production isolation or signing evidence.

The independent Phase1 Kernel/SDK regression remains `npm run test:external`.
Do not treat the testkit demonstration as a replacement for that regression.
