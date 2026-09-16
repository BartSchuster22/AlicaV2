# Development environment — G2

Supported qualification target: Ubuntu 24.04 x86_64, Python 3.12, Git, OpenSSL, CA certificates and outbound HTTPS access to nodejs.org/PyPI/npm during setup. No V1 source, database, Docker, domain service or system-wide Node installation is required. Offline installation is a later G7 qualification, not a G2 claim.

```sh
git clone <authorized AlicaV2 repository URL> AlicaV2
cd AlicaV2
python3 tools/bootstrap.py
export PATH="$PWD/.tools/node/bin:$PATH"
npm ci --ignore-scripts
npm run check
git diff --exit-code
```

`toolchain.lock.json` pins runtime download URL/SHA256, npm and the bootstrap pip wheel. `requirements-design.txt` pins every design dependency and wheel SHA256. `package-lock.json` pins npm dependency versions/integrity. `bootstrap.py` installs only into ignored `.tools/`, with standard pip bootstrapped from a checksum-verified wheel; no sudo/system Python mutation. The global development account runtime was also installed under its own `.local/share/alica/toolchains/` with evidence, but clean checkouts do not depend on it.

Selected TypeScript 6 is the pure-JavaScript compiler/API used by the boundary parser. TypeScript 7 currently introduces per-platform native packages; not adopted because they add no needed G2 benefit. Two npm dev dependencies only: TypeScript and Prettier. No production dependency exists. Python dependencies support the retained G1 design checks, not the product runtime. Updated jsonschema/cryptography are pinned locally rather than silently relying on older host packages.

Setup integrity is based on reviewed upstream HTTPS hash metadata, not independently verified Node release-key signatures. This limitation is explicit; production candidate signing remains a separate G7 obligation.

## Commands

- `npm run build`: compile public type foundation and declarations.
- `npm run typecheck`: positive/negative TypeScript contract checks.
- `npm test`: import-boundary/public-export and synthetic secret-detector checks.
- `npm run schema`: G1 design suite under Python `-S` and locked local deps.
- `npm run format:check`: engineering-source/config formatting; historical normative/evidence documents are not reformatted.
- `npm run boundaries`: AST import checks.
- `npm run secrets`: tracked/unignored file known-credential scan, redacted output.
- `npm run dependencies`: exact pin/integrity/runtime-dependency/license policy checks; not a vulnerability audit.
- `npm run check`: all checks above, failing on the first error.

Use npm's integrity-locked install with lifecycle scripts disabled. No global npm package or developer-local library may be needed. Network/advisory scanning and upgrade review remain explicit operations; an unavailable external audit is not reported green.
