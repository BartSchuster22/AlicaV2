# Testkit: useful mocks, not production authority

```ts
import {createTestCell} from '@alica/testkit';
import {definePlugin} from '@alica/plugin-sdk';
const cell = createTestCell({cleanupMs: 50});
const instance = cell.instance({
  id: 'org.example.consumer',
  permissions: {capabilities: {'org.example.math': ['add']}},
});
await instance.activate(definePlugin({activate(ctx) { /* register owned effects */ }}));
try { /* use instance.context after activation */ }
finally { await cell.close(); }
```

## Supported fixture behavior

- Default-deny capability operations, events and secret references. Root-scope permission is not a child-scope grant; the fixture operator must explicitly `cell.grantScope(instance, child.scope)`.
- `cell.instance(...)` creates a DISCOVERED fixture. `activate` stages providers until ACTIVE; `dispose` is idempotent and returns a cleanup report. `cell.close()` disposes instances in reverse creation order.
- Public G4 runtime performs real payload validation, negotiation, call deadlines/cancellation, idempotency and streaming. These are not fabricated RPC results.
- `context.optional` is ACTIVE-only. It returns null for permitted absence, and preserves denial/incompatibility.
- `cell.revoke(instance)` invalidates the fixture's permissions and outstanding requests; old handles are not silently rebound. No regrant API exists in this version.
- Owned effects clean in reverse order; partial acquisition cleans immediately. Incomplete/failing cleanup and stuck event handlers remain visible in reports.
- `cell.destroyScope(childId)` closes that subtree; later calls on its handles cannot escape into a parent scope.
- Declare event contracts in `createTestCell({events:[descriptor]})`. Event queues are bounded; overflow stops that subscription and records `RESOURCE_EXHAUSTED`. `cell.flush()` awaits delivery tasks with a bound.
- Synthetic secret values enter through `createTestCell({secrets:{test_token:'synthetic'}})` and need explicit reference permissions. They are not included in `inspect()`.
- `inspect()` returns immutable diagnostic data, not handles, grants, handlers or secret values. The trace retains at most 1024 records and reports its dropped-record count.

## Deterministic failure injection

`instance.failNext(point, code?)` queues a one-shot fault; the default codes are below. Injection has no randomness or sleep requirement. Inspect diagnostics for the consumed `injected:<point>` entry.

| Point | Trigger | Default |
|---|---|---|
| `activation` | After the activation callback, before publication | `INTERNAL`; rollback staged resources |
| `revocation` | Next authorization boundary | Revoke the instance; `PERMISSION_DENIED` |
| `timeout` | Next authorization boundary | `DEADLINE_EXCEEDED` |
| `cleanup` | After the next owned cleanup executes | `INTERNAL`; report failure and continue other cleanup |

Activation/cleanup error codes may be customized. Revocation always enforces revocation; timeout injection is a boundary failure, **not a virtual clock or proof of elapsed-time enforcement**. The real G4 runtime additionally has deadline/cancellation tests. A cleanup injection deliberately allows actual cleanup to run first; use a throwing or never-settling disposer to test genuinely incomplete cleanup.

## Deliberate differences from production

| Testkit | Production host |
|---|---|
| Trusted fixture configuration; logical identities and generated opaque instance IDs | Provisioned Cell identity, verified package/publisher identity and host-generated instances |
| Flat in-memory operation/reference permissions with explicit test scopes | Signed manifests, full grant tuples, revision/expiry, parent/delegation constraints, trust/revocation freshness |
| Simple compatible-provider lookup; no complete pins/ranking/activation graph | G1 resolution policy, locked mandatory dependencies and dependent quiescing |
| Test author controls activation order; no automatic dependency activation | Host resolves and activates mandatory dependencies |
| Synthetic secret dictionary | Authorized backend adapter; currently only the explicit G3 synthetic backend |
| Bounded in-memory diagnostics | Fail-closed audited host operations and durable trust watermarks |
| No package signature/index verification | Verification before any module evaluation |
| No IPC or process supervisor; not a full model of every raw-work/activation race or lifecycle diagnostic | Accepted inproc enforcement and tracked work; process/IPC support belongs to G6 |

Do not use mock success as permission, transport, installation, recovery or security certification. The G5 suite separately runs signed packages against the real Kernel through public APIs, including SDK module linking and negative permission cases. Failure injection is test-only: no production environment flag or plugin import enables it.
