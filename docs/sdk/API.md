# Public SDK API — G5, version 0.1.0

Supported imports: `@alica/plugin-sdk`, `@alica/testkit` (tests only), and the existing `@alica/acap-types` / `@alica/acap-contracts` public roots. No private path aliases. `api/plugin-sdk.d.ts` and `api/testkit.d.ts` are the supported declaration snapshots; `npm run check` compares them and runtime export names exactly.

## Plugin lifecycle

```ts
import {definePlugin} from '@alica/plugin-sdk';
export const activate = definePlugin({
  async activate(ctx) {
    const resource = await ctx.effect(async registerCleanup => {
      const resource = {open: true};
      registerCleanup(async () => { resource.open = false; });
      // Register cleanup BEFORE another await or publication.
      return resource;
    });
    ctx.log({level: 'info', event: 'checkpoint'});
  },
}).activate;
```

`definePlugin({activate})` captures the activation function and returns a frozen plugin. Export its `activate` function as above. It does not bootstrap a host, mint grants or accept lifecycle hooks outside the supported shape. Activation returns `void`/`Promise<void>`; cleanup belongs in `ctx.effect`, not an untracked return value.

`createPluginContext(hostContext)` is the adapter used by `definePlugin`. Supplying a fake context does not create production authority. The real host injects the authenticated context and remains the security boundary.

## Context

| Surface | Contract |
|---|---|
| `principal`, `instanceId`, `scope`, `scopeGeneration` | Read-only host-authenticated summaries; not delegation tokens. |
| `provide(descriptor, handlers)` | Exact operation/handler inventory; returns an idempotent disposer. The host validates signed manifest/descriptor declarations. Registrations are staged until ACTIVE. Generated narrow handler types are accepted; runtime payload validation remains authoritative. |
| `require(requirement)` | Returns an immutable scoped handle for a declared mandatory dependency. Binding may occur during activation; calls may begin only once ACTIVE. |
| `optional(requirement)` | ACTIVE-only. `null` means permitted absence, not denial, incompatibility or resolution conflict. SDK does not catch-and-hide these errors or activate a replacement. |
| `effect(acquire)` | Acquire receives cleanup registration. Partial acquisition and later scope/instance cleanup remain host-owned. Register cleanup before awaiting or publishing the resource. |
| `createScope()` | Restricted child context. Does not create grants, copy ambient credentials or widen permissions. Host destroys owned scopes. |
| `secret(reference)` | Validates the frozen reference grammar and delegates authorization to the host. No ambient environment lookup or SDK secret cache. |
| `log({level,event})` | Closed safe record: levels `info/warn/error`; events `checkpoint/warning/failure`. Extra fields, messages, arbitrary event names and raw objects are rejected. Host adds identity/correlation metadata. |
| `on(type, handler)`, `emit(type,data)` | Low-level host event surfaces; owned disposer / admission count. No durable delivery acknowledgement. |
| `events<T>(descriptor)` | Typed `on`/`emit`; validates payloads and incoming envelope digest against the declared event contract. Received envelopes are detached/frozen. T must agree with the descriptor; a generic annotation cannot override runtime validation. |

`onceDisposer(dispose)` returns the same pending/result promise on every call, including rejection. It does not silently retry a failed cleanup. The production host enforces cleanup budgets and reports incomplete cleanup; JavaScript cannot forcibly stop uncooperative in-process code.

`clientEndpoint(handle, descriptor)` validates the exact descriptor digest and bridges the public broker handle to G4's generated `createClient` interface. It exposes no host, token, signature, grant or secret. Deadlines, abort signals and idempotency keys use the existing public `CallOptions`. No automatic retry or rebind.

## Typed event example

```ts
const observations = ctx.events<string>(eventDescriptor);
const unsubscribe = observations.on(async event => {
  // event.data is typed AND checked against eventDescriptor.payload.
});
await observations.emit('ready');
await unsubscribe();
await unsubscribe(); // same disposal result
```

The event descriptor must also be declared in the signed manifest. Emission validates both the SDK descriptor and the host's actual manifest-bound descriptor; the host supplies event identity, scope, generation, sequence and timestamp. The SDK does not authenticate caller-supplied event headers.

## Secrets and logging limits

A permitted secret is a raw value intentionally delivered to the plugin. The SDK does not promise zeroization, cryptographic isolation or prevention of arbitrary logging by trusted code. Use only the structured logger for diagnostics and never send secrets as call/event payloads. G3's production host currently implements only its `synthetic-test` secret adapter; this SDK does not add a production secret backend.

## Runtime packaging

Production plugin imports may reference the exact public roots `@alica/plugin-sdk`, `@alica/acap-contracts`, and `@alica/acap-types`, or relative `.js`/`.mjs` modules present in the verified package inventory. No filesystem/package-manager resolution occurs in the plugin linker: dependent bytes are copied and digest-verified before evaluation. Unknown roots, private subpaths, escapes, missing modules and dynamic imports are rejected. The testkit is not exposed by this linker.

This is a trusted in-process module loader, **not an OS sandbox**. Global in-process JavaScript remains within the accepted trusted-code boundary. G6 IPC and process isolation are not implemented here.
