# Testing and evidence

The foundation has two distinct test layers: Node built-in tests for workspace/check behavior and the retained Python G1 schema/design tests. Neither is production Kernel conformance.

Import-boundary fixtures exercise the same AST analyzer as the command and include deep package imports, relative cross-package paths, computed imports and absolute V1 paths. Public package export rejection is checked by Node itself. The secret fixture is constructed in a temporary directory from clearly synthetic characters, scanned through the actual CLI, checked for nonzero exit/redacted output, then deleted; no credential is used or committed.

Clean-checkout acceptance must run outside the development working tree, install from committed locks, run all checks, confirm unchanged tracked files and compare built artifact hashes across builds. OS/Python/OpenSSL are declared prerequisites, not secretly bundled dependencies. Cross-platform or byte-identical toolchain builds are not claimed.

CI uses a SHA-pinned checkout action, contents:read only, no stored checkout credentials, no deployment secrets, and the same commands. A configured workflow is not a successful run. Required-check/branch-rule enforcement must be verified separately; lack of API/admin access is an explicit G2 blocker unless the owner accepts a documented equivalent.
