import { randomUUID } from 'node:crypto';
import {
  AcapError,
  check,
  canonical,
  digest,
  detach,
  payload,
  errorRecord,
} from '@alica/acap-contracts';
import type {
  KernelContext,
  Descriptor,
  Handler,
  EventEnvelope,
  BoundCapability,
  Requirement,
  CallOptions,
  Value,
  OperationContext,
  Disposer,
} from '@alica/acap-types';
import { linkPackage } from '../package-loader.js';
import { WorkerTransport } from './worker-transport.js';
import type { WorkerEndpoint } from './worker-transport.js';
import { WorkerSDKChannel } from './worker-sdk-channel.js';
import { Exchanges } from './exchange.js';
import type { Message } from './exchange.js';
import type { Frame } from './wire.js';

const transport = new WorkerTransport();
transport.onFailure = () => {
  process.exitCode = 1;
};
await transport.start();
const accepted = transport.accepted!;
const capsule = transport.capsule;
const channel = new WorkerSDKChannel(transport, capsule.runtime.activationMs);
const exchanges = new Exchanges<WorkerEndpoint>(
  (endpoint, message) => channel.send(endpoint, message),
  (endpoint) => ({ signal: endpoint.controller.signal, end: endpoint.end }),
  () => transport.fail(new AcapError('UNAVAILABLE')),
  () => channel.pending.reserveExternal(),
);
const registrations = new Map<
  string,
  { descriptor: Descriptor; handlers: Readonly<Record<string, Handler>> }
>();
const subscriptions = new Map<
  string,
  (event: EventEnvelope) => Promise<void>
>();
const contexts = new Map<string, KernelContext>();
let activated = false;
let activationStarted = false;
let disposed = false;
const inbound = new WeakSet<WorkerEndpoint>();
const invocations = new WeakMap<
  WorkerEndpoint,
  { wireId: number; controller: AbortController }
>();
function reply(endpoint: WorkerEndpoint, message: Message): void {
  if (endpoint.stream.closed) return;
  try {
    channel.send(endpoint, message);
  } catch (error) {
    transport.fail(error);
  }
}
function scopedObject<T extends object>(scope: string, value: T): T {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([name, member]) => {
        if (typeof member !== 'function') return [name, member];
        const call = (...args: unknown[]) =>
          channel.scoped(scope, () => {
            check(!disposed, 'FAILED_PRECONDITION');
            const result: unknown = Reflect.apply(member, undefined, args);
            if (typeof result === 'function')
              return (...rest: unknown[]) =>
                channel.scoped(scope, () =>
                  Reflect.apply(result, undefined, rest),
                );
            return result;
          });
        return [
          name,
          ['require', 'optional', 'secret', 'emit', 'effect', 'call'].includes(
            name,
          )
            ? (...args: unknown[]) =>
                Promise.resolve().then(() => call(...args))
            : call,
        ];
      }),
    ),
  ) as T;
}
function context(scope: string, scopeGeneration: number): KernelContext {
  const prior = contexts.get(scope);
  if (prior) {
    check(prior.scopeGeneration === scopeGeneration, 'UNAUTHENTICATED');
    return prior;
  }
  check(contexts.size < 256, 'RESOURCE_EXHAUSTED');
  const scoped: KernelContext = Object.freeze({
    principal: capsule.manifest.id,
    instanceId: capsule.hello.instanceId,
    scope,
    scopeGeneration,
    provide: (descriptor: Descriptor, handlers: Record<string, Handler>) => {
      const d = detach(descriptor);
      check(
        capsule.descriptors.some(
          (candidate) => digest(candidate) === digest(d),
        ),
        'CONTRACT_MISMATCH',
      );
      check(
        canonical(Object.keys(handlers).sort()) ===
          canonical(d.operations.map((o) => o.name).sort()) &&
          Object.values(handlers).every((h) => typeof h === 'function'),
        'CONTRACT_MISMATCH',
      );
      const result = channel.sync(
        {
          kind: 'register',
          scopeId: scope,
          capabilityId: d.id,
          descriptorDigest: digest(d),
        },
        ['registered'],
      );
      check(result.kind === 'registered', 'UNAUTHENTICATED');
      registrations.set(result.registrationId, {
        descriptor: d,
        handlers: Object.freeze({ ...handlers }),
      });
      let disposal: Promise<void> | undefined;
      return () =>
        (disposal ??= channel
          .request(
            { kind: 'withdraw', registrationId: result.registrationId },
            ['ack'],
          )
          .then(() => {
            registrations.delete(result.registrationId);
          }));
    },
    require: (requirement: Requirement) =>
      bind(scope, requirement, false).then((bound) => {
        check(bound, 'UNAVAILABLE');
        return bound;
      }),
    optional: (requirement: Requirement) => bind(scope, requirement, true),
    effect: <T>(
      acquire: (register: (dispose: Disposer) => void) => Promise<T>,
    ) => channel.acquire(scope, scopeGeneration, acquire),
    secret: async (reference: string) => {
      const value = await channel.request(
        { kind: 'secret', scopeId: scope, reference },
        ['secret'],
      );
      check(value.kind === 'secret', 'UNAUTHENTICATED');
      return value.value;
    },
    on: (
      eventType: string,
      handler: (event: EventEnvelope) => Promise<void>,
    ) => {
      check(typeof handler === 'function');
      const binding = capsule.manifest.subscribedEvents.find(
        (b) => b.eventType === eventType,
      );
      check(binding, 'PERMISSION_DENIED');
      const value = channel.sync(
        {
          kind: 'subscribe',
          scopeId: scope,
          eventType,
          descriptorDigest: binding.descriptorDigest,
        },
        ['subscribed'],
      );
      check(value.kind === 'subscribed', 'UNAUTHENTICATED');
      subscriptions.set(value.subscriptionId, handler);
      let disposal: Promise<void> | undefined;
      return () =>
        (disposal ??= channel
          .request(
            { kind: 'unsubscribe', subscriptionId: value.subscriptionId },
            ['ack'],
          )
          .then(() => {
            subscriptions.delete(value.subscriptionId);
          }));
    },
    emit: async (eventType: string, data: Value) => {
      const binding = capsule.manifest.publishedEvents.find(
        (b) => b.eventType === eventType,
      );
      check(binding, 'PERMISSION_DENIED');
      const endpoint = channel.current();
      const result = await channel.pending.request(
        { endpoint, end: endpoint.end, signal: endpoint.controller.signal },
        ['published'],
        (wireId) =>
          channel.send(endpoint, {
            tag: 'event',
            body: {
              kind: 'publish',
              wireId,
              scopeId: scope,
              eventType,
              descriptorDigest: binding.descriptorDigest,
              data: detach(data),
            },
          }),
      );
      check(result.kind === 'published', 'UNAUTHENTICATED');
      return { admitted: result.admitted };
    },
    createScope: () => {
      const result = channel.sync(
        { kind: 'scope-create', parentScopeId: scope },
        ['scope'],
      );
      check(result.kind === 'scope', 'UNAUTHENTICATED');
      return context(result.scopeId, result.scopeGeneration);
    },
    log: (record: Parameters<KernelContext['log']>[0]) => {
      check(
        canonical(Object.keys(record).sort()) === canonical(['event', 'level']),
      );
      check(
        ['info', 'warn', 'error'].includes(record.level) &&
          ['checkpoint', 'warning', 'failure'].includes(record.event),
      );
      channel.sync({ kind: 'log', record }, ['ack']);
    },
  });
  const wrapped = scopedObject(scope, scoped);
  contexts.set(scope, wrapped);
  return wrapped;
}
async function bind(
  scopeId: string,
  requirement: Requirement,
  optional: boolean,
): Promise<BoundCapability | null> {
  const list = optional
    ? capsule.manifest.optionalRequires
    : capsule.manifest.requires;
  const requirementIndex = list.findIndex(
    (r) => canonical(r) === canonical(requirement),
  );
  check(requirementIndex >= 0, 'PERMISSION_DENIED');
  const result = await channel.request(
    { kind: 'bind', scopeId, requirementIndex, optional },
    ['bound', 'absent'],
  );
  if (result.kind === 'absent') {
    check(optional, 'UNAVAILABLE');
    return null;
  }
  check(result.kind === 'bound', 'UNAUTHENTICATED');
  const make = (
    endpoint: WorkerEndpoint,
    wireId: number,
    operation: string,
    input: Value,
    options: CallOptions,
  ): Message => {
    check(Number.isSafeInteger(options.deadlineMs));
    check(!options.signal?.aborted, 'CANCELLED');
    const requestedMs = Math.floor(
      Math.min(
        options.deadlineMs - Date.now(),
        endpoint.end - performance.now(),
        capsule.runtime.maxCallMs,
      ),
    );
    check(requestedMs > 0, 'DEADLINE_EXCEEDED');
    check(requirement.operations.includes(operation), 'PERMISSION_DENIED');
    return {
      tag: 'request',
      body: {
        kind: 'outbound',
        wireId,
        handleId: result.handleId,
        requestedMs,
        call: {
          requestId: randomUUID(),
          capabilityId: requirement.capabilityId,
          descriptorDigest: result.descriptorDigest,
          operation,
          deadlineMs: options.deadlineMs,
          payload: detach(input),
          ...(options.idempotencyKey === undefined
            ? {}
            : { idempotencyKey: options.idempotencyKey }),
        },
      },
    };
  };
  return scopedObject(scopeId, {
    descriptorDigest: result.descriptorDigest,
    negotiatedFeatures: Object.freeze([...result.negotiatedFeatures]),
    call: async (operation: string, input: Value, options: CallOptions) => {
      const endpoint = channel.current();
      let requestId: string | undefined;
      const frame = await exchanges.exchange(
        endpoint,
        (wireId) => {
          const message = make(endpoint, wireId, operation, input, options);
          if (message.body && 'call' in message.body)
            requestId = message.body.call.requestId;
          return message;
        },
        (f) =>
          f.tag === 'response' &&
          ((f.body.kind === 'invoke' &&
            f.body.response.requestId === requestId) ||
            f.body.kind === 'control-error'),
        options,
      );
      check(frame.tag === 'response', 'UNAUTHENTICATED');
      if (frame.body.kind === 'control-error')
        throw new AcapError(frame.body.error.code);
      check(frame.body.kind === 'invoke', 'UNAUTHENTICATED');
      if (frame.body.response.result.kind === 'error')
        throw new AcapError(frame.body.response.result.error.code);
      check(
        frame.body.response.result.value !== undefined,
        'CONTRACT_MISMATCH',
      );
      return frame.body.response.result.value;
    },
    stream: (operation: string, input: Value, options: CallOptions) => {
      const endpoint = channel.current();
      return exchanges.stream(
        endpoint,
        (wireId) => make(endpoint, wireId, operation, input, options),
        options,
      );
    },
  });
}
transport.onFrame = (endpoint, frame) => {
  if (frame.tag === 'cancel') {
    const invocation = invocations.get(endpoint);
    if (invocation?.wireId === frame.body.wireId) {
      invocation.controller.abort(frame.body.reason);
      return;
    }
  }
  // Control-error for an odd outbound ID belongs to the call map, not SDK RPC.
  if (
    !(
      frame.tag === 'response' &&
      frame.body.kind === 'control-error' &&
      frame.body.wireId % 2
    ) &&
    channel.handle(endpoint, frame)
  )
    return;
  if (exchanges.handle(endpoint, frame)) return;
  if (frame.tag === 'event' && frame.body.kind === 'deliver') {
    check(
      endpoint.offer.purpose === 'event' && !inbound.has(endpoint),
      'UNAUTHENTICATED',
    );
    inbound.add(endpoint);
    const body = frame.body;
    const handler = subscriptions.get(body.subscriptionId);
    check(handler, 'UNAUTHENTICATED');
    void channel.run(endpoint, async () => {
      try {
        const data = body.envelope.data;
        check(data !== undefined, 'CONTRACT_MISMATCH');
        await handler(detach({ ...body.envelope, data }));
        reply(endpoint, {
          tag: 'request',
          body: {
            kind: 'event-ack',
            wireId: 1,
            subscriptionId: body.subscriptionId,
            eventId: body.envelope.eventId,
          },
        });
      } catch (error) {
        reply(endpoint, { tag: 'error', body: { error: errorRecord(error) } });
      }
    });
    return;
  }
  check(frame.tag === 'request', 'UNAUTHENTICATED');
  const body = frame.body;
  if (body.kind === 'lifecycle') {
    check(
      endpoint.offer.purpose === 'lifecycle' && !inbound.has(endpoint),
      'UNAUTHENTICATED',
    );
    inbound.add(endpoint);
    void channel.run(endpoint, async () => {
      try {
        if (body.action === 'activate') {
          check(!activationStarted && !disposed, 'FAILED_PRECONDITION');
          activationStarted = true;
          const module = await linkPackage(
            capsule.manifest.entrypoint,
            capsule.hello.packageDigest,
            new Map(capsule.modules),
          );
          // No V8 timeout watchdog thread after seccomp: broker pidfd supervision
          // bounds uncooperative evaluation/activation in the physical process.
          await module.evaluate();
          const ns = module.namespace as unknown as {
            activate?: (context: KernelContext) => Promise<void>;
          };
          check(typeof ns.activate === 'function', 'FAILED_PRECONDITION');
          await ns.activate(
            context(accepted.body.rootScopeId, accepted.body.scopeGeneration),
          );
          activated = true;
          reply(endpoint, {
            tag: 'response',
            body: { kind: 'activated', wireId: body.wireId },
          });
        } else if (body.action === 'quiesce') {
          disposed = true;
          reply(endpoint, {
            tag: 'response',
            body: { kind: 'quiesced', wireId: body.wireId },
          });
        } else {
          disposed = true;
          registrations.clear();
          subscriptions.clear();
          contexts.clear();
          reply(endpoint, {
            tag: 'response',
            body: {
              kind: 'disposed',
              wireId: body.wireId,
              report: {
                state: 'DISPOSED',
                completedDisposers: 0,
                failedDisposers: [],
                timedOutResources: 0,
                restartRequired: false,
              },
            },
          });
        }
      } catch (error) {
        reply(endpoint, {
          tag: 'response',
          body: {
            kind: 'lifecycle-error',
            wireId: body.wireId,
            error: errorRecord(error),
          },
        });
      }
    });
    return;
  }
  check(
    body.kind === 'invoke' &&
      endpoint.offer.purpose === 'invoke' &&
      !inbound.has(endpoint),
    'UNAUTHENTICATED',
  );
  inbound.add(endpoint);
  check(activated && !disposed, 'UNAVAILABLE');
  const registration = registrations.get(body.registrationId);
  check(registration, 'UNAUTHENTICATED');
  check(
    digest(registration.descriptor) === body.call.descriptorDigest &&
      registration.descriptor.id === body.call.capabilityId,
    'CONTRACT_MISMATCH',
  );
  const operation = registration.descriptor.operations.find(
    (o) => o.name === body.call.operation,
  );
  check(operation, 'CONTRACT_MISMATCH');
  const controller = new AbortController();
  if (operation.kind === 'unary')
    invocations.set(endpoint, { wireId: body.wireId, controller });
  const opContext: OperationContext = Object.freeze({
    requestId: body.call.requestId,
    deadlineMs: Math.min(body.call.deadlineMs, Date.now() + body.remainingMs),
    signal: AbortSignal.any([endpoint.controller.signal, controller.signal]),
    caller: Object.freeze({
      principal: body.caller.principal,
      instanceId: body.caller.instanceId,
      scope: body.caller.scope,
    }),
    scopeGeneration: body.caller.scopeGeneration,
    ...(body.call.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: body.call.idempotencyKey }),
  });
  const handler = registration.handlers[operation.name]!;
  if (operation.kind === 'stream')
    channel.run(endpoint, () =>
      exchanges.produce(endpoint, body.wireId, (signal) => {
        payload(operation.input, body.call.payload);
        const input = body.call.payload;
        check(input !== undefined, 'CONTRACT_MISMATCH');
        const values = handler(input, {
          ...opContext,
          signal,
        }) as AsyncIterable<Value>;
        return (async function* () {
          for await (const value of values) {
            const copy = detach(value);
            payload(operation.output, copy);
            yield copy;
          }
        })();
      }),
    );
  else
    void channel.run(endpoint, async () => {
      try {
        payload(operation.input, body.call.payload);
        const input = body.call.payload;
        check(input !== undefined, 'CONTRACT_MISMATCH');
        const value = detach((await handler(input, opContext)) as Value);
        try {
          payload(operation.output, value);
        } catch {
          throw new AcapError('CONTRACT_MISMATCH');
        }
        reply(endpoint, {
          tag: 'response',
          body: {
            kind: 'invoke',
            wireId: body.wireId,
            response: {
              requestId: body.call.requestId,
              result: { kind: 'success', value },
            },
          },
        });
      } catch (error) {
        reply(endpoint, {
          tag: 'response',
          body: {
            kind: 'invoke',
            wireId: body.wireId,
            response: {
              requestId: body.call.requestId,
              result: { kind: 'error', error: errorRecord(error) },
            },
          },
        });
      } finally {
        invocations.delete(endpoint);
      }
    });
};
