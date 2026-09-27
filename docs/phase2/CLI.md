# Catalog CLI and offline releases

After the pinned toolchain setup, run `npm ci && npm run build` in a clean checkout.
`npm run alicac -- catalog validate` is the one-command source validation.
The catalog.yaml file uses JSON, a YAML subset, deliberately without a YAML parser.

```
npm run alicac -- catalog list
npm run alicac -- catalog show acap://alica.io/example/echo@1
npm run alicac -- catalog diff old-catalog-root new-catalog-root
npm run alicac -- catalog index --out catalog/generated/index.json
npm run alicac -- catalog snapshot --out snapshot.json
npm run alicac -- catalog validate --snapshot snapshot.json
npm run alicac -- catalog list --snapshot snapshot.json
npm run alicac -- catalog proposal validate catalog/proposals/echo-reference.json
```

All results are canonical JSON; errors return exit 1 and a stable error code.
`--root` selects a source root; default is `catalog`. `--out` creates a new file,
never overwrites a snapshot. Omit it to emit canonical JSON only. The index schema
is catalog/schemas/capability-index.schema.json. Definitions, not generated files,
remain authoritative. Entries sort by URI then version text; this is deterministic
ordering, NOT a semver preference or a selection of latest version.

Diff accepts two source roots with at most one selected version of each URI in
each release manifest. Multiple historical versions of a URI fail explicitly with
AMBIGUOUS_DIFF_VERSION. Make separate local release manifests selecting the exact
versions to compare; there is no implicit first/latest version selection. Removed
URIs are BREAKING, additions BACKWARD_COMPATIBLE; bounded contract comparison can
return REVIEW_REQUIRED. Classification is a report (exit 0), not release approval.
`show` returns all versions of the exact URI, never silently selecting one.

Public JS APIs: @alica/catalog, @alica/catalog/governance,
@alica/catalog/release (loadCatalog/createIndex/createSnapshot/consumeSnapshot),
and @alica/catalog/cli (catalogMain). The CLI entry has a TypeScript declaration.
The remaining JS APIs expose validated, frozen contract objects at runtime.

Snapshots embed definitions, executable ACAP descriptors and their payload schemas,
event descriptors, namespace policy, index and compatibility-rule identifier.
Consumption is synchronous and local: no resolver, server or network fetch is used.
Unresolved/nonlocal references, altered content, inconsistent indexes and unsupported
compatibility metadata fail. The snapshot digest detects alteration against a known
digest; an attacker can recompute hashes. Neither hashes nor namespace policy prove
authorship. Pin a digest from a trusted distribution channel. trustVerified is false.
Catalog validation cannot promote lifecycle state or grant Kernel permissions.
