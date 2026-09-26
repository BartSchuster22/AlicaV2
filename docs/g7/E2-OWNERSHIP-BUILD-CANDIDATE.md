# E2 ownership: fresh build and same-ELF map relink PASS

Status: tested candidate, NOT integrated default builder, native/runtime qualification, three-role binding, release or G7 acceptance.

A fresh ordinary build of published ownership source f19c65e61cb3b437526f618eaa4b5465fa3e00437e46a5d9e1fe87fd39a99a8d at recovery a1a6a4fd015128e850b0dadaa915d376f2d8a9d3 succeeded under a confined development service. No native binary was loaded. Candidate build-recipe SHA256:4958a0f0d5f9c3ea0b367e92749b982c5db61b66edc70208f74f799192324b9a. Adjacent candidate.patch is the exact tested recipe diff; it is not automatically applied.

| Artifact | SHA256 |
|---|---|
| ownership.node | 7947096469cc06450e0fd8c6b4070c93443c9b657004e5e221a49432801c20fb |
| ownership.node.map | 81676ef41c4a4d822afcf9a43b49ae544bc006c3c43dae56d8204a5ca8987ffd |
| receipt.json | 50e5422ea06da3b1e42f3a6aff8cc95da8d392ff21725620057dfd540641e335 |
| compiler.log | c729fb3a21b8062dbda538127ecd7d231782618d47b512407c177681edf1267d |

Compiler and map relink succeeded. Executed same-ELF assertion passed; all 68 declared inputs unchanged. Parent independently recomputed artifact hashes against the receipt and recipe digest against its input record. Structural ELF inspection is not runtime proof. Failed predecessor attempts remain retained; no historical binary substituted.

Enclosing remote workload: child56/control8 tasks, child1536/control512MiB, original CPU/wall/file/FD limits and readonly/no-network/unprivileged controls retained. Child/control cumulative pids/memory limit-event counters showed no limit events. Cleanup verified both workload groups and all observed processes absent. No whole-host/global enforcement claim.

## Integration boundary
The candidate requires --output-directory pointing to a fresh empty directory. Existing development test scripts call tools/build-g7-native.py without arguments. Therefore the historical builder is deliberately NOT replaced in this checkpoint. Its candidate also contains fixed source-provenance labels tied to this build; these must become accurate for subsequent invocations before treating it as a general-purpose builder. Compatibility and truthful provenance must be resolved with focused tests and an actual compatible-build check before default integration. Exact tested candidate is retained now, not mislabeled as deployed.

Authoritative private evidence retained by operator in g7-control/G7-SUSTAINABLE-E2-PARSER-FIX-RESULT.md, e2-first-receiver/parser-* and byte-verified e2-parser-fix-artifacts/. Raw toolchain/binary evidence is not copied into this publication. Remaining: coherent builder integration, three-role binary/source/map/receipt binding and independent consumer validation. Native lifetime/NULL/signing/production/final acceptance gates remain separate.
