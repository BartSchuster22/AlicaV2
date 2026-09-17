import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, realpathSync } from 'node:fs';
import {
  AcapError,
  check,
  canonical,
  digest,
  errorRecord,
} from '@alica/acap-contracts';
import type {
  KernelContext,
  Handler,
  Descriptor,
  Disposer,
  OperationContext,
  Value,
  BoundCapability,
  EventEnvelope,
} from '@alica/acap-types';
import type { Config } from '../index.js';
import type { VerifiedPackage } from '../trust.js';
import {
  causalContext,
  callAuthority,
  cleanupSelection,
} from '../execution-context.js';
import { PhysicalSession } from './session.js';
import { BrokerEffects } from './broker-effects.js';
import type { EffectScope } from './broker-effects.js';
import { Exchanges } from './exchange.js';
import type { Message } from './exchange.js';
import { WorkContext } from './scheduler.js';
import type { Purpose } from './scheduler.js';
import type { NativeStream } from './stream.js';
import type { Frame } from './wire.js';
import type { request, response } from './wire-schema.js';

export interface HostAuthority {
  config: Config;
  pkg: VerifiedPackage;
  instanceId: string;
  scope: EffectScope;
  runtimeDirectory: string;
  fresh(): void;
  context(scope: EffectScope): KernelContext;
  resolveScope(id: string, generation?: number): EffectScope;
  own(scope: EffectScope, cleanup: Disposer, select?: () => void): Disposer;
  failed(): void;
  descriptor(hash: string): Descriptor;
}
interface Endpoint {
  context: WorkContext;
  stream: NativeStream;
}
type Control = Extract<response['body'], { kind: 'control' }>['value'];
/** One adapter and one authenticated process per Host instance. All registration,
 * binding, grants, secrets, events and effect accounting delegate to Host. */
export class HostIPC {
  readonly session: PhysicalSession;
  readonly exchanges: Exchanges<Endpoint>;
  readonly effects: BrokerEffects<Endpoint>;
  #endpoints = new Map<WorkContext, Endpoint>();
  #sequence = new WeakMap<Endpoint, number>();
  #knownScopes = new Map<string, EffectScope>();
  #registrations = new Map<string, { scope: EffectScope; dispose: Disposer }>();
  #subscriptions = new Map<string, { scope: EffectScope; dispose: Disposer }>();
  #handles = new Map<
    string,
    {
      scope: EffectScope;
      bound: BoundCapability;
      requirementIndex: number;
      optional: boolean;
    }
  >();
  #requests = new WeakMap<Endpoint, Set<number>>();
  #requestWater = new WeakMap<Endpoint, { even: number; odd: number }>();
  #pending = 0;
  #outbound = new WeakMap<Endpoint, Map<number, AbortController>>();
  #events = new Map<
    Endpoint,
    {
      subscriptionId: string;
      eventId: string;
      resolve: () => void;
      reject: (e: unknown) => void;
    }
  >();
  #lifecycle: Endpoint | undefined;
  #cleanupTail: Promise<void> = Promise.resolve();
  #queuedCleanup = 0;
  #unloadEnd = Infinity;
  #unloadTimer: ReturnType<typeof setTimeout> | undefined;
  #taskOpening = false;
  #taskWater = 0;
  #tasks = new WeakMap<Endpoint, number>();
  constructor(readonly host: HostAuthority) {
    const root = fileURLToPath(new URL('../../../../', import.meta.url));
    const runtimePackages = [
      'kernel',
      'plugin-sdk',
      'acap-contracts',
      'acap-types',
    ];
    const dependencies = [
      'ajv',
      'fast-deep-equal',
      'fast-uri',
      'json-schema-traverse',
      'require-from-string',
    ];
    const readPaths = [
      dirname(process.execPath),
      join(root, 'native/g6/build'),
      join(root, 'package.json'),
      ...runtimePackages.flatMap((name) => [
        join(root, 'packages', name, 'dist'),
        join(root, 'packages', name, 'package.json'),
      ]),
      ...dependencies.map((name) => join(root, 'node_modules', name)),
      '/usr/lib',
      '/lib',
      '/lib64',
      '/dev/null',
    ]
      .filter(existsSync)
      .map((p) => realpathSync(p));
    this.#knownScopes.set(host.scope.id, host.scope);
    this.session = new PhysicalSession({
      root,
      runtimeDirectory: host.runtimeDirectory,
      node: process.execPath,
      worker: join(root, 'packages/kernel/dist/g6/worker-entry.js'),
      readPaths,
      cellId: host.config.cellId,
      instanceId: host.instanceId,
      scopeId: host.scope.id,
      scopeGeneration: host.scope.generation,
      generation: 1,
      maxEffects: host.config.maxEffects,
      pkg: host.pkg,
      fresh: host.fresh,
      runtime: {
        activationMs: host.config.activationMs,
        maxCallMs: host.config.maxCallMs,
      },
    });
    this.exchanges = new Exchanges(
      (e, f) => this.send(e, f),
      (e) => ({ signal: e.context.controller.signal, end: e.context.end }),
      () => this.session.fail(),
    );
    this.effects = new BrokerEffects({
      registerScope: (e, id, generation) => {
        e.context.assertLive();
        return this.scope(id, generation);
      },
      releaseScope: (e, scope) => {
        e.context.assertLive();
        check(this.#knownScopes.get(scope.id) === scope, 'PERMISSION_DENIED');
      },
      own: (scope, cleanup, select) => host.own(scope, cleanup, select),
      dispatch: (effectId, callbackId, scope, inline) =>
        this.cleanup(effectId, callbackId, scope, inline),
      failSession: () => this.session.fail(),
    });
    this.session.onFrame = (context, frame, stream) => {
      const endpoint = this.#endpoints.get(context);
      check(endpoint && endpoint.stream === stream, 'UNAUTHENTICATED');
      this.receive(endpoint, frame);
    };
    this.session.onFailure = () => host.failed();
    this.session.onTask = (frame) => {
      check(frame.body.kind === 'task-open', 'UNAUTHENTICATED');
      const body = frame.body;
      check(body.wireId > this.#taskWater, 'UNAUTHENTICATED');
      this.#taskWater = body.wireId;
      if (this.#taskOpening) {
        this.session.controlReply({
          kind: 'control-error',
          wireId: body.wireId,
          error: errorRecord(new AcapError('RESOURCE_EXHAUSTED')),
        });
        return;
      }
      this.#taskOpening = true;
      void causalContext.run(undefined as never, async () => {
        try {
          const scope = this.scope(body.scopeId);
          this.host.context(scope);
          const endpoint = await this.open(
            scope,
            'provider-task',
            Math.min(body.requestedMs, this.host.config.maxCallMs),
            undefined,
            () => {
              this.host.context(scope);
            },
          );
          this.#tasks.set(endpoint, body.wireId);
          this.session.controlReply({
            kind: 'control',
            wireId: body.wireId,
            value: { kind: 'ack' },
          });
        } catch (error) {
          if (this.session.active)
            this.session.controlReply({
              kind: 'control-error',
              wireId: body.wireId,
              error: errorRecord(error),
            });
        } finally {
          this.#taskOpening = false;
        }
      });
    };
  }
  private scope(id: string, generation?: number): EffectScope {
    const known = this.#knownScopes.get(id);
    check(
      known && (generation === undefined || generation === known.generation),
      'PERMISSION_DENIED',
    );
    const current = this.host.resolveScope(id, known.generation);
    check(current === known, 'PERMISSION_DENIED');
    return current;
  }
  private async open(
    scope: EffectScope,
    purpose: Purpose,
    ms: number,
    signal?: AbortSignal,
    authorize: () => void = this.host.fresh,
    end?: number,
  ): Promise<Endpoint> {
    const parent = causalContext.getStore();
    const endpoint = await this.session.open({
      scope: scope.id,
      purpose,
      requestedMs: Math.max(1, Math.min(30000, Math.floor(ms))),
      encodedBytes: 256,
      ...(end === undefined ? {} : { end }),
      ...(parent ? { parent } : {}),
      ...(signal ? { signal } : {}),
      authorize,
    });
    this.#endpoints.set(endpoint.context, endpoint);
    endpoint.context.controller.signal.addEventListener(
      'abort',
      () => {
        this.#endpoints.delete(endpoint.context);
        this.#events
          .get(endpoint)
          ?.reject(
            new AcapError(
              endpoint.context.terminal === 'DEADLINE_EXCEEDED'
                ? 'DEADLINE_EXCEEDED'
                : 'UNAVAILABLE',
            ),
          );
        this.#events.delete(endpoint);
      },
      { once: true },
    );
    return endpoint;
  }
  private send(endpoint: Endpoint, frame: Message): void {
    check(
      this.#endpoints.get(endpoint.context) === endpoint,
      'UNAUTHENTICATED',
    );
    const sequence = (this.#sequence.get(endpoint) ?? 0) + 1;
    check(Number.isSafeInteger(sequence), 'RESOURCE_EXHAUSTED');
    this.#sequence.set(endpoint, sequence);
    endpoint.stream.send({
      schemaVersion: 'acap.ipc/v1',
      sessionId: this.session.sessionId,
      generation: this.session.options.generation,
      contextId: endpoint.context.id,
      sequence,
      ...frame,
    } as Frame);
  }
  async activate(): Promise<void> {
    await this.session.ready;
    const endpoint = await this.open(
      this.host.scope,
      'lifecycle',
      this.host.config.activationMs,
    );
    this.#lifecycle = endpoint;
    try {
      const frame = await this.exchanges.exchange(
        endpoint,
        (wireId) => ({
          tag: 'request',
          body: {
            kind: 'lifecycle',
            wireId,
            action: 'activate',
            remainingMs: endpoint.context.remainingMs,
          },
        }),
        (f) =>
          f.tag === 'response' &&
          (f.body.kind === 'activated' || f.body.kind === 'lifecycle-error'),
      );
      if (frame.tag === 'response' && frame.body.kind === 'lifecycle-error')
        throw new AcapError(frame.body.error.code);
    } finally {
      this.#lifecycle = undefined;
      endpoint.context.finish();
    }
  }
  beginDispose(): void {
    if (this.#unloadEnd !== Infinity) return;
    this.#unloadEnd = performance.now() + 500;
    this.#unloadTimer = setTimeout(() => this.session.fail(), 500);
    // Quiesce is cooperative, but all Host authority has already been revoked.
    // It shares the one lifecycle lane and the original total unload budget.
    this.#cleanupTail = this.#cleanupTail
      .then(() => this.lifecycle('quiesce'))
      .catch(() => {});
  }
  async shutdown(): Promise<void> {
    try {
      await this.session.shutdown(async () => {
        await this.#cleanupTail;
        if (this.session.active && performance.now() < this.#unloadEnd)
          await this.lifecycle('dispose');
      });
    } finally {
      clearTimeout(this.#unloadTimer);
    }
  }
  private async lifecycle(action: 'quiesce' | 'dispose'): Promise<void> {
    if (!this.session.active || performance.now() >= this.#unloadEnd) return;
    const endpoint = await causalContext.run(undefined as never, () =>
      this.open(
        this.host.scope,
        'lifecycle',
        this.#unloadEnd - performance.now(),
      ),
    );
    this.#lifecycle = endpoint;
    try {
      const frame = await this.exchanges.exchange(
        endpoint,
        (wireId) => ({
          tag: 'request',
          body: {
            kind: 'lifecycle',
            wireId,
            action,
            remainingMs: endpoint.context.remainingMs,
          },
        }),
        (f) =>
          f.tag === 'response' &&
          (f.body.kind === (action === 'quiesce' ? 'quiesced' : 'disposed') ||
            f.body.kind === 'lifecycle-error'),
      );
      if (frame.tag === 'response' && frame.body.kind === 'lifecycle-error')
        throw new AcapError(frame.body.error.code);
    } finally {
      this.#lifecycle = undefined;
      endpoint.context.finish();
    }
  }
  private cleanup(
    effectId: string,
    callbackId: string,
    scope: EffectScope,
    inline?: Endpoint,
  ): Promise<void> {
    const end = Math.min(
      cleanupSelection.getStore()?.end ??
        performance.now() + this.host.config.cleanupMs,
      inline?.context.end ?? Infinity,
      this.#unloadEnd,
    );
    const run = async () => {
      check(performance.now() < end, 'DEADLINE_EXCEEDED');
      // The release receiver is the only ancestry authority. Overlapping
      // releases on one descriptor create siblings, never an ambient stack.
      if (inline) {
        check(
          this.#endpoints.get(inline.context) === inline,
          'UNAUTHENTICATED',
        );
        inline.context.assertLive();
      }
      const endpoint = await causalContext.run(
        inline?.context as WorkContext,
        () =>
          this.open(
            scope,
            inline ? 'invoke' : 'lifecycle',
            end - performance.now(),
            undefined,
            this.host.fresh,
            end,
          ),
      );
      try {
        const remainingMs = Math.floor(
          Math.min(end, endpoint.context.end) - performance.now(),
        );
        check(remainingMs > 0, 'DEADLINE_EXCEEDED');
        const frame = await this.exchanges.exchange(
          endpoint,
          (wireId) => ({
            tag: 'request',
            body: {
              kind: 'effect-cleanup',
              wireId,
              effectId,
              callbackId,
              remainingMs,
            },
          }),
          (f) =>
            f.tag === 'response' &&
            (f.body.kind === 'effect-cleaned' ||
              f.body.kind === 'effect-cleanup-error') &&
            f.body.effectId === effectId,
        );
        if (
          frame.tag === 'response' &&
          frame.body.kind === 'effect-cleanup-error'
        )
          throw new AcapError(frame.body.error.code);
      } finally {
        endpoint.context.finish();
      }
    };
    if (inline) return run();
    check(
      this.#queuedCleanup < this.host.config.maxScopes,
      'RESOURCE_EXHAUSTED',
    );
    this.#queuedCleanup++;
    const task = this.#cleanupTail.then(run);
    this.#cleanupTail = task.then(
      () => {},
      () => {},
    );
    void task.finally(() => this.#queuedCleanup--).catch(() => {});
    return task;
  }
  private handlers(
    scope: EffectScope,
    registrationId: string,
    descriptor: Descriptor,
  ): Record<string, Handler> {
    return Object.fromEntries(
      descriptor.operations.map((op) => [
        op.name,
        op.kind === 'unary'
          ? async (input: Value, context: OperationContext) => {
              const endpoint = await this.open(
                scope,
                'invoke',
                context.deadlineMs - Date.now(),
                context.signal,
                () => {
                  this.host.context(scope);
                },
              );
              try {
                const message = this.invocation(
                  registrationId,
                  descriptor,
                  op.name,
                  input,
                  context,
                  endpoint,
                );
                const frame = await this.exchanges.exchange(
                  endpoint,
                  (wireId) => ({
                    tag: 'request',
                    body: { ...message, wireId },
                  }),
                  (f) =>
                    f.tag === 'response' &&
                    f.body.kind === 'invoke' &&
                    f.body.response.requestId === context.requestId,
                );
                check(
                  frame.tag === 'response' && frame.body.kind === 'invoke',
                  'UNAUTHENTICATED',
                );
                if (frame.body.response.result.kind === 'error')
                  throw new AcapError(frame.body.response.result.error.code);
                check(
                  frame.body.response.result.value !== undefined,
                  'CONTRACT_MISMATCH',
                );
                return frame.body.response.result.value;
              } finally {
                endpoint.context.finish();
              }
            }
          : (input: Value, context: OperationContext) => {
              const self = this;
              return (async function* () {
                const endpoint = await self.open(
                  scope,
                  'invoke',
                  context.deadlineMs - Date.now(),
                  context.signal,
                  () => {
                    self.host.context(scope);
                  },
                );
                try {
                  const body = self.invocation(
                    registrationId,
                    descriptor,
                    op.name,
                    input,
                    context,
                    endpoint,
                  );
                  yield* self.exchanges.stream(endpoint, (wireId) => ({
                    tag: 'request',
                    body: { ...body, wireId },
                  }));
                } finally {
                  endpoint.context.finish();
                }
              })();
            },
      ]),
    );
  }
  private invocation(
    registrationId: string,
    descriptor: Descriptor,
    operation: string,
    payload: Value,
    context: OperationContext,
    endpoint: Endpoint,
  ): Omit<Extract<request['body'], { kind: 'invoke' }>, 'wireId'> {
    const authority = callAuthority.getStore();
    check(authority, 'FAILED_PRECONDITION');
    return {
      kind: 'invoke',
      registrationId,
      remainingMs: endpoint.context.remainingMs,
      caller: {
        ...context.caller,
        scopeGeneration: context.scopeGeneration!,
        ...authority,
      },
      call: {
        requestId: context.requestId,
        capabilityId: descriptor.id,
        descriptorDigest: digest(descriptor),
        operation,
        deadlineMs: context.deadlineMs,
        payload,
        ...(context.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: context.idempotencyKey }),
      },
    };
  }
  private async deliver(
    scope: EffectScope,
    subscriptionId: string,
    envelope: EventEnvelope,
  ): Promise<void> {
    const endpoint = await causalContext.run(undefined as never, () =>
      this.open(scope, 'event', 2000, undefined, () => {
        this.host.context(scope);
      }),
    );
    try {
      await new Promise<void>((resolve, reject) => {
        this.#events.set(endpoint, {
          subscriptionId,
          eventId: envelope.eventId,
          resolve,
          reject,
        });
        this.send(endpoint, {
          tag: 'event',
          body: { kind: 'deliver', subscriptionId, envelope },
        });
      });
    } finally {
      this.#events.delete(endpoint);
      endpoint.context.finish();
    }
  }
  private receive(endpoint: Endpoint, frame: Frame): void {
    if (frame.tag === 'cancel') {
      if (this.#tasks.get(endpoint) === frame.body.wireId) {
        endpoint.context.finish(frame.body.reason);
        return;
      }
      const controller = this.#outbound.get(endpoint)?.get(frame.body.wireId);
      if (controller) {
        controller.abort(frame.body.reason);
        return;
      }
    }
    if (frame.tag === 'error') {
      const event = this.#events.get(endpoint);
      check(event, 'UNAUTHENTICATED');
      this.#events.delete(endpoint);
      event.reject(new AcapError(frame.body.error.code));
      return;
    }
    if (frame.tag === 'request' && frame.body.kind === 'event-ack') {
      const wait = this.#events.get(endpoint);
      check(
        wait &&
          wait.eventId === frame.body.eventId &&
          wait.subscriptionId === frame.body.subscriptionId,
        'UNAUTHENTICATED',
      );
      this.#events.delete(endpoint);
      wait.resolve();
      return;
    }
    if (this.exchanges.handle(endpoint, frame)) return;
    check(
      frame.tag === 'request' ||
        (frame.tag === 'event' && frame.body.kind === 'publish'),
      'UNAUTHENTICATED',
    );
    const body = frame.body;
    check('wireId' in body, 'UNAUTHENTICATED');
    let requests = this.#requests.get(endpoint);
    if (!requests) this.#requests.set(endpoint, (requests = new Set()));
    let water = this.#requestWater.get(endpoint);
    if (!water) this.#requestWater.set(endpoint, (water = { even: 0, odd: 0 }));
    const origin = body.wireId % 2 ? 'odd' : 'even';
    check(
      body.wireId > water[origin] && !requests.has(body.wireId),
      'UNAUTHENTICATED',
    );
    water[origin] = body.wireId;
    check(this.#pending < 64, 'RESOURCE_EXHAUSTED');
    requests.add(body.wireId);
    this.#pending++;
    const done = () => {
      requests!.delete(body.wireId);
      this.#outbound.get(endpoint)?.delete(body.wireId);
      this.#pending--;
    };
    const reply = (value: Control) =>
      this.send(endpoint, {
        tag: 'response',
        body: { kind: 'control', wireId: body.wireId, value },
      });
    void causalContext.run(endpoint.context, async () => {
      try {
        if (frame.tag === 'event' && frame.body.kind === 'publish') {
          const b = frame.body,
            scope = this.scope(b.scopeId);
          check(
            digest(this.host.pkg.events.get(b.eventType)) ===
              b.descriptorDigest,
            'CONTRACT_MISMATCH',
          );
          const result = await this.host
            .context(scope)
            .emit(b.eventType, b.data);
          reply({ kind: 'published', admitted: result.admitted });
          return;
        }
        check(frame.tag === 'request', 'UNAUTHENTICATED');
        const b = frame.body;
        if (b.kind === 'outbound') {
          const handle = this.#handles.get(b.handleId);
          check(handle, 'PERMISSION_DENIED');
          this.scope(handle.scope.id, handle.scope.generation);
          check(
            b.call.descriptorDigest === handle.bound.descriptorDigest,
            'CONTRACT_MISMATCH',
          );
          const requirements = handle.optional
            ? this.host.pkg.manifest.optionalRequires
            : this.host.pkg.manifest.requires;
          check(
            b.call.capabilityId ===
              requirements[handle.requirementIndex]!.capabilityId,
            'PERMISSION_DENIED',
          );
          const options = {
            deadlineMs: Math.min(
              b.call.deadlineMs,
              Date.now() + b.requestedMs,
              Date.now() + endpoint.context.remainingMs,
            ),
            signal: endpoint.context.controller.signal,
            ...(b.call.idempotencyKey === undefined
              ? {}
              : { idempotencyKey: b.call.idempotencyKey }),
          };
          // A bound Host capability validates operation kind; stream kind is
          // selected from the broker's verified descriptor, never caller flags.
          const descriptor = this.host.descriptor(
            handle.bound.descriptorDigest,
          );
          const op = descriptor.operations.find(
            (x) => x.name === b.call.operation,
          );
          check(op, 'CONTRACT_MISMATCH');
          const input = b.call.payload;
          check(input !== undefined, 'CONTRACT_MISMATCH');
          if (op.kind === 'stream')
            await this.exchanges.produce(endpoint, b.wireId, (signal) =>
              handle.bound.stream(op.name, input, {
                ...options,
                signal,
              }),
            );
          else {
            const controller = new AbortController();
            let calls = this.#outbound.get(endpoint);
            if (!calls) this.#outbound.set(endpoint, (calls = new Map()));
            calls.set(b.wireId, controller);
            try {
              const value = await handle.bound.call(op.name, input, {
                ...options,
                signal: AbortSignal.any([options.signal, controller.signal]),
              });
              this.send(endpoint, {
                tag: 'response',
                body: {
                  kind: 'invoke',
                  wireId: b.wireId,
                  response: {
                    requestId: b.call.requestId,
                    result: { kind: 'success', value },
                  },
                },
              });
            } catch (error) {
              this.send(endpoint, {
                tag: 'response',
                body: {
                  kind: 'invoke',
                  wireId: b.wireId,
                  response: {
                    requestId: b.call.requestId,
                    result: { kind: 'error', error: errorRecord(error) },
                  },
                },
              });
            }
          }
          return;
        }
        reply(await this.scoped(endpoint, b));
      } catch (error) {
        if (!endpoint.context.terminal) {
          try {
            this.send(endpoint, {
              tag: 'response',
              body: {
                kind: 'control-error',
                wireId: body.wireId,
                error: errorRecord(error),
              },
            });
          } catch {
            this.session.fail();
          }
        }
      } finally {
        done();
      }
    });
  }

  private async scoped(
    endpoint: Endpoint,
    b: request['body'],
  ): Promise<Control> {
    endpoint.context.assertLive();
    switch (b.kind) {
      case 'scope-check': {
        this.host.context(this.scope(b.scopeId, b.scopeGeneration));
        return { kind: 'ack' };
      }
      case 'register': {
        const scope = this.scope(b.scopeId),
          context = this.host.context(scope);
        const descriptor = [...this.host.pkg.descriptors.values()].find(
          (d) => d.id === b.capabilityId && digest(d) === b.descriptorDigest,
        );
        check(descriptor, 'CONTRACT_MISMATCH');
        const registrationId = randomUUID();
        const dispose = context.provide(
          descriptor,
          this.handlers(scope, registrationId, descriptor),
        );
        this.#registrations.set(registrationId, { scope, dispose });
        return { kind: 'registered', registrationId };
      }
      case 'withdraw': {
        const r = this.#registrations.get(b.registrationId);
        check(r, 'PERMISSION_DENIED');
        await r.dispose();
        return { kind: 'ack' };
      }
      case 'bind': {
        const scope = this.scope(b.scopeId),
          context = this.host.context(scope);
        const req = (
          b.optional
            ? this.host.pkg.manifest.optionalRequires
            : this.host.pkg.manifest.requires
        )[b.requirementIndex];
        check(req, 'PERMISSION_DENIED');
        const bound = await (b.optional
          ? context.optional(req)
          : context.require(req));
        if (!bound) return { kind: 'absent' };
        check(this.#handles.size < 4096, 'RESOURCE_EXHAUSTED');
        const handleId = randomUUID();
        this.#handles.set(handleId, {
          scope,
          bound,
          requirementIndex: b.requirementIndex,
          optional: b.optional,
        });
        return {
          kind: 'bound',
          handleId,
          descriptorDigest: bound.descriptorDigest,
          negotiatedFeatures: [...bound.negotiatedFeatures],
        };
      }
      case 'secret':
        return {
          kind: 'secret',
          value: await this.host
            .context(this.scope(b.scopeId))
            .secret(b.reference),
        };
      case 'scope-create': {
        const child = this.host
          .context(this.scope(b.parentScopeId))
          .createScope();
        const scope = this.host.resolveScope(
          child.scope,
          child.scopeGeneration,
        );
        this.#knownScopes.set(scope.id, scope);
        return {
          kind: 'scope',
          scopeId: scope.id,
          scopeGeneration: scope.generation,
        };
      }
      case 'subscribe': {
        const scope = this.scope(b.scopeId);
        const binding = this.host.pkg.manifest.subscribedEvents.find(
          (x) => x.eventType === b.eventType,
        );
        check(
          binding?.descriptorDigest === b.descriptorDigest,
          'CONTRACT_MISMATCH',
        );
        const subscriptionId = randomUUID();
        const dispose = this.host
          .context(scope)
          .on(b.eventType, (event) =>
            this.deliver(scope, subscriptionId, event),
          );
        this.#subscriptions.set(subscriptionId, { scope, dispose });
        return { kind: 'subscribed', subscriptionId };
      }
      case 'unsubscribe': {
        const r = this.#subscriptions.get(b.subscriptionId);
        check(r, 'PERMISSION_DENIED');
        await r.dispose();
        return { kind: 'ack' };
      }
      case 'log': {
        check(b.record.level !== 'debug', 'INVALID_ARGUMENT');
        this.host
          .context(this.scope(b.scopeId, b.scopeGeneration))
          .log({ level: b.record.level, event: b.record.event });
        return { kind: 'ack' };
      }
      case 'effect-register':
        return {
          kind: 'effect-registered',
          effectId: this.effects.register(
            endpoint,
            b.scopeId,
            b.scopeGeneration,
            b.callbackId,
          ),
        };
      case 'effect-release':
        await this.effects.release(endpoint, b.effectId);
        return { kind: 'effect-released', effectId: b.effectId };
      default:
        throw new AcapError('UNAUTHENTICATED');
    }
  }
}
