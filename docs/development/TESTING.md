# Testing and evidence

G7 R1 executable components: `npm run test:g7-implementation` runs bounded archive/signature/graph inspection and real durable-write SIGKILL tests. `npm run g7:inspect -- ARCHIVE OPERATOR_TRUST_JSON OPERATOR_FLOOR_JSON` is read-only and never reports application qualification. The existing full check runs the new tests through its G7 glob. See [the incomplete implementation checkpoint](../g7/R1-IMPLEMENTATION-CHECKPOINT.md) for the reproduced public Kernel admission boundary, exact missing functionality, and evidence limits. These component tests are not Cell install/restore or two-host G7 acceptance.

The checks have three distinct layers: Node foundation checks; real Kernel/ACAP runtime tests in `tests/kernel`; and retained Python G1 schema/design checks. Only the runtime suites exercise G3 enforcement. `npm run demo` also executes both Echo substitutions and asserts cooperative resource reclamation. See `docs/gates/G3.md` for supported scope and limitations.

Import-boundary fixtures exercise the same AST analyzer as the command and include deep package imports, relative cross-package paths, computed imports and absolute V1 paths. Public package export rejection is checked by Node itself. The secret fixture is constructed in a temporary directory from clearly synthetic characters, scanned through the actual CLI, checked for nonzero exit/redacted output, then deleted; no credential is used or committed.

Clean-checkout acceptance must run outside the development working tree, install from committed locks, run all checks, confirm unchanged tracked files and compare built artifact hashes across builds. OS/Python/OpenSSL are declared prerequisites, not secretly bundled dependencies. Cross-platform or byte-identical toolchain builds are not claimed.

CI uses a SHA-pinned checkout action, contents:read only, no stored checkout credentials, no deployment secrets, and the same commands. A configured workflow is not a successful run. Required-check/branch-rule enforcement must be verified separately; lack of API/admin access is an explicit G2 blocker unless the owner accepts a documented equivalent.
