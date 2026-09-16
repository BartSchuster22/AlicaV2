# SDK compatibility and deprecation policy

The G5 supported SDK/testkit surface is frozen at **0.1.0**. Supporting public ACAP packages remain at their existing **0.0.0** artifacts; no registry publication is implied. The repository and artifacts remain private/UNLICENSED under the existing project policy.

## What is supported

- Exact root package exports and declarations in `api/plugin-sdk.d.ts` and `api/testkit.d.ts`.
- G1/G4 data, authorization, lifecycle, error and transport semantics; G5 does not redefine the frozen wire contracts.
- The tutorial's public-root imports and package-owned generated relative modules.
- The pinned Node/TypeScript toolchain qualified by this repository and the external build.

Deep imports, internal file layouts, undocumented class state, stack messages, test trace timing and private monorepo paths are not supported interfaces. Testkit permissions and diagnostics are not production policy formats.

## Change rules

1. Patch releases may fix implementations without removing an API, widening authority, altering a descriptor digest or changing documented error/lifecycle semantics.
2. Minor releases may add optional APIs without making existing callers supply new fields or silently enabling behavior. An optional feature is negotiated, not presumed.
3. Breaking changes require explicit owner approval, a migration document and a new major SDK/API line. Being pre-1.0 is **not** blanket permission to break this frozen surface.
4. A deprecation is documented in release notes and public declaration JSDoc, with a replacement example. Removal waits through at least two subsequent minor releases and the approved major boundary. Security exceptions require an explicit owner-approved notice; they are never silent.
5. No warning/logging change may print secrets, request/event values, raw exceptions or grant contents. Existing safe logging formats stay closed.
6. Core contract/policy changes still require the relevant normative gate; an SDK release cannot authorize them.

`node tools/check-sdk-api.mjs` rejects runtime export or declaration drift. `--update` is an explicit maintainer operation after compatibility review, never part of CI's acceptance path. Snapshots are necessary, not sufficient: behavioral regressions are guarded by SDK tests, real-host qualification, generated-code compilation and the external tutorial.

G5 freezes the candidate's surface; it does not claim npm registry distribution, third-party review, process isolation, a production secret manager, durable effects or exactly-once operations.
