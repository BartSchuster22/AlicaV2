import type {
  KernelContext,
  Disposer,
  Descriptor,
  Requirement,
  BoundCapability,
  Value,
  Handler,
  OperationContext,
  EventDescriptor,
  EventEnvelope,
} from '@alica/acap-types';
import {
  check,
  canonical,
  manifest,
  descriptor as validateDescriptor,
  detach,
  freeze,
  digest,
  payload,
  validateEventDescriptor,
  validateEventEnvelope,
  normalized,
} from '@alica/acap-contracts';
import type { ClientEndpoint } from '@alica/acap-contracts';
export type {
  Disposer,
  Descriptor,
  Requirement,
  BoundCapability,
  Value,
  Handler,
  OperationContext,
  CallOptions,
  EventDescriptor,
  EventEnvelope,
} from '@alica/acap-types';
export interface SafeLogRecord {
  level: 'info' | 'warn' | 'error';
  event: 'checkpoint' | 'warning' | 'failure';
}
export interface TypedEvents<T extends Value = Value> {
  readonly descriptor: Readonly<EventDescriptor>;
  on(
    handler: (
      event: Readonly<Omit<EventEnvelope, 'data'> & { data: T }>,
    ) => Promise<void>,
  ): Disposer;
  emit(data: T): Promise<{ admitted: number }>;
}
export type ProviderHandlers = Record<
  string,
  (
    input: never,
    context: OperationContext,
  ) => Promise<Value> | AsyncIterable<Value>
>;
export interface PluginContext extends KernelContext {
  provide(descriptor: Descriptor, handlers: ProviderHandlers): Disposer;
  events<T extends Value = Value>(descriptor: EventDescriptor): TypedEvents<T>;
  createScope(): PluginContext;
}
export interface PluginDefinition {
  activate(context: PluginContext): void | Promise<void>;
}
export interface Plugin {
  activate(context: KernelContext): Promise<void>;
}
/** Same pending/result promise on every invocation, including failed cleanup. */
export function onceDisposer(dispose: Disposer): Disposer {
  check(typeof dispose === 'function');
  let pending: Promise<void> | undefined;
  return () =>
    (pending ??= Promise.resolve()
      .then(dispose)
      .catch((e) => {
        throw normalized(e);
      }));
}
function checkedRequirement(input: Requirement): Requirement {
  const r = detach(input);
  manifest(
    canonical({
      schemaVersion: 'alica.plugin/v1',
      id: 'org.alica.sdk',
      version: '1.0.0',
      publisher: 'org.alica.sdk',
      execution: 'inproc',
      entrypoint: 'index.js',
      provides: [],
      requires: [r],
      optionalRequires: [],
      secretReferences: [],
      publishedEvents: [],
      subscribedEvents: [],
    }),
  );
  return r;
}
/** Only a host supplies this context. SDK validation never creates authority. */
export function createPluginContext(raw: KernelContext): PluginContext {
  check(raw && typeof raw === 'object');
  const bound = (handle: BoundCapability): BoundCapability =>
    Object.freeze({
      descriptorDigest: handle.descriptorDigest,
      negotiatedFeatures: Object.freeze([...handle.negotiatedFeatures]),
      call: (
        op: string,
        input: Value,
        options: Parameters<BoundCapability['call']>[2],
      ) => handle.call(op, input, options),
      stream: (
        op: string,
        input: Value,
        options: Parameters<BoundCapability['stream']>[2],
      ) => handle.stream(op, input, options),
    });
  const ctx: PluginContext = {
    principal: raw.principal,
    instanceId: raw.instanceId,
    scope: raw.scope,
    scopeGeneration: raw.scopeGeneration,
    provide(d, handlers) {
      const checked = validateDescriptor(canonical(d));
      check(handlers && typeof handlers === 'object');
      const keys = Object.keys(handlers);
      check(
        keys.length === checked.operations.length &&
          keys.every((k) => checked.operations.some((o) => o.name === k)),
      );
      const copy: Record<string, Handler> = Object.create(null) as Record<
        string,
        Handler
      >;
      for (const key of keys) {
        const property = Object.getOwnPropertyDescriptor(handlers, key);
        check(
          property &&
            'value' in property &&
            typeof property.value === 'function',
        );
        copy[key] = property.value as Handler;
      }
      return onceDisposer(raw.provide(checked, copy));
    },
    async require(r) {
      return bound(await raw.require(checkedRequirement(r)));
    },
    async optional(r) {
      const handle = await raw.optional(checkedRequirement(r));
      return handle === null ? null : bound(handle);
    },
    effect(acquire) {
      check(typeof acquire === 'function');
      return raw.effect((register) =>
        acquire((dispose) => register(onceDisposer(dispose))),
      );
    },
    async secret(ref) {
      check(
        typeof ref === 'string' &&
          /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(ref),
      );
      return raw.secret(ref);
    },
    on(type, handler) {
      check(typeof handler === 'function');
      return onceDisposer(
        raw.on(type, (event) => handler(freeze(detach(event)))),
      );
    },
    emit(type, data) {
      return raw.emit(type, detach(data));
    },
    createScope() {
      return createPluginContext(raw.createScope());
    },
    log(record) {
      const value = detach(record);
      check(
        value &&
          typeof value === 'object' &&
          Object.keys(value).sort().join(',') === 'event,level',
      );
      check(
        ['info', 'warn', 'error'].includes(value.level) &&
          ['checkpoint', 'warning', 'failure'].includes(value.event),
      );
      raw.log(value);
    },
    events<T extends Value>(d: EventDescriptor): TypedEvents<T> {
      const event = freeze(validateEventDescriptor(canonical(d)));
      return Object.freeze({
        descriptor: event,
        on: (
          handler: (
            envelope: Readonly<Omit<EventEnvelope, 'data'> & { data: T }>,
          ) => Promise<void>,
        ) =>
          ctx.on(event.id, async (envelope) => {
            validateEventEnvelope(canonical(envelope), event);
            await handler(
              envelope as Readonly<Omit<EventEnvelope, 'data'> & { data: T }>,
            );
          }),
        emit: (data: T) => {
          payload(event.payload, data);
          return ctx.emit(event.id, data);
        },
      });
    },
  };
  return Object.freeze(ctx);
}
export function definePlugin(definition: PluginDefinition): Plugin {
  check(
    definition &&
      typeof definition === 'object' &&
      Object.keys(definition).join(',') === 'activate' &&
      typeof definition.activate === 'function',
  );
  const activate = definition.activate;
  return Object.freeze({
    async activate(raw: KernelContext) {
      await activate(createPluginContext(raw));
    },
  });
}
/** Structural bridge from a broker handle to the G4 generated-client interface. */
export function clientEndpoint(
  handle: BoundCapability,
  d: Descriptor,
): ClientEndpoint {
  const checked = freeze(validateDescriptor(canonical(d)));
  check(handle.descriptorDigest === digest(checked), 'CONTRACT_MISMATCH');
  return Object.freeze({
    descriptor: checked,
    call: handle.call.bind(handle),
    openStream: handle.stream.bind(handle),
  });
}
