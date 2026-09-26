# E2 coherent ownership builder candidate

Candidate against recovery46d893124d5982734165f06e37c0060b4aebec30. Not automatically published, installed, runtime-qualified or accepted.

`python3 tools/build-g7-native.py` preserves the historical development build: same flags, root working directory, inherited environment with the original .tools cache overrides, native/g7/build/ownership.node, overwriteable receipt.json and the original receipt fields/stdout. It does not require empty output or add map generation. The legacy body is AST-identical except function scoping and the shared streaming SHA helper (same digest). Importing this module no longer starts a compiler. Unknown arguments now receive argparse errors; compatibility here is specifically no-argument invocation, not arbitrary ignored legacy arguments.

`python3 tools/build-g7-native.py --output-directory EXISTING_EMPTY_DIRECTORY` selects the R5 fresh mode: pinned archive/executable, isolated environment/cache, bounded 64KiB compiler capture, unique bare ld.lld extraction for the exact output, pinned Zig linker prefix, map relink, unchanged ELF bytes and unchanged declared input hashes. Missing/non-directory/occupied output is rejected, not cleaned. Caller must provide confinement and exclusive ownership of the fresh directory; this is not a new general controller. Integrity and parser failure checks are explicit, including under Python -O. Compiler/map failures do not produce a success receipt.

Fresh receipts derive ownershipSha256 and recipeSha256 from actual declared input bytes. These hashes do not prove a Git revision, publication or custody. No hard-coded revision/current-unpublished claim remains. Both modes retain HOST-OWNERSHIP-ONLY.

## Compatibility evidence and limits

At recovery46d89312, package.json build:g7-native invokes the builder without arguments; test:g7-cell and test:g7-bootstrap depend on it. The three named run-destination-composition-dev.sh, run-restore-state-dev.sh and run-containment-dev.sh are absent from that published tree and untracked in the local mixed tree. Their existing noarg calls were read, not executed or changed. No historical native tests, Node/addon loading, smoke/fivecase/NULL/signing/production runs occurred.

Focused tests: `python3 -B tests/g7/test_build_g7_native.py -v` and the same command with `-O`. Nine cases each pass: noarg CLI at a fake subprocess boundary; import without compiler; explicit admission/pins/environment; unique/missing/duplicate/wrong/malformed parser outputs; byte-derived provenance; sameELF/input-change failures; bounded capture and compiler failure. All fake files are explicitly SYNTHETIC and never native evidence. One initial test-harness name collision with unittest.TestCase.run was corrected; its failed source/output remains retained. No product assertion was weakened.

## Actual fresh build

Exactly one actual integrated-candidate compilation and same-ELF relink succeeded under the reused R5 profile, service g7-e2-integration-build-r6, invocation55c6266bbfb34391b26e80e802bf4f5f. Published ownership source unchanged; all68 declared inputs independently match before/after/receipt. Compiler flags equal R5 modulo fresh paths. ELF/map/log/receipt hashes are in the operator result and authoritative on-disk receipt. Real source/tools/build-g7-native.py exactly equals this integration candidate; no synthetic boundary was present in that build.

Remote authoritative output: /run/g7-e2-integration-r6/out on DEV167.233.135.142. Exact local tested sources and outputs: /home/herman/g7-control/e2-integration-artifacts/. Enforcement/counters/cleanup and original-preservation evidence: /home/herman/g7-control/e2-first-receiver/integration-*. Read G7-SUSTAINABLE-E2-BUILDER-INTEGRATION-RESULT.md for artifact identities and accounting.

This closes only the coherent builder/ownership fresh-artifact slice. Three-role binding, native/runtime qualification, publication and owner acceptance remain separate.
