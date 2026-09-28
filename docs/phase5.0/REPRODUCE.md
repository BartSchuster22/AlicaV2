# Phase5.0 reproduction — candidate procedure

Public committed-source reproduction is NOT YET EXECUTED; final commit/tag and raw
reproduction evidence must replace that status before technical freeze. Commands
below are for the authorized fresh Phase5.0 worktree only. Never run them in mixed
older worktrees. Never use original credentials/ledgers, live flags or daemons.

## Prerequisites

Pinned actual DEV toolchain:
`/home/alica-dev/AlicaV2/.tools/node-v24.21.0-linux-x64/bin` (Node24.21.0/npm11.19.0).
Existing locked dependency cache, Linux mount/network/PID namespace and chroot
privilege for qualification only; service runtime does not require containers.
Native installed references run as alica-dev UID1000. No image downloads, socket
access, network provider traffic or shared infrastructure modifications.

Run ordinary source/build commands as alica-dev from the selected worktree:

```
export PATH=/home/alica-dev/AlicaV2/.tools/node-v24.21.0-linux-x64/bin:/usr/bin:/bin
node --version
npm --version
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build
```

The frozen build may generate untracked Catalog schemas. They are not delivery
sources; never blanket-stage them or repair the inherited Catalog dependency check.
Inspect accepted scripts before running any regression; all runtime fixtures here
are network-disabled. Controller Node22 is not pinned qualification.

## Maintainer admission (one-time build operation, not runtime/reproduction)

Before this operation, conformance.json pins an actual passing35-test native log,
implementation hashes and independent raw parent design review. The operation
refuses changed evidence/re-admission. It uses existing Catalog governance and the
existing local namespace role, not an invented human signature. In the authorized
build only, after review/evidence verification:

```
node catalog/proposals/service-records/admit.mjs --admit-experimental
node service-foundation/tooling/examples.mjs
```

After publication, consumers use committed snapshot/admission/example bytes; they
must not renew or invent any admission. Proposed sources and frozen baseline
snapshot remain unchanged. Neither admission nor example generation is execution.

## Functional and native installed-author qualification

```
node --experimental-vm-modules --test --test-timeout=15000 service-foundation/tests/*.test.mjs
```

With root only for the bounded qualification launcher:

```
python3 service-foundation/conformance/isolate.py
```

Inspect the launcher first. It runs offline tarball preparation as alica-dev in a
network namespace; copies only public artifacts/source into a fresh root; drops
UID/GID under new namespaces/chroot; verifies executable/socket/interface/endpoint
exclusions; runs functional and external/crash proof; removes temporary roots.
No container is started and no product sandbox/supervisor API is introduced.

For manifest validation use the digest from an independently chosen committed
snapshot/evidence, NOT a digest merely copied from an untrusted service declaration:

```
node service-foundation/tooling/cli.mjs validate service-foundation/examples/stateless/service.json service-foundation/examples/stateless/snapshot.json sha256:PIN service-foundation/examples/stateless/config.json
node service-foundation/tooling/cli.mjs validate service-foundation/examples/stateful/service.json service-foundation/examples/stateful/snapshot.json sha256:PIN service-foundation/examples/stateful/config.json
```

Replace PIN with the actual selected immutable digest. Output remains STRUCTURAL /
SEMANTIC / EXECUTED:NOT_TESTED even when declarations pass. Separate raw native
harness observations provide behavior evidence. Backup/migration execution remains
NOT_TESTED. Package tarballs are local only; no npm registry publication.

## Frozen offline regressions

The previously inspected foundation command is `npm test` (170PASS observed),
plus inherited `npm run check:deps` (FAIL at @alica/catalog, accepted baseline).
The inspected Phase4 command is:

```
node --experimental-vm-modules --test --test-timeout=15000 services/decision/tests/contract/*.test.mjs services/decision/tests/provider/*.test.mjs services/decision/tests/external/*.test.mjs
```

Actual result54PASS,0FAIL. All these commands run in a network-disabled namespace
as alica-dev. Phase4's default packed fixture helper preserves HOME but strips npm
environment configuration. It initially timed out; the approved test-only solution
is a fresh temporary HOME containing `.npmrc` with offline=true,
cache=/home/alica-dev/.npm, fetch-retries=0, audit=false, fund=false. Put TMPDIR
beneath that temporary home, invoke unchanged helper with either no argument or
ONLY `--continuation-fixture`, bound each to120seconds and kill only its own process
group if timeout; remove temporary home in finally. Both actual corrected runs
returned EXIT0 with authenticatedLiveRequests0. Original live authority remains
permanently closed. NEVER run --live, --continue-live or initialize/reset originals.

## Final committed-public reproduction gate

After exact-path candidate commit/push and independent review process, fetch the
actual public commit into a fresh separate worktree, verify source/tag purity,
repeat pinned offline install/build/tests/native proof, and record exact commit,
source hashes/raw outputs and inherited failures. Anonymous ref/tag/raw-evidence
verification and a separate README-only main pointer follow final independent
approval before immutable technical tag. These final gates remain PENDING; this
procedure is not evidence that they have happened. No owner-accepted tag is allowed.
