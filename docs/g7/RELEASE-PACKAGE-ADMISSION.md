# Additive selected-package release admission follow-up

Baseline: `f84bf378329bd7a355fec9d827c38f170387eb28`. Existing R1 owner approval remains applicable. This is a bounded Kernel integration, not a complete Cell or G7 acceptance. Historical checkpoint/evidence and the original expected-rejection test remain intact.

## API and security boundary

The public Kernel exports `ReleasePackage` and adds:

```ts
host.discoverReleasePackage(input: ReleasePackage, scopeId?: string): string
```

The envelope contains:

- `packagePrefix`: exactly `plugins/<index.pluginId>/`, including the trailing slash;
- `indexText`: exact raw UTF-8 text of that prefix's `index.json`;
- `bundleText`: the full, unchanged release manifest, not a reconstructed package-only inventory;
- `profileText`: exact raw UTF-8 text of `profile/profile.json`;
- `signature`: the existing detached release signature;
- `files`: package-relative paths mapped to actual selected package bytes, excluding the index itself.

The return value is the normal verified instance ID. Scope checks, instance limits, duplicate identities, manifest/descriptor checks, resolution, execution-mode policy, activation, grants, importer allowlists and confinement stay on the existing Kernel paths. No public SDK plugin authority is added. `discover(SignedPackage)` continues to use the legacy flat inventory contract. It does not infer release semantics from malformed flat inputs or a new flag.

Kernel verification independently validates current trust freshness, the full manifest's Ed25519 signature in the unchanged `ALICA-BUNDLE-v1` domain, publisher/mode authority and revocation. It binds canonical profile digest to the manifest, raw profile bytes to the signed profile artifact, canonical package index digest/version/identity to the signed profile selection, and exact index raw bytes to `plugins/<id>/index.json`. It validates profile semantics and duplicate identities, signed path aliases/parent collisions, exact prefix-selected artifact membership and kinds. Every selected file is copied, checked against the package index and signed inventory, and retains the existing 1 MiB per-file and 16 MiB package-byte ceilings. The existing bounded JSON parser/schema limits also apply. No path is reopened for execution.

Release, canonical/raw profile, raw index and selected raw artifact digests are retained with the verified package so subsequent current-authority checks also reject their revocation; the existing canonical package digest and signer checks remain. No inspector-provided `verified` assertion or bypass flag is accepted as authority.

The Kernel receives only the selected package, profile and bounded manifest metadata. It authenticates the signature over the complete release manifest, but does NOT claim to have hashed unrelated runtime, other package, lock, SBOM or provenance bytes that it did not receive. Whole-archive byte verification and full layout/lock checks remain the independent Cell inspector's responsibility. The existing inspector is not replaced. Delivering a complete runtime and qualified dependency/provenance inventory remains Cell assembler work.

## Verification status

The parent completed the scoped development transfer. Build and TypeScript checks passed. The initial targeted run found the fixture attempted dependency planning before issuing required grants (86 passed, one rejected with PERMISSION_DENIED). The fixture now issues explicit bounded grants before planning; no authorization check was weakened. That rerun passed all 87 tests.

Parent review changed the callback-based admission helper to JavaScript runtime-private `#discoverVerified`, not TypeScript-only `private`. A new executable test confirms direct callback access is unavailable and a public shadow cannot intercept discovery. The hardened targeted suite passed **88 tests, zero failures/skips**, including real IPC calls through the unchanged compiled consumer and mutation of input buffers after admission.

A subsequent formatting check detected source style issues; these were corrected, and formatting now passes. The final full development regression, followed by another format check and `git diff --check`, completed successfully (exit 0) on the hardened source. See `evidence/g7/release-admission/parent-full-final.log`. All unsuccessful attempts are retained as evidence, not replaced by success logs.

Adversarial tests cover prefix/alias mismatches, exact raw and canonical bindings, file mutations, signature/domain/signer substitutions, signed malformed inventories, mixed releases, duplicate identities, authority revocation/expiry/clock rollback and resource bounds. Legacy flat positive behavior and release-wide rejection remain separately tested. These are public-admission/component tests, not standalone Cell installation or restoration.

## Remaining Cell work

Even successful execution of these tests would establish selected-package public integration only, not staged Cell activation. The earlier checkpoint's runtime-layout builder, dependency-complete SBOM/provenance, durable install/upgrade/recovery journal, writer lock, supervisor/admin channel, operator grant intent, accepted selection, stopped backup/restore and two-host qualification remain separate work. The parent-resolved age binary transfer is not reopened as a blocker. No production key access, signing, acceptance-host qualification, publication or G7 acceptance is part of this pass.
