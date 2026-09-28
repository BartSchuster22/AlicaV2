# Phase5.0 reproduction — actually reproduced public source

Exact public source `9b4ec08dac0bf41a3f6dec2e3905e788d86eb426` was anonymously cloned
into /home/alica-dev/AlicaV2-phase50-repro-9b4ec08d with clean initial status.
Offline pinned npm ci/build/typecheck and its own isolation launcher passed41/41
plus actual separate public author/operator/unchanged consumer, permissions/health/
persistence/crash-restart/cleanup. Installed alica-service binary passed both
examples. Raw logs and PUBLIC-SOURCE-VERIFICATION.json are in evidence/.
The runner's generic working-tree label does not attest Git origin; the separate
actual commit/source comparison does. Independent parent technical review approved
scoped publication; PHASE5.0-COMPLETION.md declares the immutable technical release.
Transport/tag/main readback is verified after push. Not owner-accepted; no production
credentials/ledgers are required.

Obtain a fresh clone through anonymous HTTPS, select the exact commit above and
check initial status before preparation. Do not apply a local source overlay.
The concrete procedure below used only an existing pinned toolchain/public cache
and no provider network. Never run it in mixed older worktrees.

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
node service-foundation/tooling/cli.mjs validate service-foundation/examples/stateless/service.json service-foundation/examples/stateless/snapshot.json sha256:9ae1e21129397d88624e9c05b1d224739119d9437199c6ad423632c16da10442 service-foundation/examples/stateless/config.json
node service-foundation/tooling/cli.mjs validate service-foundation/examples/stateful/service.json service-foundation/examples/stateful/snapshot.json sha256:6d4f62849279bfa76ee781572ebf5e73ff0a0ebb6f2073b80f3030d4cbdfce26 service-foundation/examples/stateful/config.json
```

These are the actually qualified snapshot pins. Output remains STRUCTURAL /
SEMANTIC / EXECUTED:NOT_TESTED even when declarations pass. Separate raw native
harness observations provide behavior evidence. Backup/migration execution remains
NOT_TESTED. Package tarballs are local only; no npm registry publication.

## Frozen offline regressions

The previously inspected foundation command is `npm test` (170PASS observed),
plus inherited `python3 -S tools/check-dependencies.py` (FAIL at @alica/catalog, accepted baseline).
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

## Final committed-public reproduction result / technical release

The exact-path candidate was committed/pushed, anonymously cloned without an overlay,
and pinned offline install/build/typecheck/native/external/installed-CLI proof passed
as stated above. Source/tag purity and exact raw public readback passed; this is
actual execution, not merely the recipe. Committed qualification consumes existing
snapshot/example bytes; it does not rerun admission or regenerate originals.

The one-time admission/example commands above already ran successfully during the
authorized build. Their proof inputs and proposed source remain preserved; these
commands are NOT consumer prerequisites for reproducing the committed candidate.

Final independent parent review APPROVED scoped publication, preserved verbatim in
FINAL-PARENT-REVIEW.md. This documentation/evidence-only release declares immutable
tag phase5.0-service-foundation-v1.0.0. The exact technical43-file digest remains
the qualification target across release documentation changes. Tag/main transport
and anonymous exact-ref/raw-evidence readback are verified after push, not inferred
from a pre-push declaration. No owner-accepted tag or Phase5.1 is permitted.
