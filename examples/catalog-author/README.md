# External Catalog author (C13–C14)

This standalone example is copied outside the monorepo by
`node tools/test-external-catalog.mjs` after `npm ci && npm run build`.
The runner packs public packages, installs them into the temporary author project,
and delivers a selected snapshot and its separately pinned digest. No Kernel package,
repository imports, Catalog source directory, provider registry, or server is installed.
Installation may require registry access for dependencies; snapshot consumption is local.

The example's `correspondence.mjs` is reusable build-time author tooling using only
public Catalog and ACAP exports. It deliberately does not add fields to PluginManifest.
Supply the existing manifest plus companion bindings:

```
{ role: 'provides' | 'requires' | 'optionalRequires',
  uri: 'acap://alica.io/example/echo@1', version: '1.0.0',
  identity: 'io.alica.example.echo', digest: 'sha256:...' }
```

Each declaration needs exactly one binding. The validator checks snapshot integrity
and expected pin, exact URI/version availability, URI and requested major, executable
identity and digest, actual provided descriptor bytes, and public ACAP negotiation of
requirements. Optional requirements are checked against the selected authoring snapshot
as well; optional runtime availability is unchanged. Uncatalogued declarations are
intentionally rejected by this example. This is not a general event-binding validator.

The pin must be obtained through a trusted distribution channel. A hash delivered by
an attacker with its snapshot is not authenticity. Namespace policy and this validator
do not establish domain ownership, authorize runtime permissions, or approve lifecycle
promotion. `trustVerified` remains false.

`verify.mjs` exercises positive correspondence and negative mutations, public ACAP
conformance, two independent Echo providers, the same provider-agnostic SDK consumer,
clean disposal and compatibility diff. Runtime grants come explicitly from the test
host, not from Catalog permissions. This is SDK_TESTKIT_NOT_PRODUCTION evidence;
the separate Phase1 `npm run test:external` retains production Kernel-load coverage.
The Echo contract stays experimental. Plugin version 7.2.0 is independent of contract
1.0.0 and Catalog release 0.1.0.

For a standalone author installation, install matching distributed @alica packages,
place `snapshot.json` and trusted `snapshot.digest` beside these files, and run
`npm test`. The repository runner automates package delivery without pretending that
unpublished package versions exist on a public npm registry. Set CATALOG_REPORT to
an output path to retain the actual execution report.
