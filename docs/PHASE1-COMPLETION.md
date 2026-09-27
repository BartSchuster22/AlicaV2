# ALICA V2 Phase 1 — product acceptance and scope recovery

Owner directive: Phase 1 is Kernel + ACAP + SDK only. This report supersedes older G7/WP1–WP6 completion criteria as the active Phase 1 checklist; it does not rewrite historical gate results or waive protected-operation contracts. No Phase 2 work is authorized.

## Current assessment

Inspected DEV /home/alica-dev/AlicaV2 at source revision b74e1bffffaeb336f4e075239680a28535a409f9. Existing mixed G7 changes are preserved and excluded from this documentation commit. No changes in packages/, examples/ or specs/ were present after building/testing. No Kernel or other product source was changed for this acceptance.

| Requirement | Result | Actual acceptance evidence |
|---|---|---|
| P1 Kernel bootstrap | DONE | Real Kernel public bootstrap/shutdown in regression and external operator execution completed successfully. |
| P2 Plugin lifecycle | DONE | Discover/validate/activate/dispose; staged registration, cleanup and invalidation tests passed. External disposal DISPOSED, no failed disposers, no timeouts, restartRequired=false. |
| P3 PluginManifest v1 | DONE | Tutorial builds provider/consumer manifests; CLI validates packages; Kernel discovers them. Unknown/malformed manifest rejection exercised. |
| P4 Capability registry | DONE | Provider registration, resolution, deterministic selection, dependency activation and removal pass real Kernel tests. |
| P5 ACAP invocation | DONE | Separate operator invokes external provider via consumer/generated client: add(20,22)=42. Invalid input and post-disposal call rejected. |
| P6 Service context | DONE | Public SDK context provides/requires capabilities and controlled effects. Real Kernel denied access tests pass. |
| P7 Lifecycle/events | DONE | FIFO events, ownership, listener disposal and reverse cleanup exercised. |
| P8 Scopes/permissions | DONE | Scoped grants, revocation, child isolation and stale handle/context invalidation pass. |
| P9 SDK | DONE | External author installs packed public SDK/contracts without Kernel installed; builds/types/checks/packages plugin. Internal imports blocked. |
| P10 Reference plugin | DONE | Existing examples/sdk-tutorial trivial addition provider is packed and installed in separate operator project; actual public Kernel/ACAP path returns 42 and disposes cleanly. No Kernel modification. |

DONE is for the specified minimal Phase 1 behavior, not universal correctness, hostile-code containment, G7 operational acceptance or production readiness.

## Fresh execution (2026-09-27)

As alica-dev with repository .tools/node/bin on PATH, Node v24.21.0:
- Focused Kernel/SDK/contract runtime suite: 147 passed, 0 failed (initial inspection).
- npm run build: exit 0, rebuilt existing source.
- npm run test:external: exit 0. publicImportsOnly=true, authorProjectHasNoKernel=true, separateOperatorProject=true; deterministic generation and negative type check passed. Separate public Kernel operator reported result=42, DISPOSED, failedDisposers=[], timedOutResources=0, restartRequired=false.
- npm test after rebuild: 170 passed, 0 failed, 0 skipped.
- npm run typecheck: exit 0.
- npm run boundaries: exit 0, Public import boundaries passed.
- git diff/status for packages examples specs: empty.

Commands and genuine outputs are retained in the scope-recovery conversation. No fabricated receipt or reclassified historical qualification. The operator's synthetic trust keys are in-memory test keys, not production signing. Existing external test uses package installs; no new runner/framework was introduced.

## Contribution and scope disposition

Existing Kernel/ACAP/SDK and SDK tutorial directly deliver P1–P10. Recent license/provenance work has future distribution value, but did not close an additional current requirement. The latest G7 privilege/enclosure/collector work concerns qualification infrastructure, not a missing Phase 1 feature. Preserve it; do not continue it automatically.

Backlog:
- HARDENING: expanded isolation/hostile-plugin qualification, operational resource enforcement and outstanding G7 protected transaction work (original restrictions remain).
- TEST IMPROVEMENTS: custom collectors, extra diagnostic probes, broad framework refinement.
- DEVELOPER EXPERIENCE: simplify operator tutorial/trust ceremony if later requested; current external flow works.
- FUTURE ARCHITECTURE / RELEASE: standalone/offline deployment, broader SBOM/distribution closure, production backup/restore and signing. Preserve existing artifacts and unresolved results; do not claim completion.
- PHASE 2+: Hermes integration/adapter, MemoryV4 integration, Doghouse, MCP adapter, JEV, other harness and production-service integrations. No implementation authorized.
- OPTIMIZATION: optional performance/refactoring work with no current correctness blocker.

## Execution sequence and exit

Assessment found zero missing feature-implementation milestones. One closure milestone: record acceptance, commit only scope/report documentation, tag exact committed Phase 1 source, verify remote publication and freeze. Preserve dirty unrelated work; never blanket stage. No new runner, rewrite or optional polishing. All future changes must identify unfinished P1–P10 or a concrete correctness/security/regression blocker. After freeze, wait for explicit Phase 2 authorization.

## Non-blocking limitations

Phase 1 acceptance is the supported in-process path, on the pinned Node toolchain with experimental VM modules. It is not a claim of safe execution of arbitrary hostile JavaScript. SDK distribution is private; the external workflow needs registry/transitive dependency access, not an offline installer. Public-package and operator responsibilities remain distinct. Existing G6/G7 code remains preserved in repository history; its presence does not extend Phase 1 acceptance. Historical G7/WP gates and publication holds are not retroactively marked passed by this Phase 1 result.
