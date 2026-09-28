# Bounded failure matrix

Slice5 observations below are actual; the additional completion.test.mjs cases
also passed in the expanded41-test pinned, isolated and fresh public-source runs.
Public source9b4ec08dac0bf41a3f6dec2e3905e788d86eb426; EVIDENCE.md identifies raw logs.
All fixtures use fresh local resources, no live provider, original credential,
historical ledger or daemon.

| Failure/criterion | Artifact and why | Level / actual outcome | Stop |
|---|---|---|---|
| Malformed/unknown field/binding | validation.test structural cases prevent invalid declarations | STRUCTURAL PASS (reject observed) | no runtime claim |
| Unknown capability/version/identity | validation.test selected frozen context | SEMANTIC PASS | exact mismatch rejected |
| Wrong Catalog pin/release | validation.test substantive consumeSnapshot+independent pin | SEMANTIC PASS | no trust/authenticity claim |
| Required dependency missing | public-host.test signed package requires absent provider | PUBLIC_HOST PASS | no successful empty result |
| Catalog dependency required/optional mismatch | completion.test uses in-memory modified-definition fault context, never released | SEMANTIC PASS | exact declaration failure codes |
| Invalid/missing config | validation.test actual JSON schema required field | SEMANTIC PASS | no activation implied |
| Missing/ref escape schema | completion.test local missing file and real symlink escape | SEMANTIC PASS | no fetch/resolver |
| Missing/undeclared/ungranted secret | public-host.test declaration/grant/existence | PUBLIC_HOST PASS | synthetic-test reference only |
| Capability denied | public-host.test and independent external operator | PUBLIC_HOST+EXTERNAL PASS | no handler dispatch/authority from metadata |
| Startup failure | public-host.test signed throw | PUBLIC_HOST PASS | startup fails |
| Readiness timeout | public-host.test signed hanging activation | PUBLIC_HOST PASS | DEADLINE_EXCEEDED + dirty cleanup retained |
| Dependency disappears/stale | public-host.test native provider disposal then stale call | PUBLIC_HOST PASS | call rejected after owner disposal |
| Service-owned health | public-host.test ready/quota/storage/stop | NATIVE+PUBLIC_HOST PASS | READY/DEGRADED/UNAVAILABLE separately observed |
| Stop timeout | public-host.test deliberately hung disposer | PUBLIC_HOST PASS | timeout/restartRequired, NOT clean |
| Scope forgery | public-host.test wrong scope-generation grant | PUBLIC_HOST PASS | existing Host rejection |
| Undeclared data domain | public-host.test reference refuses declaredDomains=[] | REFERENCE BEHAVIOR PASS | not OS confinement |
| Unauthorized/executable UI | validation.test unknown script/permission cases | STRUCTURAL/SEMANTIC PASS | no rendering/grant implied |
| Native storage write failure | storage-errors.test obstructed temporary write path | NATIVE FAULT PASS | UNAVAILABLE, old value retained |
| Corrupt JSON/shape, non-directory resource | storage-errors.test actual native paths | NATIVE FAULT PASS | FAILED_PRECONDITION/UNAVAILABLE, never absence |
| Empty versus absent | reference.test and publicHost record calls | SDK+PUBLIC_HOST PASS | existing empty string stays found=true |
| Concurrent writes/quota | reference.test deterministic bounded writes | NATIVE+SDK PASS | quota rejected, records preserved |
| Normal stop/start | public-host.test and separately installed operator | PUBLIC_HOST+EXTERNAL PASS | completed value survives same directory |
| Crash/restart | external-run waits completed write, SIGKILL own child, fresh operator | EXTERNAL NATIVE PASS | completed record recovered, no fsync guarantee |
| Cleanup | all normal publicHost/external closures | PUBLIC_HOST+EXTERNAL PASS | zero resources, no failed/timed-out disposers |
| Manifest/data schema fits real bytes | completion.test generated stateful example vs actual fileRecords output | SEMANTIC+NATIVE PASS | reject wrong declaration, no migration engine |
| Existing plugin declaration match | completion.test correct identity/digest then corrupt digest | SEMANTIC PASS | no signed-native claim |

A failure injected in a fixture demonstrates that tested path, not all possible
production failures. Namespace/chroot is qualification infrastructure only; the
product promises neither hostile-code sandboxing nor cross-deployment equivalence.
Historical failing runs and the installer timeout remain in EVIDENCE.md even after
subsequent corrections. No failure above authorizes historical live operations.
