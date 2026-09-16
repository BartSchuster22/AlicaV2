# ALICA-PUBLIC-INTERFACES-v1

Status: normative candidate; owner acceptance pending. These are interface contracts, not implementations. JSON descriptors/schemas remain language-neutral.

## Public dependency diagram

```text
schemas / acap-types (no Kernel import)
          ^          ^
          |          |
 provider-sdk    consumer-sdk
          ^          ^
          |          |
 provider A/B    consumer plugin
          \          /
           plugin-sdk -> public KernelContext interface
                              ^
                              | implements
                           Kernel
                              |
                              v
                    public TransportAdapter interface
                       ^                  ^
                       | implements       | implements
                    inproc             local IPC
```

Kernel may import public types/schema validation, not provider implementations. SDKs may import only public contracts, not Kernel internals. Transport implementations may share validation utilities, not bypass the broker's authorization. No V1/framework/application dependency exists in the normative graph.

## Language-neutral operations

- Bootstrap(config) -> Host: config contains locally provisioned identity, immutable policy and bounded operational limits, not untrusted profile overrides.
- Host.plan(profile) -> ResolutionLock + safe explanations; no mutation.
- Host.activate(pluginId, logicalScope) -> PluginInstance snapshot; async, fails with normalized error and cleanup report.
- Host.quiesce/dispose/destroyScope/shutdown -> CleanupReport; bounded by policy.
- Host.inspect(query) -> redacted immutable snapshot; operator-authorized only.
- Host.issueGrant(record)/revokeGrant(id)/createScope(parent,owner) -> operator-policy action with audit and parent bounds.
- Context.provide(descriptor, handlers) -> async disposer; exactly one handler per declared operation, no extra exports; staged before ACTIVE.
- Context.require(requirement) -> async BoundCapability proxy.
- Context.optional(requirement) -> async BoundCapability|null under the specified absence/denial rules.
- Context.effect(acquire) -> scoped resource; acquire receives registerCleanup so partial acquisition registers cleanup before publication.
- Context.secret(ref) -> async authorized secret value; never ambient credentials.
- Context.on(type,handler) -> disposer; Context.emit(type,data) -> delivery-admission result, not durable acknowledgement.
- Context.createScope() -> restricted child context; cannot mint operator grants.

## TypeScript-shaped provider/transport surface

```typescript
type Value = null | boolean | number | string | Value[] | { [key: string]: Value };
// number is constrained by runtime validation to safe integers; types alone are insufficient.
type Disposer = () => Promise<void>;
interface OperationContext {
  readonly requestId: string;
  readonly deadlineMs: number;
  readonly signal: AbortSignal;
  // Read-only authenticated caller summary; cannot be reused as delegated authority.
  readonly caller: Readonly<{principal: string; instanceId: string; scope: string}>;
}
type UnaryHandler = (input: Value, context: OperationContext) => Promise<Value>;
type StreamHandler = (input: Value, context: OperationContext) => AsyncIterable<Value>;
interface BoundCapability {
  readonly descriptorDigest: string;
  readonly negotiatedFeatures: readonly string[];
  call(operation: string, input: Value, options: CallOptions): Promise<Value>;
  stream(operation: string, input: Value, options: CallOptions): AsyncIterable<Value>;
}
interface CallOptions { deadlineMs: number; signal?: AbortSignal; idempotencyKey?: string }
interface TransportAdapter {
  // Broker constructs authenticated immutable binding; consumer cannot create one.
  connect(binding: VerifiedBinding): Promise<TransportSession>;
}
interface TransportSession {
  invoke(request: CallEnvelope): Promise<ResponseEnvelope>;
  stream(request: CallEnvelope): AsyncIterable<Value>;
  cancel(requestId: string): Promise<void>;
  close(reason: string): Promise<void>;
}
```

CallEnvelope/ResponseEnvelope are their closed JSON schemas. VerifiedBinding is host-only: Cell identity, expected process/provider instance, package/descriptor digests, authenticated endpoint and immutable caller-policy binding. It is deliberately not a consumer-deserializable token. CleanupReport contains terminal state, completed disposers, failed disposers (redacted error codes), timed-out resources and restartRequired; failure MUST remain visible. No signature, secret or grant value is exposed through a proxy.

## Transport invariants

Both transports deep-detach public data, enforce identical input/output schema and value restrictions, propagate effective deadline/cancellation and emit the same normalized error. IPC authenticates provider through supervisor/OS-bound identity; inproc trusts code execution, not data assertions. No automatic retry/rebind, no raw exception or object reference across ACAP. Streaming item schema applies per item; iterator terminal behavior follows core. IPC frame encodings may be extended at G6 without changing these semantics. A provider author implements descriptor plus handlers and disposer; no Kernel internals are required.
