# Service Foundation v1 — technically qualified release

Additive standard, tooling and native examples, NOT a central runtime service.
Governing Revision1.1 / S0–S20: ../docs/phase5.0. Exact public implementation
`9b4ec08dac0bf41a3f6dec2e3905e788d86eb426` passed pinned41/41, isolated41/41 and
fresh anonymous-public-source41/41 plus separately installed author/operator proof.
Independent parent technical review approved scoped publication. This release
declaration targets immutable tag phase5.0-service-foundation-v1.0.0; post-push
transport/readback is verified separately. See ../docs/phase5.0/PHASE5.0-COMPLETION.md.
No Owner Acceptance or Phase5.1 is implied.

## Start here

- STANDARD.md: normative meaning, existing lifecycle mapping, version/config/data/
  health/secret/UI declarations and explicit boundary limits.
- schemas/service-manifest-v1.schema.json: small closed versioned shape.
- tooling/validate.mjs and tooling/cli.mjs: independent STRUCTURAL/SEMANTIC/EXECUTED
  results; validation NEVER dispatches code, grants authority or reports execution.
- examples/stateless and examples/stateful: concrete manifests/configs/schemas and
  independently selected Catalog snapshots. Backup/migration declaration VALID is
  different from execution NOT_TESTED.
- examples/external/README.md and operator.mjs: demonstrated separately installed
  public-author workflow, including the required bootstrap retirement ordering.
- ../docs/phase5.0/REPRODUCE.md: actual pinned public-source commands/evidence.

One observed binding: public-host-inproc-v1. Public Host bootstrap/discover/activate/
context/grants/require/call/dispose/shutdown and SDK definePlugin/effect/provide/
require are reused. No internal Kernel import or parallel engine. Native service
health READY/DEGRADED/UNAVAILABLE is separate from Host ACTIVE and disposal state.

## Native attachment and authority

The accepted SDK has no filesystem API, and the signed in-process loader rejects
Node builtin imports. Therefore a tiny file resource is explicitly operator-owned
native code. The signed shell initially registers its declared provider to satisfy
existing Host activation. An explicitly granted bootstrap call disposes that root
registration and returns UNAVAILABLE, never a successful business result. Only after
observing its removal does the operator provide native handlers in an owned child
scope. Consumers require explicit ancestor and child grants. This avoids a duplicate
visible-provider CONFLICT without changing Host behavior or adding a registry.

The real public Host and separate external workflow passed. Shell ACTIVE is NOT
native READY. Shell signatures do NOT authenticate native bytes; metadata does NOT
grant filesystem authority; native code is trusted operator-owned, not hostile-code
confinement. Existing context.secret(ref) supports only the explicit synthetic-test
mechanism in this demonstrated binding. Missing declaration/grant/ref paths were
actually tested; no production secret resolver or real credential use is claimed.

## References and conformance

reference/services.mjs: stateless echo, tiny records provider, unchanged consumer.
reference/file-records.mjs: bounded single-owner serialized file resource,32keys,
normal stop/start persistence. Completed-write SIGKILL/fresh-operator recovery was
observed; no fsync/crash durability, concurrent multi-owner DB or supervisor promise.

Records were admitted by the existing governed local namespace-role transition
using exact independent parent design review and actual prior passing conformance.
Separate EXPERIMENTAL snapshot digest:
sha256:6d4f62849279bfa76ee781572ebf5e73ff0a0ebb6f2073b80f3030d4cbdfce26.
Original proposal/definition/policy and all baseline snapshots remain unchanged.
trustVerified=false; no human-signed approval, stable promotion or Owner Acceptance.

From a prepared source root with pinned Node24.21.0/npm11.19.0:

```
node --experimental-vm-modules --test --test-timeout=15000 service-foundation/tests/*.test.mjs
```

The actual bounded native/external/crash conformance launcher (root only for test
namespace/chroot setup; runtime test UID1000) is:

```
python3 service-foundation/conformance/isolate.py
```

It uses this script's own source root, offline tarballs/cache, no container startup,
images, sockets or provider network, and removes test-owned temporary roots.
Installed alica-service binary was also exercised against both reference manifests;
it truthfully reports EXECUTED:NOT_TESTED independently of these behavioral tests.
The package is private and never registry-published. Native-first design independence
is proved; multiple-deployment equivalence is NOT claimed. Historical failures and
inherited Catalog checker FAIL remain in EVIDENCE.md. No optional backend, renderer,
backup/migration engine, MemoryV4, Doghouse, UniUI or AInbA implementation.
