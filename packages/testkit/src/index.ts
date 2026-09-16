import type {
  KernelContext,
  Value,
  Descriptor,
  Requirement,
  Handler,
  BoundCapability,
  Disposer,
  EventDescriptor,
  EventEnvelope,
  ErrorCode,
  CleanupReport,
  Lifecycle,
} from '@alica/acap-types';
import {
  AcapError,
  check,
  detach,
  freeze,
  canonical,
  digest,
  descriptor as validateDescriptor,
  ContractProvider,
  ContractSession,
  negotiate,
  normalized,
  validateEventDescriptor,
  payload,
} from '@alica/acap-contracts';
import { createPluginContext, onceDisposer } from '@alica/plugin-sdk';
import type { Plugin, PluginContext, SafeLogRecord } from '@alica/plugin-sdk';
export type FailurePoint = 'activation' | 'revocation' | 'timeout' | 'cleanup';
export interface Permissions {
  capabilities?: Record<string, string[]>;
  publish?: string[];
  subscribe?: string[];
  secrets?: string[];
  scopes?: string[];
}
export interface InstanceOptions {
  id: string;
  scope?: string;
  permissions?: Permissions;
}
export interface TestOptions {
  events?: EventDescriptor[];
  secrets?: Record<string, string>;
  activationMs?: number;
  cleanupMs?: number;
  eventQueue?: number;
}
export interface Diagnostic {
  sequence: number;
  instanceId: string;
  event: string;
  code?: ErrorCode;
}
export interface TestInstance {
  readonly id: string;
  readonly state: Lifecycle;
  readonly context: PluginContext;
  failNext(point: FailurePoint, code?: ErrorCode): void;
  activate(plugin: Plugin): Promise<void>;
  dispose(): Promise<CleanupReport>;
}
interface Scope {
  id: string;
  parent: string | null;
  live: boolean;
}
interface Owned {
  scope: string;
  dispose: Disposer;
}
interface Registration {
  i: TestInstance;
  scope: string;
  provider: ContractProvider;
  live: boolean;
}
interface Subscription {
  i: TestInstance;
  scope: string;
  type: string;
  live: boolean;
  handler: (e: EventEnvelope) => Promise<void>;
  queue: { event: EventEnvelope; source: TestInstance }[];
  working: boolean;
}
interface IS {
  cell: TestCell;
  instanceId: string;
  state: Lifecycle;
  scope: string;
  permissions: Permissions;
  revision: number;
  revoked: boolean;
  effects: Owned[];
  failures: Map<FailurePoint, ErrorCode[]>;
  report: CleanupReport;
  disposal?: Promise<CleanupReport>;
  sequence: number;
}
interface CS {
  options: Required<TestOptions>;
  instances: Set<TestInstance>;
  scopes: Map<string, Scope>;
  providers: Set<Registration>;
  subscriptions: Set<Subscription>;
  pending: Set<{
    caller: TestInstance;
    provider: TestInstance;
    scope: string;
    cancel: (code: ErrorCode) => void;
  }>;
  tasks: Map<Promise<void>, TestInstance>;
  events: Map<string, EventDescriptor>;
  counter: number;
  trace: Diagnostic[];
  lost: number;
  closed: boolean;
}
const cells = new WeakMap<TestCell, CS>(),
  instances = new WeakMap<TestInstance, IS>();
function state(cell: TestCell): CS {
  const s = cells.get(cell);
  check(s, 'FAILED_PRECONDITION');
  return s;
}
function info(i: TestInstance): IS {
  const s = instances.get(i);
  check(s, 'FAILED_PRECONDITION');
  return s;
}
function trace(i: TestInstance, event: string, code?: ErrorCode): void {
  const s = state(info(i).cell);
  if (s.trace.length === 1024) {
    s.trace.shift();
    s.lost++;
  }
  s.trace.push({
    sequence: ++s.counter,
    instanceId: i.id,
    event,
    ...(code ? { code } : {}),
  });
}
function live(i: TestInstance, scope: string): void {
  const s = info(i),
    c = state(s.cell);
  check(
    !c.closed &&
      ['ACTIVATING', 'ACTIVE'].includes(s.state) &&
      c.scopes.get(scope)?.live,
    'UNAVAILABLE',
  );
}
function visible(c: CS, parent: string, child: string): boolean {
  let s = c.scopes.get(child);
  while (s) {
    if (!s.live) return false;
    if (s.id === parent) return true;
    s = s.parent ? c.scopes.get(s.parent) : undefined;
  }
  return false;
}
function consume(i: TestInstance, point: FailurePoint): ErrorCode | undefined {
  const s = info(i);
  const code = s.failures.get(point)?.shift();
  if (code) trace(i, 'injected:' + point, code);
  return code;
}
function guard(
  i: TestInstance,
  scope: string,
  kind: 'capabilities' | 'publish' | 'subscribe' | 'secrets',
  name: string,
  operations: string[] = [],
): void {
  live(i, scope);
  const s = info(i);
  if (consume(i, 'revocation')) s.cell.revoke(i);
  check(
    !s.revoked && (s.permissions.scopes ?? [s.scope]).includes(scope),
    'PERMISSION_DENIED',
  );
  if (kind === 'capabilities')
    check(
      operations.every((op) =>
        s.permissions.capabilities?.[name]?.includes(op),
      ),
      'PERMISSION_DENIED',
    );
  else check(s.permissions[kind]?.includes(name), 'PERMISSION_DENIED');
  const injected = consume(i, 'timeout');
  if (injected) throw new AcapError(injected);
}
async function bounded<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AcapError('DEADLINE_EXCEEDED')),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function own(i: TestInstance, scope: string, dispose: Disposer): Disposer {
  live(i, scope);
  const s = info(i);
  check(s.effects.length < 256, 'RESOURCE_EXHAUSTED');
  const once = onceDisposer(dispose);
  s.effects.push({ scope, dispose: once });
  return once;
}
function revokePending(c: CS, i: TestInstance, code: ErrorCode): void {
  for (const p of [...c.pending])
    if (p.caller === i || p.provider === i) p.cancel(code);
}
async function cleanup(i: TestInstance, owned: Owned[]): Promise<void> {
  const s = info(i);
  for (const effect of [...owned].reverse()) {
    try {
      await bounded(effect.dispose, state(s.cell).options.cleanupMs);
      const injected = consume(i, 'cleanup');
      if (injected) throw new AcapError(injected);
      s.report.completedDisposers++;
    } catch (e) {
      const code = normalized(e).code;
      s.report.failedDisposers.push(code);
      s.report.restartRequired = true;
      if (code === 'DEADLINE_EXCEEDED') s.report.timedOutResources++;
      trace(i, 'cleanup-failure', code);
    }
  }
}
function context(i: TestInstance, scope: string): KernelContext {
  const c = state(info(i).cell);
  async function bind(
    r: Requirement,
    optional: boolean,
  ): Promise<BoundCapability | null> {
    guard(i, scope, 'capabilities', r.capabilityId, r.operations);
    const candidates = [...c.providers].filter(
      (p) =>
        p.live &&
        info(p.i).state === 'ACTIVE' &&
        p.provider.descriptor.id === r.capabilityId &&
        visible(c, p.scope, scope),
    );
    if (!candidates.length) {
      if (optional) return null;
      throw new AcapError('NOT_FOUND');
    }
    const compatible = candidates.filter((p) => {
      try {
        negotiate(p.provider.descriptor, r);
        return true;
      } catch (e) {
        if (normalized(e).code === 'INCOMPATIBLE_VERSION') return false;
        throw e;
      }
    });
    check(compatible.length, 'INCOMPATIBLE_VERSION');
    check(compatible.length === 1, 'CONFLICT');
    const p = compatible[0]!,
      revision = info(i).revision;
    const session = new ContractSession(p.provider, {
      caller: { principal: i.id, instanceId: info(i).instanceId, scope },
      scopeGeneration: 1,
      authorize(operation) {
        check(info(i).state === 'ACTIVE', 'FAILED_PRECONDITION');
        guard(i, scope, 'capabilities', r.capabilityId, r.operations);
        check(info(i).revision === revision, 'PERMISSION_DENIED');
        check(
          p.live && info(p.i).state === 'ACTIVE' && visible(c, p.scope, scope),
          'UNAVAILABLE',
        );
        if (operation)
          check(r.operations.includes(operation), 'PERMISSION_DENIED');
      },
      admit(cancel) {
        const pending = { caller: i, provider: p.i, scope, cancel };
        c.pending.add(pending);
        return () => {
          c.pending.delete(pending);
        };
      },
    });
    own(i, scope, async () => session.close());
    return Object.freeze({
      descriptorDigest: p.provider.descriptorDigest,
      negotiatedFeatures: Object.freeze(
        negotiate(p.provider.descriptor, r).negotiatedFeatures,
      ),
      call: session.call.bind(session),
      stream: session.openStream.bind(session),
    });
  }
  return Object.freeze({
    principal: i.id,
    instanceId: info(i).instanceId,
    scope,
    scopeGeneration: 1,
    provide(d: Descriptor, handlers: Record<string, Handler>) {
      live(i, scope);
      const checked = validateDescriptor(canonical(d));
      check(
        ![...c.providers].some(
          (p) =>
            p.live && p.scope === scope && p.provider.descriptor.id === d.id,
        ),
        'CONFLICT',
      );
      const entry = {
        i,
        scope,
        provider: new ContractProvider(checked, handlers),
        live: true,
      };
      c.providers.add(entry);
      return own(i, scope, async () => {
        entry.live = false;
        entry.provider.close();
        c.providers.delete(entry);
        revokePending(c, i, 'UNAVAILABLE');
      });
    },
    require: async (r: Requirement) => {
      const h = await bind(detach(r), false);
      check(h, 'NOT_FOUND');
      return h;
    },
    optional: async (r: Requirement) => {
      check(info(i).state === 'ACTIVE', 'FAILED_PRECONDITION');
      return bind(detach(r), true);
    },
    async effect<T>(
      acquire: (register: (dispose: Disposer) => void) => Promise<T>,
    ): Promise<T> {
      live(i, scope);
      const owned: Owned[] = [];
      let accepting = true;
      try {
        const result = await bounded(
          () =>
            acquire((dispose) => {
              check(accepting, 'FAILED_PRECONDITION');
              own(i, scope, dispose);
              owned.push(info(i).effects.at(-1)!);
            }),
          c.options.activationMs,
        );
        live(i, scope);
        return result;
      } catch (e) {
        accepting = false;
        info(i).effects = info(i).effects.filter((e) => !owned.includes(e));
        await cleanup(i, owned);
        throw normalized(e);
      } finally {
        accepting = false;
      }
    },
    async secret(ref: string) {
      guard(i, scope, 'secrets', ref);
      check(Object.hasOwn(c.options.secrets, ref), 'NOT_FOUND');
      return c.options.secrets[ref]!;
    },
    on(type: string, handler: (event: EventEnvelope) => Promise<void>) {
      guard(i, scope, 'subscribe', type);
      check(c.events.has(type), 'NOT_FOUND');
      const sub: Subscription = {
        i,
        scope,
        type,
        handler,
        queue: [],
        working: false,
        live: true,
      };
      c.subscriptions.add(sub);
      return own(i, scope, async () => {
        sub.live = false;
        sub.queue = [];
        c.subscriptions.delete(sub);
      });
    },
    async emit(type: string, data: Value) {
      guard(i, scope, 'publish', type);
      check(info(i).state === 'ACTIVE', 'FAILED_PRECONDITION');
      const d = c.events.get(type);
      check(d, 'NOT_FOUND');
      payload(d.payload, data);
      const e: EventEnvelope = {
        eventId: 'e' + ++c.counter,
        type,
        contractDigest: digest(d),
        sourceProvider: i.id,
        sourceScope: scope,
        sourceInstanceId: info(i).instanceId,
        scopeGeneration: 1,
        sequence: ++info(i).sequence,
        timeMs: Date.now(),
        data: detach(data),
      };
      let admitted = 0;
      for (const sub of c.subscriptions) {
        if (
          !sub.live ||
          info(sub.i).state !== 'ACTIVE' ||
          sub.type !== type ||
          !visible(c, scope, sub.scope)
        )
          continue;
        try {
          guard(sub.i, sub.scope, 'subscribe', type);
        } catch {
          continue;
        }
        if (sub.queue.length >= c.options.eventQueue) {
          sub.live = false;
          sub.queue = [];
          trace(sub.i, 'event-overflow', 'RESOURCE_EXHAUSTED');
          continue;
        }
        sub.queue.push({ event: detach(e), source: i });
        admitted++;
        drain(c, sub);
      }
      return { admitted };
    },
    createScope() {
      live(i, scope);
      check(c.scopes.size < 256, 'RESOURCE_EXHAUSTED');
      const id = 'scope' + ++c.counter;
      c.scopes.set(id, { id, parent: scope, live: true });
      own(i, scope, async () => {
        await info(i).cell.destroyScope(id);
      });
      return context(i, id);
    },
    log(record: SafeLogRecord) {
      live(i, scope);
      check(record && Object.keys(record).sort().join(',') === 'event,level');
      check(
        ['info', 'warn', 'error'].includes(record.level) &&
          ['checkpoint', 'warning', 'failure'].includes(record.event),
      );
      trace(i, 'log:' + record.level + ':' + record.event);
    },
  });
}
function drain(c: CS, sub: Subscription): void {
  if (sub.working) return;
  sub.working = true;
  const work = Promise.resolve().then(async () => {
    try {
      while (sub.live && sub.queue.length) {
        const next = sub.queue.shift()!;
        guard(sub.i, sub.scope, 'subscribe', sub.type);
        guard(next.source, next.event.sourceScope, 'publish', sub.type);
        await sub.handler(freeze(detach(next.event)));
      }
    } catch (e) {
      sub.live = false;
      sub.queue = [];
      trace(sub.i, 'event-failure', normalized(e).code);
    } finally {
      sub.working = false;
    }
  });
  c.tasks.set(work, sub.i);
  void work.finally(() => c.tasks.delete(work));
}
class Instance implements TestInstance {
  readonly context: PluginContext;
  constructor(
    readonly id: string,
    cell: TestCell,
    options: InstanceOptions,
  ) {
    const scope = options.scope ?? 'root';
    check(state(cell).scopes.get(scope)?.live, 'NOT_FOUND');
    instances.set(this, {
      cell,
      instanceId: 'i' + ++state(cell).counter,
      state: 'DISCOVERED',
      scope,
      permissions: detach(options.permissions ?? {}),
      revision: 1,
      revoked: false,
      effects: [],
      failures: new Map(),
      report: {
        state: 'DISCOVERED',
        completedDisposers: 0,
        failedDisposers: [],
        timedOutResources: 0,
        restartRequired: false,
      },
      sequence: 0,
    });
    this.context = createPluginContext(context(this, scope));
  }
  get state(): Lifecycle {
    return info(this).state;
  }
  failNext(point: FailurePoint, code?: ErrorCode): void {
    check(['activation', 'revocation', 'timeout', 'cleanup'].includes(point));
    const s = info(this);
    const q = s.failures.get(point) ?? [];
    check(q.length < 64, 'RESOURCE_EXHAUSTED');
    const defaults = {
      activation: 'INTERNAL',
      revocation: 'PERMISSION_DENIED',
      timeout: 'DEADLINE_EXCEEDED',
      cleanup: 'INTERNAL',
    } as const;
    q.push(code ?? defaults[point]);
    s.failures.set(point, q);
  }
  async activate(plugin: Plugin): Promise<void> {
    const s = info(this);
    check(s.state === 'DISCOVERED', 'FAILED_PRECONDITION');
    s.state = 'ACTIVATING';
    try {
      await bounded(
        () => plugin.activate(this.context),
        state(s.cell).options.activationMs,
      );
      const injected = consume(this, 'activation');
      if (injected) throw new AcapError(injected);
      check(s.state === 'ACTIVATING', 'UNAVAILABLE');
      s.state = 'ACTIVE';
      trace(this, 'active');
    } catch (e) {
      s.state = 'QUIESCING';
      revokePending(state(s.cell), this, 'UNAVAILABLE');
      await cleanup(this, s.effects.splice(0));
      s.state = 'FAILED';
      s.report.state = 'FAILED';
      if (normalized(e).code === 'DEADLINE_EXCEEDED') {
        s.report.restartRequired = true;
        s.report.timedOutResources++;
      }
      trace(this, 'activation-failure', normalized(e).code);
      throw normalized(e);
    }
  }
  dispose(): Promise<CleanupReport> {
    const s = info(this);
    return (s.disposal ??= Promise.resolve().then(async () => {
      if (s.state === 'FAILED') return freeze(detach(s.report));
      s.state = 'QUIESCING';
      revokePending(state(s.cell), this, 'UNAVAILABLE');
      await cleanup(this, s.effects.splice(0));
      const tasks = [...state(s.cell).tasks]
        .filter(([, owner]) => owner === this)
        .map(([task]) => task);
      if (tasks.length)
        try {
          await bounded(
            () => Promise.all(tasks).then(() => {}),
            state(s.cell).options.cleanupMs,
          );
        } catch (e) {
          s.report.restartRequired = true;
          s.report.timedOutResources++;
          s.report.failedDisposers.push(normalized(e).code);
        }
      s.state =
        s.report.failedDisposers.length || s.report.restartRequired
          ? 'FAILED'
          : 'DISPOSED';
      s.report.state = s.state;
      trace(this, 'disposed');
      return freeze(detach(s.report));
    }));
  }
}
export class TestCell {
  constructor(options: TestOptions = {}) {
    const full: Required<TestOptions> = {
      events: [],
      secrets: {},
      activationMs: 1000,
      cleanupMs: 50,
      eventQueue: 4,
      ...detach(options),
    };
    for (const n of [full.activationMs, full.cleanupMs])
      check(Number.isSafeInteger(n) && n > 0 && n <= 30000);
    check(
      Number.isSafeInteger(full.eventQueue) &&
        full.eventQueue > 0 &&
        full.eventQueue <= 256,
    );
    const events = new Map<string, EventDescriptor>();
    for (const d of full.events) {
      check(!events.has(d.id), 'CONFLICT');
      events.set(d.id, validateEventDescriptor(canonical(d)));
    }
    cells.set(this, {
      options: full,
      instances: new Set(),
      scopes: new Map([['root', { id: 'root', parent: null, live: true }]]),
      providers: new Set(),
      subscriptions: new Set(),
      pending: new Set(),
      tasks: new Map(),
      events,
      counter: 0,
      trace: [],
      lost: 0,
      closed: false,
    });
  }
  instance(options: InstanceOptions): TestInstance {
    const s = state(this);
    check(!s.closed, 'UNAVAILABLE');
    check(
      /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/.test(options.id) &&
        ![...s.instances].some((i) => i.id === options.id),
      'CONFLICT',
    );
    check(s.instances.size < 256, 'RESOURCE_EXHAUSTED');
    const i = new Instance(options.id, this, options);
    s.instances.add(i);
    return i;
  }
  revoke(i: TestInstance): void {
    const s = info(i);
    check(s.cell === this, 'INVALID_ARGUMENT');
    s.revoked = true;
    s.revision++;
    revokePending(state(this), i, 'PERMISSION_DENIED');
    trace(i, 'revoked');
  }
  grantScope(i: TestInstance, scope: string): void {
    const s = info(i);
    check(
      s.cell === this && state(this).scopes.get(scope)?.live,
      'INVALID_ARGUMENT',
    );
    s.permissions.scopes = [
      ...new Set([...(s.permissions.scopes ?? [s.scope]), scope]),
    ];
  }
  async destroyScope(scope: string): Promise<void> {
    const c = state(this);
    check(scope !== 'root', 'PERMISSION_DENIED');
    const scopeInfo = c.scopes.get(scope);
    check(scopeInfo, 'NOT_FOUND');
    if (!scopeInfo.live) return;
    const affected = [...c.scopes.keys()].filter((id) => visible(c, scope, id));
    for (const id of affected) c.scopes.get(id)!.live = false;
    for (const pending of [...c.pending])
      if (affected.includes(pending.scope)) pending.cancel('UNAVAILABLE');
    for (const i of c.instances) {
      const s = info(i);
      const effects = s.effects.filter((e) => affected.includes(e.scope));
      s.effects = s.effects.filter((e) => !affected.includes(e.scope));
      await cleanup(i, effects);
    }
  }
  async flush(): Promise<void> {
    const s = state(this);
    await bounded(async () => {
      while (s.tasks.size) await Promise.all([...s.tasks.keys()]);
    }, s.options.activationMs);
  }
  inspect(): Readonly<{
    instances: { id: string; state: Lifecycle }[];
    providers: number;
    subscriptions: number;
    pending: number;
    diagnostics: Diagnostic[];
    droppedDiagnostics: number;
  }> {
    const s = state(this);
    return freeze(
      detach({
        instances: [...s.instances].map((i) => ({ id: i.id, state: i.state })),
        providers: s.providers.size,
        subscriptions: [...s.subscriptions].filter((x) => x.live).length,
        pending: s.pending.size,
        diagnostics: s.trace,
        droppedDiagnostics: s.lost,
      }),
    );
  }
  async close(): Promise<CleanupReport[]> {
    const s = state(this);
    const reports: CleanupReport[] = [];
    for (const i of [...s.instances].reverse()) reports.push(await i.dispose());
    s.closed = true;
    return reports;
  }
}
export function createTestCell(options: TestOptions = {}): TestCell {
  return new TestCell(options);
}
