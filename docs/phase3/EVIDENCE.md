# Phase3 evidence — M1 WIP / M2 candidate

ALICA frozen parent: 736b37d03c82ca057e7a397644037ef5d1bed991 (phase2-catalog-v1.0.0). Phase1: ab0273e8581fa70cbcf15c07f73e990b5dcc725e. External Hermes: c04e9a1d0dfa4abbefe4b256428e645abaacfe88. DEV: /home/alica-dev/AlicaV2-phase3, branch phase3/hermes. This file describes the tested candidate milestone; Git supplies its exact commit. It is not the final Phase3 release.

Previously executed upstream baseline: supported isolated PM installation and test environment, canonical scripts/run_tests.sh for registry/toolsets/skip_memory_store/tool_dispatch_helpers: 4 files, 88 tests passed. No full upstream qualification or real inference claim.

Current executed DEV commands, Node 24.21.0 / npm 11.19.0 from the pinned operator toolchain:

    npm ci --ignore-scripts --no-audit --no-fund
    npm run build
    npm test
    npm run test:catalog

Results: install/build exit0; foundation/kernel/contracts/SDK 170 passed, 0 failed; Catalog 15 passed, 0 failed. Not the full final H18 suite (external flows and other final checks remain). Build generated two untracked Catalog schema copies; do not blanket-stage them.

Parent-confirmed charter rsync completed exit0; only docs/phase3/CHARTER.md ownership corrected root:root → alica-dev:alica-dev, verified by stat. No other ownership changed.

Parent executed the original exact topology-test transfer exit0. Corrected ownership ONLY integrations/hermes/tests/topology.test.mjs. Real DEV command `node --experimental-vm-modules --test integrations/hermes/tests/topology.test.mjs` using pinned Node: 4 passed, 0 failed, exit0. These prove four direct-injection constraints, NOT public-topology impossibility.

Parent confirmed the EXACT batched rsync exited0; it was NOT repeated. Ownership corrected only transferred files and the needed transferred Phase3 directories. Initial DEV execution returned 5 pass / 2 fail: optional dependency incorrectly called require(), and a strict prototype comparison rejected ACAP's null-prototype record. Corrected test calls/assertions on DEV; no foundation change. Rerun: 7 pass / 0 fail, including all four modified topology-fixture tests.

Public event/effect topology is viable. ARCHITECTURE.md records the minimal selected candidate. Actual adapter-local provider bridge and effect-owned request-scoped subprocess runner now implement correlation, source instance/scope/generation checks, sequence rejection, one-flight admission, caller metadata propagation, deadlines, cancellation, bounded output and TERM/KILL cleanup. No Hermes execution is claimed by a synthetic callback or controlled child.

Executed on authoritative DEV with `/home/alica-dev/.local/share/alica/toolchains/node-v24.21.0-linux-x64/bin/node`:

    node --experimental-vm-modules --test integrations/hermes/tests/lifecycle.test.mjs integrations/hermes/tests/event-bridge.test.mjs catalog/proposals/agent-execution/reference.test.mjs

Result: 17 pass, 0 fail, exit0. These are 13 distinct tests: four topology tests run once per importing file. Coverage includes actual controlled subprocess success/crash/malformed/overflow, denied call, foreign event identity rejection, cancellation, deadline, single-flight, in-flight shutdown, stale handle, missing executable and TERM-resistant child escalation. This is topology/lifecycle evidence, NOT H12, full H8-H17 qualification, or independent review.

Fresh regression 2026-09-27T18:58Z: `npm test` 170/170 pass, `npm run test:catalog` 15/15 pass, `npm run secrets` pass. Tracked frozen packages/catalog snapshot diff against frozen Phase2 is empty. Prior generated schema copies remain untracked and excluded. Full H18 external flows/upstream final rerun still pending.

Review-ready exact paths and SHA256 are in REVIEW-REQUEST.md. No independent reviewer identity/result, admission, maturity promotion or namespace extension is fabricated.

Owner authorizes Codex, with gpt-5.6 illustrative; maximum 3 inference requests total, 1024 output tokens/request, 120 seconds/task, one task at a time, retries/fallback disabled. Read-only official Codex model catalog GET returned HTTP200 using existing local safe auth reference `/home/herman/.hermes/auth.json` → providers/openai-codex/tokens/access_token; no token printed, refreshed or copied. Raw visible IDs: gpt-6-astra, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5. Exact gpt-5.6 was NOT returned. No automatic substitution or inference call made. Pinned upstream explicitly supports max_output_tokens and timeout forwarding in agent/codex_responses_adapter.py; this is source evidence, NOT proven end-to-end cap enforcement. No auth files at the checked DEV `/home/alica-dev` or `/root` .hermes/auth.json or .codex/auth.json locations. Dedicated DEV safe credential reference is not yet established; do not forward tokens or copy a live profile by implication.

No live-success claim. No frozen foundation edits, service changes, cron or MemoryV4 sync under the inherited lock. Milestone publication must include only the enumerated Phase3 files. No final release tag or acceptance is claimed.
