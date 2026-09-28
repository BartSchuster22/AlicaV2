# Finite offline regression matrix (pinned before product changes)

Baseline ALICA accepted94570dd322f07e2860016b89c1e81356cc8b65cc and MemoryV4 B6111107fa709826c0642651f7f256c0c7fe3116a. Inspect named scripts before execution. Run ALICA commands with Node24.21.0/npm11.19.0 as alica-dev in network-disabled qualification namespaces; isolated source/dependencies only. Source fixtures use temporary state and controlled fixture auth, never production env/config/DB.

| Obligation | Finite selector | Current result |
|---|---|---|
| Frozen build/type API | npm run build; npm run typecheck | build previously passed; typecheck NOT_RUN this continuation |
| Kernel/ACAP/SDK/Catalog public base | npm test | NOT_RUN; prior accepted170pass is baseline only |
| inherited dependency check | python3 -S tools/check-dependencies.py | NOT_RUN; inherited @alica/catalog exit1 remains EXPECTED INHERITED FAILURE, not green |
| unchanged Decision contract/provider/external | node --experimental-vm-modules --test --test-timeout=15000 services/decision/tests/contract/*.test.mjs services/decision/tests/provider/*.test.mjs services/decision/tests/external/*.test.mjs | NOT_RUN; prior54pass not new evidence |
| Decision offline packed fixtures | node services/decision/tools/external.mjs; same --continuation-fixture only | NOT_RUN; use accepted temporary HOME .npmrc offline/cache,120s bound, no original HOME authority |
| Frozen Foundation structure/semantics/public Host | node --experimental-vm-modules --test --test-timeout=15000 service-foundation/tests/*.test.mjs | NOT_RUN; no regenerating/re-admitting snapshots |
| Native Foundation no-container proof | python3 service-foundation/conformance/isolate.py | NOT_RUN; inspect root namespace launcher before run; fresh root only |
| MemoryV4 complete existing tests | selected isolated source copy: pytest -q tests (exact test-file manifest and dependencies pinned before invocation) | NOT_RUN; excludes no failures silently; no production main import/settings |
| New MemoryV4 shared domain/HTTP parity/authority/store/exchange | new finite tests under phase51 source including semantic roundtrip/fault matrix | NOT_IMPLEMENTED |
| ACAP minimal consumer/failures | new native harness public SDK/Host including restart, missing grant/map, forged identity, scope, unavailable Store, ambiguous create replay and cleanup | NOT_IMPLEMENTED |
| public source hygiene/purity | exact path git diff/source digest vs accepted frozen packages/service-foundation/services/decision; tools/check-secrets.py | frozen tracked packages/Foundation/Catalog diff already empty; final checks NOT_RUN |

Inherited whitespace and Catalog dependency limitations must be recorded verbatim if reobserved; do not repair frozen source. Original Phase1–4 refs/evidence remain immutable. Phase3 MOCK/public-only requirements covered by frozen public tests and source-purity evidence unless review identifies a specific still-applicable safe selector; historical controlled/protected proof launchers are NOT authorized regression commands. No live/provider/G7 grant replay, protected launcher/ledger/key access, package registry publishing or unrelated Hermes runtime regression. M10 provisional until M11 shared-domain behavior is executed. A new failing relevant test blocks qualification until fixed in authorized changed scope or explicitly classified with evidence, never omitted for a green count.
