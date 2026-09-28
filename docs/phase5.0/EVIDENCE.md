# Phase5.0 evidence — technically qualified release

## Current actual result (supersedes pre-integration status below)

Exact implementation commit `9b4ec08dac0bf41a3f6dec2e3905e788d86eb426` is publicly
pushed on phase5.0/service-foundation. Fresh anonymous HTTPS clone at
/home/alica-dev/AlicaV2-phase50-repro-9b4ec08d, no credential helper/global Git config,
started with clean status and that exact HEAD. Pinned Node24.21.0/npm11.19.0,
network-disabled npm ci --offline/build/typecheck passed. Its own source-root-aware
isolation launcher passed41/41,0skip plus separately installed author/noKernel,
unchanged consumer, manifest validation, actual experimental snapshot consumption,
permissions/health/normal persistence/SIGKILL completed-write recovery/cleanup.
Installed alica-service binary also passed both manifest/config validations,
correctly retaining EXECUTED:NOT_TESTED and backup/migration execution NOT_TESTED.

The native runner's generic `working-tree candidate` provenance string is not
itself a Git-origin assertion. PUBLIC-SOURCE-VERIFICATION.json records the actual
fresh public clone/commit/source comparison; public-reproduction-build.log and
public-reproduction-native.log are that clone's real execution, not copied WIP.
Technical43-file manifest digest (non-Markdown service/Catalog files plus normative
SEMANTICS.md): `beb6b945a5c4df5e5d74ed17130d786434d354e5e9117c4a3129561ed002f3cc`.
Original source/tag changes0;63added paths only in the three authorized roots.
The two generated Catalog schema copies remain excluded, not repaired/committed.

Actual existing Catalog reviewProposal/transition accepted the distinct parent's
exact reviewed artifacts and35-test historical implementation/log evidence, then
created a separate experimental snapshot:
`sha256:6d4f62849279bfa76ee781572ebf5e73ff0a0ebb6f2073b80f3030d4cbdfce26`.
Raw parent review and proposed originals are unchanged; trustVerified=false,
local namespace-role operation, not human-signed approval or Owner Acceptance.
Expanded41/41 pinned DEV and41/41 isolation passed after admission/examples.
Native slice6 raw SHA256 `f8201cada318ddfa99afd8246e8b01367b85e0846553760442850966012f4ce4`.

New inspected/offline regressions: foundation170/170, Catalog15/15,
Phase3 controlled-child/fixture17/17 (includes repeated imported topology tests;
NOT protected native Hermes/H12 replay). Phase4 inspected54/54 and both packed
fixture modes passed as detailed below. Build/typecheck/secrets PASS. Dependency
checker remains inheritedFAIL @alica/catalog; raw log retained. Frozen original
Phase1–4 public refs all matched; main remains a6a04b8e117f968bcca2d33763798c671a18725f.

Precommit git diff --check exited2 on a native-source trailing space and raw build
log EOF blank line. Commit did not occur in that failed command. Exact qualified
source/raw log bytes were preserved, then explicit commit succeeded; the whitespace
check is NOT called PASS. Two historical test titles use 'proposed records' and
'corrupt state fails open'; the former is descriptor-fixture provenance, the latter
means open() rejects corrupt state, NOT permissive fail-open behavior. Actual
expanded external proof consumes the admitted snapshot and startup errors are tested.

Independent parent technical review APPROVED scoped publication. Exact verbatim
FINAL-PARENT-REVIEW.md SHA256
3a87b65fb98d41cd8bafbc125254587cf836191944e1f064cbd9df0814b47a26.
PHASE5.0-COMPLETION.md declares technical release phase5.0-service-foundation-v1.0.0;
transport/tag/main readback is verified after push, not fabricated in this immutable
pre-push document. FROZEN-REFS.json is the actual pre-publication observation, not
a claim that the new technical tag can never exist. No Owner Acceptance, Phase5.1
or historical live authority use. Historical candidate statuses below are superseded
by this release declaration without rewriting raw evidence.

## Historical pre-integration ledger (retained, not current open-gate status)

This is a summary of actual worker tool executions, NOT a fabricated raw log.
No owner acceptance, final technical qualification, committed-public reproduction
or publication is claimed. Pinned qualification: DEV Node24.21.0/npm11.19.0.
Controller Node22 syntax checks are not qualification.

## Actual successful source candidate (slice5)

Source manifest: slice5-SHA256SUMS; SHA256
`d667aeace3450242290544919abe36af7d30b6d8c418f62d518a63162064026c`.
Pinned service tests35/35 PASS,0skip. Native isolation35/35 PASS,0skip.
Separately installed public packages, author without Kernel, unchanged consumer,
normal stop/start, health, permission denial and cleanup PASS. Actual SIGKILL child
followed by new operator recovered a previously completed write; NOT crash durability.
Actual isolated UID1000, no container executables/sockets, no nonloopback interfaces,
remote endpoint ENETUNREACH; zero container startup/image download/dependency.
Native-first design independence, NOT multiple deployment equivalence.

Raw re-executed native proof: evidence/native-slice5.log SHA256
`3f6ce56bed00172b14910186b4b5e6a7774df67857dc1933f724840b59c9720c`.
Consumer module SHA256
`a2468c853071caa88c69944a6013f79d466e69a5d01aa021db1bed0f838515c1`.
The Catalog record remained PROPOSED_NOT_ADMITTED in that exact historical run.

New admission/example/semantic-dependency-test slice is authored, NOT YET EXECUTED.
Do not substitute the35-test result for the expanded candidate. Final raw proof,
committed revision and public reproduction must be added only after actual runs.

## Offline regressions actually run

- Frozen foundation/Kernel/contracts/SDK:170PASS,0FAIL, network disabled.
- Frozen dependency checker:FAIL at @alica/catalog inherited local import-layer
  violation; unchanged, not repaired and not relabeled green.
- Inspected Phase4 contract/provider/external suite:54PASS,0FAIL,0skip, network disabled.
- Inspected frozen packed default fixture: initial300-second npm-install timeout.
  Only verified own installer terminated; fixture parent and temporary root removed.
- Approved correction: temporary HOME/.npmrc with offline=true, explicit existing
  cache=/home/alica-dev/.npm, fetch-retries=0; unchanged helper preserves HOME.
  Network-disabled default fixture then EXIT0, stage complete, unchanged consumer,
  public packed separate installs, clean resources, authenticatedLiveRequests0,
  syntheticPhysicalRequests5. Default fixture counter is NOT historical live budget.
- Same temporary environment, ONLY --continuation-fixture:EXIT0, stage complete,
  clean resources, unchanged consumer, authenticatedLiveRequests0,
  newAuthenticatedRequests0, syntheticPhysicalRequests4. Fixture synthetic budget
  consumed6/remaining0 is NOT renewed authority. Temporary HOME/fixture data removed.

No --live/--continue-live option, original key/ledger read, real provider request or
historical cleanup/reset occurred. Phase4 authority remains permanently6/6 CLOSED;
protected Phase3 authority remains closed. Further baseline regressions/source/ref
purity and committed-source reproduction remain final-candidate tasks.

## Failures retained without relabeling

1. Initial24tests8PASS16FAIL: reference schema path rejected config.schema.json;
   SDK payload null-prototype strict equality mismatch. Scoped corrections retested.
2.33tests29PASS4FAIL: missing ancestor grants in harness and incorrect expectation
   of clean cleanup after deliberately hung activation. Corrected harness only.
3.35tests32PASS3FAIL: duplicate visible provider identity across root/child gave
   legitimate CONFLICT. No Host change. Bootstrap registration retired via granted
   public call before native child attachment, then actual35/35PASS.
4. Normal source-transfer approval gates paused execution; never bypassed.
5. Phase4 frozen fixture installer timeout retained above even after corrected PASS.

## Authority and limits

Raw independent parent design review is preserved verbatim in the record proposal,
SHA2563bb846c7006b7ceb937c53c9191f6cc073dcf8703930c7952ead2d1ab7e45b79.
Not worker self-review, human signature, final review or Owner Acceptance. The
explicit existing local maintainer transition is separate and currently pending.
Catalog integrity remains trustVerified=false. Local signed shell does not attest
native code bytes. Native persistence is operator-owned; no hostile-code confinement.
Secrets are existing synthetic-test references only. Backup/migration declarations
may be VALID while execution remains NOT_TESTED. No future product implementation.
