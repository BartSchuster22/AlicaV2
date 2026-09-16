import { randomUUID } from 'node:crypto';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { posix } from 'node:path';
import * as sdk from '@alica/plugin-sdk';
import * as contracts from '@alica/acap-contracts';
import { ContractProvider, ContractSession } from '@alica/acap-contracts';
import type {
  Value,
  Manifest,
  Requirement,
  Descriptor,
  Grant,
  Lifecycle,
  ErrorCode,
  Disposer,
  KernelContext,
  BoundCapability,
  Handler,
  CallOptions,
  CleanupReport,
  EventEnvelope,
  Profile,
} from '@alica/acap-types';
import {
  AcapError,
  check,
  fail,
  normalized,
  parse,
  canonical,
  detach,
  freeze,
  digest,
  schema,
  payload,
  version,
  unique,
  requirement,
} from './validation.js';
import { Trust } from './trust.js';
import type { SignedPackage, VerifiedPackage, TrustMaterial } from './trust.js';
export {
  AcapError,
  parse,
  canonical,
  digest,
  rawDigest,
} from './validation.js';
export type { SignedPackage, TrustMaterial } from './trust.js';
export interface Config {
  cellId: string;
  rootScope: string;
  timeTrusted: boolean;
  maxCallMs: number;
  cleanupMs: number;
  activationMs: number;
  eventQueue: number;
  auditCapacity: number;
  maxInstances: number;
  maxScopes: number;
  maxGrants: number;
  maxEffects: number;
  maxCalls: number;
}
export interface BootstrapOptions {
  trust: TrustMaterial;
  statePath: string;
  initialize: boolean;
  syntheticSecret?: string;
  now?: () => number;
}
interface Scope {
  id: string;
  parent: string | null;
  generation: number;
  owner: string | null;
  state: 'OPEN' | 'CLOSING' | 'CLOSED';
}
interface Effect {
  scope: Scope;
  done: boolean;
  cleanup: Disposer;
  task?: Promise<void>;
}
interface Instance {
  id: string;
  pkg: VerifiedPackage;
  scope: Scope;
  token: object;
  state: Lifecycle;
  history: Lifecycle[];
  effects: Effect[];
  dependencies: Set<string>;
  mandatory: Map<string, string>;
  staged: Registration[];
  sequence: number;
  report: CleanupReport;
  activation?: Promise<void>;
  disposal?: Promise<CleanupReport>;
  error?: ErrorCode;
}
interface Registration {
  instance: Instance;
  scope: Scope;
  descriptor: Descriptor;
  handlers: Record<string, Handler>;
  provider?: ContractProvider;
  live: boolean;
}
interface StoredGrant {
  record: Grant;
  revoked: boolean;
  parent: string | null;
}
interface BoundGrant {
  id: string;
  revision: number;
}
interface Pending {
  caller: Instance;
  provider: Instance;
  scope: Scope;
  cancel: (code: ErrorCode) => void;
}
interface Subscription {
  instance: Instance;
  scope: Scope;
  type: string;
  contractDigest: string;
  grant: BoundGrant;
  handler: (event: EventEnvelope) => Promise<void>;
  queue: { event: EventEnvelope; source: Instance; grant: BoundGrant }[];
  live: boolean;
  working: boolean;
  cancel?: () => void;
}
interface Audit {
  actor: string;
  target: string;
  scope: string;
  outcome: string;
  reason: string;
  timestamp: number;
  correlationId: string;
}
interface Candidate {
  providerId: string;
  instanceId: string;
  version: string;
  artifact: string;
  descriptorDigest: string;
  exclusion: string | null;
}
const transitions: Record<Lifecycle, Lifecycle[]> = {
  DISCOVERED: ['VERIFIED', 'FAILED'],
  VERIFIED: ['RESOLVED', 'FAILED'],
  RESOLVED: ['ACTIVATING', 'FAILED'],
  ACTIVATING: ['ACTIVE', 'FAILED'],
  ACTIVE: ['QUIESCING'],
  QUIESCING: ['DISPOSED', 'FAILED'],
  DISPOSED: [],
  FAILED: [],
};
const configKeys = [
  'cellId',
  'rootScope',
  'timeTrusted',
  'maxCallMs',
  'cleanupMs',
  'activationMs',
  'eventQueue',
  'auditCapacity',
  'maxInstances',
  'maxScopes',
  'maxGrants',
  'maxEffects',
  'maxCalls',
];
export function bootstrap(configText: string, options: BootstrapOptions): Host {
  return new Host(configText, options);
}
export class Host {
  #config: Config;
  #trust: Trust;
  #now: () => number;
  #secret: string | undefined;
  #instances = new Map<string, Instance>();
  #scopes = new Map<string, Scope>();
  #generations = new Map<string, number>();
  #grants = new Map<string, StoredGrant>();
  #tokens = new WeakMap<object, Instance>();
  #registry = new Map<
    string,
    Map<string, Map<string, Map<object, Registration>>>
  >();
  #subscriptions = new Set<Subscription>();
  #work = new Map<Instance, Set<Promise<unknown>>>();
  #profileIds: Set<string> | undefined;
  #pins = new Map<string, string>();
  #pending = new Set<Pending>();
  #audit: Audit[] = [];
  #auditUnavailable = false;
  #closed = false;
  #trustTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(configText: string, options: BootstrapOptions) {
    const c = parse(configText) as unknown as Config;
    check(
      c &&
        typeof c === 'object' &&
        canonical(Object.keys(c).sort()) === canonical(configKeys.sort()),
    );
    check(
      /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(c.cellId) &&
        /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(c.rootScope),
    );
    check(c.timeTrusted === true, 'FAILED_PRECONDITION');
    for (const [k, max] of Object.entries({
      maxCallMs: 30000,
      cleanupMs: 30000,
      activationMs: 30000,
      eventQueue: 256,
      auditCapacity: 65536,
      maxInstances: 256,
      maxScopes: 256,
      maxGrants: 4096,
      maxEffects: 4096,
      maxCalls: 1024,
    })) {
      const n = c[k as keyof Config];
      check(typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= max);
    }
    check(
      options.syntheticSecret === undefined ||
        typeof options.syntheticSecret === 'string',
    );
    this.#config = freeze(c);
    this.#now = options.now ?? Date.now;
    this.#secret = options.syntheticSecret;
    this.#trust = new Trust(
      options.trust,
      c.cellId,
      options.statePath,
      this.#now,
      options.initialize,
    );
    this.newScope(c.rootScope, null, null);
    this.scheduleTrust();
  }
  private record(
    actor: string,
    target: string,
    scope: string,
    outcome: string,
    reason: string,
    emergency = false,
  ): void {
    if (this.#audit.length >= this.#config.auditCapacity) {
      if (emergency) {
        this.#auditUnavailable = true;
        return;
      }
      fail('RESOURCE_EXHAUSTED');
    }
    this.#audit.push({
      actor,
      target,
      scope,
      outcome,
      reason,
      timestamp: this.#now(),
      correlationId: randomUUID(),
    });
  }
  private transition(i: Instance, to: Lifecycle): void {
    check(transitions[i.state].includes(to), 'FAILED_PRECONDITION');
    this.record(
      'kernel',
      i.id,
      i.scope.id,
      to,
      'LIFECYCLE',
      to === 'FAILED' || to === 'QUIESCING' || to === 'DISPOSED',
    );
    i.state = to;
    i.history.push(to);
    i.report.state = to;
  }
  private scheduleTrust(): void {
    if (this.#trustTimer) clearTimeout(this.#trustTimer);
    if (this.#closed) return;
    this.#trustTimer = setTimeout(
      () => {
        try {
          this.#trust.fresh();
          this.scheduleTrust();
        } catch {
          for (const i of this.#instances.values()) void this.dispose(i.id);
        }
      },
      Math.max(1, Math.min(1000, this.#trust.expiry - this.#now())),
    );
    this.#trustTimer.unref();
  }
  private fresh(i?: Instance): void {
    check(!this.#closed, 'FAILED_PRECONDITION');
    try {
      i ? this.#trust.accepted(i.pkg) : this.#trust.fresh();
    } catch (e) {
      for (const x of this.#instances.values()) void this.dispose(x.id);
      throw normalized(e);
    }
  }
  private instance(id: string): Instance {
    const i = this.#instances.get(id);
    check(i, 'NOT_FOUND');
    return i;
  }
  private open(scope: Scope): void {
    check(
      scope.state === 'OPEN' && this.#scopes.get(scope.id) === scope,
      'FAILED_PRECONDITION',
    );
  }
  private live(i: Instance, s: Scope, activation = false): void {
    this.open(s);
    check(this.#tokens.get(i.token) === i, 'FAILED_PRECONDITION');
    check(
      i.state === 'ACTIVE' || (activation && i.state === 'ACTIVATING'),
      'FAILED_PRECONDITION',
    );
    this.fresh(i);
  }
  private visible(provider: Scope, consumer: Scope): boolean {
    let s: Scope | undefined = consumer;
    while (s) {
      if (s === provider) return true;
      s = s.parent ? this.#scopes.get(s.parent) : undefined;
    }
    return false;
  }
  private newScope(
    id: string,
    parent: Scope | null,
    owner: Instance | null,
  ): Scope {
    check(
      this.#scopes.size < this.#config.maxScopes &&
        (this.#generations.has(id) ||
          this.#generations.size < this.#config.maxScopes),
      'RESOURCE_EXHAUSTED',
    );
    check(!this.#scopes.has(id), 'CONFLICT');
    if (parent) this.open(parent);
    const generation = (this.#generations.get(id) ?? 0) + 1;
    const scope: Scope = {
      id,
      parent: parent?.id ?? null,
      generation,
      owner: owner?.id ?? null,
      state: 'OPEN',
    };
    this.record(
      owner?.pkg.manifest.id ?? 'operator',
      id,
      parent?.id ?? id,
      'ALLOW',
      'CREATE_SCOPE',
    );
    this.#scopes.set(id, scope);
    this.#generations.set(id, generation);
    return scope;
  }
  createScope(
    parentId: string,
    ownerId?: string,
    id: string = randomUUID(),
  ): string {
    this.fresh();
    const parent = this.#scopes.get(parentId);
    check(parent, 'NOT_FOUND');
    check(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id));
    const owner = ownerId ? this.instance(ownerId) : null;
    if (owner) this.live(owner, parent, true);
    return this.newScope(id, parent, owner).id;
  }
  discover(input: SignedPackage, scopeId = this.#config.rootScope): string {
    this.fresh();
    const scope = this.#scopes.get(scopeId);
    check(scope, 'NOT_FOUND');
    this.open(scope);
    check(
      this.#instances.size < this.#config.maxInstances,
      'RESOURCE_EXHAUSTED',
    );
    this.record('operator', 'package', scopeId, 'ATTEMPT', 'VERIFY');
    let pkg: VerifiedPackage;
    try {
      pkg = this.#trust.verifyPackage(input);
    } catch (e) {
      this.record(
        'operator',
        'package',
        scopeId,
        'DENY',
        normalized(e).code,
        true,
      );
      throw normalized(e);
    }
    check(
      ![...this.#instances.values()].some(
        (x) =>
          x.scope === scope &&
          x.pkg.manifest.id === pkg.manifest.id &&
          !['FAILED', 'DISPOSED'].includes(x.state),
      ),
      'CONFLICT',
    );
    for (const existing of this.#instances.values()) {
      if (
        ['FAILED', 'DISPOSED'].includes(existing.state) ||
        !(
          this.visible(existing.scope, scope) ||
          this.visible(scope, existing.scope)
        )
      )
        continue;
      for (const [key, d] of pkg.descriptors) {
        const prior = existing.pkg.descriptors.get(key);
        check(!prior || digest(prior) === digest(d), 'CONTRACT_MISMATCH');
        if (prior)
          check(existing.pkg.manifest.id !== pkg.manifest.id, 'CONFLICT');
      }
    }
    const i: Instance = {
      id: randomUUID(),
      pkg,
      scope,
      token: Object.freeze({}),
      state: 'DISCOVERED',
      history: ['DISCOVERED'],
      effects: [],
      dependencies: new Set(),
      mandatory: new Map(),
      staged: [],
      sequence: 0,
      report: {
        state: 'DISCOVERED',
        completedDisposers: 0,
        failedDisposers: [],
        timedOutResources: 0,
        restartRequired: false,
      },
    };
    this.#instances.set(i.id, i);
    this.#tokens.set(i.token, i);
    this.transition(i, 'VERIFIED');
    return i.id;
  }
  identity(id: string): Readonly<{
    principal: string;
    instanceId: string;
    scope: string;
    scopeGeneration: number;
  }> {
    const i = this.instance(id);
    return freeze({
      principal: i.pkg.manifest.id,
      instanceId: i.id,
      scope: i.scope.id,
      scopeGeneration: i.scope.generation,
    });
  }
  issueGrant(input: Grant): void {
    this.fresh();
    check(this.#grants.size < this.#config.maxGrants, 'RESOURCE_EXHAUSTED');
    const g = detach(input);
    const kinds = {
      'acap.grant/v1': 'grant',
      'acap.secret-grant/v1': 'secret-grant',
      'acap.event-grant/v1': 'event-grant',
    };
    schema(kinds[g.schemaVersion], g);
    check(!this.#grants.has(g.grantId), 'CONFLICT');
    const i = this.instance(g.instanceId);
    check(
      g.principal === i.pkg.manifest.id &&
        !['QUIESCING', 'DISPOSED', 'FAILED'].includes(i.state),
      'PERMISSION_DENIED',
    );
    const s = this.#scopes.get(g.scope);
    check(s && s.generation === g.scopeGeneration, 'PERMISSION_DENIED');
    this.open(s);
    check(this.visible(s, i.scope) || s.owner === i.id, 'PERMISSION_DENIED');
    check(
      g.issuedAtMs <= this.#now() &&
        this.#now() < g.expiresAtMs &&
        g.expiresAtMs > g.issuedAtMs,
      'PERMISSION_DENIED',
    );
    let parent: string | null = null;
    if (s.parent) {
      const ps = this.#scopes.get(s.parent)!;
      const p = [...this.#grants.values()].find(
        (x) =>
          this.matches(x.record, i, ps, g.schemaVersion, this.resource(g)) &&
          g.operations.every((op) => x.record.operations.includes(op)) &&
          x.record.expiresAtMs >= g.expiresAtMs &&
          this.valid(x),
      );
      check(p, 'PERMISSION_DENIED');
      parent = p.record.grantId;
    }
    this.record('operator', g.grantId, g.scope, 'ALLOW', 'ISSUE_GRANT');
    this.#grants.set(g.grantId, { record: freeze(g), revoked: false, parent });
  }
  private resource(g: Grant): string {
    return g.capabilityId ?? g.secretRef ?? g.eventType ?? '';
  }
  private matches(
    g: Grant,
    i: Instance,
    s: Scope,
    kind: Grant['schemaVersion'],
    resource: string,
  ): boolean {
    return (
      g.schemaVersion === kind &&
      g.instanceId === i.id &&
      g.principal === i.pkg.manifest.id &&
      g.scope === s.id &&
      g.scopeGeneration === s.generation &&
      this.resource(g) === resource
    );
  }
  private valid(g: StoredGrant, seen = new Set<string>()): boolean {
    if (seen.has(g.record.grantId)) return false;
    seen.add(g.record.grantId);
    const s = this.#scopes.get(g.record.scope);
    const now = this.#now();
    if (
      g.revoked ||
      !s ||
      s.state !== 'OPEN' ||
      s.generation !== g.record.scopeGeneration ||
      now < g.record.issuedAtMs ||
      now >= g.record.expiresAtMs
    )
      return false;
    return (
      !g.parent ||
      (!!this.#grants.get(g.parent) &&
        this.valid(this.#grants.get(g.parent)!, seen))
    );
  }
  private authorize(
    i: Instance,
    s: Scope,
    kind: Grant['schemaVersion'],
    resource: string,
    operations: string[],
    bound?: BoundGrant,
  ): BoundGrant {
    this.open(s);
    const g = bound
      ? this.#grants.get(bound.id)
      : [...this.#grants.values()]
          .filter((x) => this.matches(x.record, i, s, kind, resource))
          .sort((a, b) => (a.record.grantId < b.record.grantId ? -1 : 1))
          .find(
            (x) =>
              this.valid(x) &&
              operations.every((op) => x.record.operations.includes(op)),
          );
    if (
      !g ||
      !this.matches(g.record, i, s, kind, resource) ||
      !this.valid(g) ||
      (bound && g.record.revision !== bound.revision) ||
      !operations.every((op) => g.record.operations.includes(op))
    ) {
      this.record(
        i.pkg.manifest.id,
        'authority',
        s.id,
        'DENY',
        'PERMISSION_DENIED',
        true,
      );
      fail('PERMISSION_DENIED');
    }
    return { id: g.record.grantId, revision: g.record.revision };
  }
  revokeGrant(id: string): void {
    const g = this.#grants.get(id);
    check(g, 'NOT_FOUND');
    g.revoked = true;
    this.record(
      'operator',
      id,
      g.record.scope,
      'REVOKE',
      'PERMISSION_DENIED',
      true,
    );
  }
  private declared(
    i: Instance,
    r: Requirement,
    optional: boolean,
  ): Requirement {
    const list = optional
      ? i.pkg.manifest.optionalRequires
      : i.pkg.manifest.requires;
    const declared = list.find((x) => canonical(x) === canonical(r));
    check(declared, 'PERMISSION_DENIED');
    return declared;
  }
  private registrations(): Registration[] {
    return [...this.#registry.values()].flatMap((c) =>
      [...c.values()].flatMap((v) =>
        [...v.values()].flatMap((o) => [...o.values()]),
      ),
    );
  }
  private insert(r: Registration): void {
    let c = this.#registry.get(r.scope.id);
    if (!c) this.#registry.set(r.scope.id, (c = new Map()));
    let v = c.get(r.descriptor.id);
    if (!v) c.set(r.descriptor.id, (v = new Map()));
    let o = v.get(r.descriptor.version);
    if (!o) v.set(r.descriptor.version, (o = new Map()));
    check(!o.has(r.instance.token), 'CONFLICT');
    o.set(r.instance.token, r);
    r.live = true;
  }
  private remove(r: Registration): void {
    r.live = false;
    const c = this.#registry.get(r.scope.id),
      v = c?.get(r.descriptor.id),
      o = v?.get(r.descriptor.version);
    o?.delete(r.instance.token);
    if (!o?.size) v?.delete(r.descriptor.version);
    if (!v?.size) c?.delete(r.descriptor.id);
    if (!c?.size) this.#registry.delete(r.scope.id);
    for (const pending of this.#pending)
      if (pending.provider === r.instance) pending.cancel('UNAVAILABLE');
    for (const i of this.#instances.values())
      if (i.dependencies.has(r.instance.id)) void this.dispose(i.id);
  }
  private resolve(
    i: Instance,
    s: Scope,
    r: Requirement,
    planned: boolean,
    pin?: string,
    selectedIds?: Set<string>,
  ): {
    selected: Registration | null;
    explanation: {
      candidates: Candidate[];
      tieBreak: string;
      selected: Candidate | null;
    };
    grant: BoundGrant;
  } {
    requirement(r);
    pin ??= this.#pins.get(r.capabilityId);
    selectedIds ??= this.#profileIds;
    this.open(s);
    this.fresh(i);
    const grant = this.authorize(
      i,
      s,
      'acap.grant/v1',
      r.capabilityId,
      r.operations,
    );
    let catalog: Registration[];
    if (planned)
      catalog = [...this.#instances.values()]
        .filter((x) => !selectedIds || selectedIds.has(x.id))
        .flatMap((x) =>
          [...x.pkg.descriptors.values()].map((d) => ({
            instance: x,
            scope: x.scope,
            descriptor: d,
            handlers: {},
            live: x.state === 'ACTIVE',
          })),
        );
    else
      catalog = this.registrations().filter(
        (x) => !selectedIds || selectedIds.has(x.instance.id),
      );
    const visible = catalog.filter(
      (x) => this.visible(x.scope, s) && x.descriptor.id === r.capabilityId,
    );
    const contracts = new Map<string, string>();
    const identities = new Set<string>();
    for (const c of visible) {
      const d = digest(c.descriptor),
        old = contracts.get(c.descriptor.version);
      check(!old || old === d, 'CONTRACT_MISMATCH');
      contracts.set(c.descriptor.version, d);
      const id = c.instance.pkg.manifest.id + '@' + c.descriptor.version;
      check(!identities.has(id), 'CONFLICT');
      identities.add(id);
    }
    const candidates = visible.map((c) => {
      let exclusion: string | null = null;
      try {
        this.#trust.accepted(c.instance.pkg);
      } catch {
        exclusion = 'UNTRUSTED';
      }
      const v = version(c.descriptor.version);
      if (
        ![
          'ACTIVE',
          ...(planned ? ['VERIFIED', 'RESOLVED', 'ACTIVATING'] : []),
        ].includes(c.instance.state)
      )
        exclusion = 'INACTIVE';
      if (
        v[0] !== r.major ||
        v[1]! < r.minMinor ||
        (r.maxMinor !== undefined && v[1]! > r.maxMinor)
      )
        exclusion = 'INCOMPATIBLE_VERSION';
      if (
        r.operations.some(
          (o) => !c.descriptor.operations.some((x) => x.name === o),
        )
      )
        exclusion = 'MISSING_OPERATION';
      if (r.features.some((f) => !c.descriptor.features.includes(f)))
        exclusion = 'MISSING_FEATURE';
      if (pin && c.instance.pkg.manifest.id !== pin) exclusion = 'PIN_MISMATCH';
      return {
        registration: c,
        summary: {
          providerId: c.instance.pkg.manifest.id,
          instanceId: c.instance.id,
          version: c.descriptor.version,
          artifact: c.instance.pkg.digest,
          descriptorDigest: digest(c.descriptor),
          exclusion,
        } satisfies Candidate,
      };
    });
    const compare = (
      a: (typeof candidates)[number],
      b: (typeof candidates)[number],
    ) => {
      const av = version(a.summary.version),
        bv = version(b.summary.version);
      for (let n = 0; n < 3; n++) if (av[n] !== bv[n]) return bv[n]! - av[n]!;
      for (const key of ['providerId', 'artifact'] as const)
        if (a.summary[key] !== b.summary[key])
          return a.summary[key] < b.summary[key] ? -1 : 1;
      return 0;
    };
    candidates.sort(compare);
    const chosen = candidates.find((c) => !c.summary.exclusion);
    if (pin && !chosen) fail('NOT_FOUND');
    return {
      selected: chosen?.registration ?? null,
      explanation: {
        candidates: candidates.map((c) => c.summary),
        tieBreak:
          'contract-version DESC, provider-id ASCII ASC, artifact-digest ASCII ASC; qualified explicit pin wins',
        selected: chosen?.summary ?? null,
      },
      grant,
    };
  }
  explain(id: string, r: Requirement, pin?: string): unknown {
    const i = this.instance(id);
    return freeze(detach(this.resolve(i, i.scope, r, true, pin).explanation));
  }
  plan(profileText: string): unknown {
    const p = documentProfile(profileText);
    unique(p.plugins.map((x) => x.id));
    unique(p.providerPins.map((x) => x.capabilityId));
    unique(p.scopes.map((x) => x.id));
    check(p.scopes.filter((x) => x.parent === null).length === 1);
    check(
      p.scopes.find((x) => x.parent === null)!.id === this.#config.rootScope,
      'FAILED_PRECONDITION',
    );
    check(
      p.providerPins.every((pin) =>
        p.plugins.some((plugin) => plugin.id === pin.providerId),
      ),
      'NOT_FOUND',
    );
    const scopes = new Map(p.scopes.map((x) => [x.id, x]));
    for (const s of p.scopes) {
      let node: typeof s | undefined = s;
      const seen = new Set<string>();
      while (node) {
        check(!seen.has(node.id), 'CONFLICT');
        seen.add(node.id);
        if (node.parent) {
          check(scopes.has(node.parent));
          node = scopes.get(node.parent);
        } else node = undefined;
      }
    }
    const selected = p.plugins.map((x) => {
      const i = [...this.#instances.values()].find(
        (i) =>
          i.pkg.manifest.id === x.id &&
          i.scope.id === this.#config.rootScope &&
          !['DISPOSED', 'FAILED'].includes(i.state),
      );
      check(
        i &&
          i.pkg.manifest.version === x.version &&
          i.pkg.digest === x.packageDigest,
        'CONTRACT_MISMATCH',
      );
      return i;
    });
    const ids = new Set(selected.map((i) => i.id));
    const bindings: Record<string, string>[] = [];
    const explanations: unknown[] = [];
    const visiting = new Set<string>(),
      visited = new Set<string>(),
      order: string[] = [];
    const visit = (i: Instance) => {
      check(!visiting.has(i.id), 'CONFLICT');
      if (visited.has(i.id)) return;
      visiting.add(i.id);
      for (const r of i.pkg.manifest.requires) {
        const resolved = this.resolve(
          i,
          i.scope,
          r,
          true,
          p.providerPins.find((x) => x.capabilityId === r.capabilityId)
            ?.providerId,
          ids,
        );
        check(resolved.selected, 'NOT_FOUND');
        const d = resolved.selected;
        visit(d.instance);
        explanations.push(resolved.explanation);
        bindings.push({
          consumerId: i.pkg.manifest.id,
          scope: i.scope.id,
          capabilityId: r.capabilityId,
          providerId: d.instance.pkg.manifest.id,
          version: d.descriptor.version,
          providerVersion: d.instance.pkg.manifest.version,
          descriptorDigest: digest(d.descriptor),
          packageDigest: d.instance.pkg.digest,
        });
      }
      visiting.delete(i.id);
      visited.add(i.id);
      order.push(i.id);
    };
    for (const i of selected) visit(i);
    const lock = {
      schemaVersion: 'alica.resolution-lock/v1',
      profileDigest: digest(p),
      policyDigest: this.#trust.policyDigest,
      plugins: [...p.plugins].sort((a, b) => (a.id < b.id ? -1 : 1)),
      bindings: bindings.sort((a, b) => {
        const x = [a.scope, a.consumerId, a.capabilityId].join('|'),
          y = [b.scope, b.consumerId, b.capabilityId].join('|');
        return x < y ? -1 : x > y ? 1 : 0;
      }),
    };
    schema('resolution-lock', lock);
    return freeze(detach({ lock, explanations, order }));
  }
  async startProfile(profileText: string): Promise<unknown> {
    check(!this.#profileIds, 'FAILED_PRECONDITION');
    const profile = documentProfile(profileText);
    const plan = this.plan(profileText) as { order: string[] };
    check(
      [...this.#instances.values()].every(
        (i) =>
          i.state === 'VERIFIED' || ['FAILED', 'DISPOSED'].includes(i.state),
      ),
      'FAILED_PRECONDITION',
    );
    this.#profileIds = new Set(plan.order);
    this.#pins = new Map(
      profile.providerPins.map((p) => [p.capabilityId, p.providerId]),
    );
    try {
      let todo = profile.scopes.filter((s) => s.parent !== null);
      while (todo.length) {
        const ready = todo.filter((s) => this.#scopes.has(s.parent!));
        check(ready.length, 'CONFLICT');
        for (const s of ready) this.createScope(s.parent!, undefined, s.id);
        todo = todo.filter((s) => !ready.includes(s));
      }
      for (const id of plan.order) await this.activate(id);
      return plan;
    } catch (error) {
      for (const id of [...plan.order].reverse()) await this.dispose(id);
      for (const scope of [...profile.scopes].reverse())
        if (scope.parent !== null) await this.destroyScope(scope.id);
      throw normalized(error);
    }
  }
  private track<T>(i: Instance, promise: Promise<T>): Promise<T> {
    let work = this.#work.get(i);
    if (!work) this.#work.set(i, (work = new Set()));
    work.add(promise);
    const done = () => {
      work!.delete(promise);
      if (!work!.size) this.#work.delete(i);
    };
    void promise.then(done, done);
    return promise;
  }
  private async bounded<T>(work: () => Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(work),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new AcapError('DEADLINE_EXCEEDED')),
            ms,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  activate(id: string): Promise<void> {
    check(!this.#profileIds || this.#profileIds.has(id), 'PERMISSION_DENIED');
    const i = this.instance(id);
    if (i.activation) return i.activation;
    i.activation = this.activateTree(i, new Set());
    return i.activation;
  }
  private async activateTree(i: Instance, stack: Set<string>): Promise<void> {
    check(!stack.has(i.id), 'CONFLICT');
    if (i.state === 'ACTIVE') return;
    check(i.state === 'VERIFIED', 'FAILED_PRECONDITION');
    stack = new Set(stack).add(i.id);
    try {
      this.open(i.scope);
      this.fresh(i);
      for (const r of i.pkg.manifest.requires) {
        const selected = this.resolve(i, i.scope, r, true).selected;
        check(selected, 'NOT_FOUND');
        check(!stack.has(selected.instance.id), 'CONFLICT');
        await this.activateTree(selected.instance, stack);
        i.dependencies.add(selected.instance.id);
        i.mandatory.set(r.capabilityId, selected.instance.id);
      }
      this.transition(i, 'RESOLVED');
      this.transition(i, 'ACTIVATING');
      // Only copied, inventory-verified module bytes and fixed public SDK roots.
      // No filesystem or Node package resolution occurs for plugin imports.
      const local = new Map<string, SourceTextModule>();
      const paths = new Map<SourceTextModule, string>();
      const publicModules = new Map<string, SyntheticModule>();
      const load = (path: string): SourceTextModule => {
        const previous = local.get(path);
        if (previous) return previous;
        const code = i.pkg.modules.get(path);
        check(code !== undefined, 'FAILED_PRECONDITION');
        const source = new SourceTextModule(code, {
          identifier: 'alica:' + i.pkg.digest + '/' + path,
          importModuleDynamically: () => {
            throw new AcapError('PERMISSION_DENIED');
          },
        });
        local.set(path, source);
        paths.set(source, path);
        return source;
      };
      const module = load(i.pkg.manifest.entrypoint);
      await module.link((specifier, referencing) => {
        if (
          [
            '@alica/plugin-sdk',
            '@alica/acap-contracts',
            '@alica/acap-types',
          ].includes(specifier)
        ) {
          let shared = publicModules.get(specifier);
          if (!shared) {
            const exports: Record<string, unknown> =
              specifier === '@alica/plugin-sdk'
                ? sdk
                : specifier === '@alica/acap-contracts'
                  ? contracts
                  : {};
            shared = new SyntheticModule(
              Object.keys(exports),
              function () {
                for (const [key, value] of Object.entries(exports))
                  this.setExport(key, value);
              },
              { identifier: 'public:' + specifier },
            );
            publicModules.set(specifier, shared);
          }
          return shared;
        }
        check(
          /^(?:\.\.?\/)[A-Za-z0-9_./-]+$/.test(specifier),
          'FAILED_PRECONDITION',
        );
        const from = paths.get(referencing as SourceTextModule);
        check(from, 'FAILED_PRECONDITION');
        const target = posix.normalize(
          posix.join(posix.dirname(from), specifier),
        );
        check(
          target !== '..' &&
            !target.startsWith('../') &&
            !posix.isAbsolute(target),
          'FAILED_PRECONDITION',
        );
        return load(target);
      });
      this.fresh(i);
      await this.bounded(
        () =>
          this.track(
            i,
            (async () => {
              await module.evaluate({ timeout: this.#config.activationMs });
              const ns = module.namespace as unknown as {
                activate?: (context: KernelContext) => Promise<void>;
              };
              check(typeof ns.activate === 'function', 'FAILED_PRECONDITION');
              await ns.activate(this.contextFor(i, i.scope));
            })(),
          ),
        this.#config.activationMs,
      );
      this.live(i, i.scope, true);
      check((i.state as Lifecycle) === 'ACTIVATING', 'FAILED_PRECONDITION');
      for (const b of i.pkg.manifest.provides)
        check(
          i.staged.some(
            (r) =>
              r.scope === i.scope &&
              r.descriptor.id === b.capabilityId &&
              r.descriptor.version === b.version,
          ),
          'FAILED_PRECONDITION',
        );
      for (const d of i.dependencies)
        check(this.instance(d).state === 'ACTIVE', 'UNAVAILABLE');
      this.record('kernel', i.id, i.scope.id, 'ALLOW', 'PUBLISH');
      this.transition(i, 'ACTIVE');
      for (const r of i.staged) this.insert(r);
      i.staged = [];
    } catch (e) {
      i.error = normalized(e).code;
      if (i.error === 'DEADLINE_EXCEEDED') i.report.restartRequired = true;
      await this.dispose(i.id);
      throw normalized(e);
    }
  }
  context(id: string): KernelContext {
    const i = this.instance(id);
    this.live(i, i.scope);
    return this.contextFor(i, i.scope);
  }
  private contextFor(i: Instance, s: Scope): KernelContext {
    return Object.freeze({
      principal: i.pkg.manifest.id,
      instanceId: i.id,
      scope: s.id,
      scopeGeneration: s.generation,
      log: (record: {
        level: 'info' | 'warn' | 'error';
        event: 'checkpoint' | 'warning' | 'failure';
      }) => {
        this.live(i, s, true);
        const v = detach(record);
        check(
          canonical(Object.keys(v).sort()) === canonical(['event', 'level']) &&
            ['info', 'warn', 'error'].includes(v.level) &&
            ['checkpoint', 'warning', 'failure'].includes(v.event),
        );
        this.record(
          i.pkg.manifest.id,
          i.id,
          s.id,
          v.level,
          'PLUGIN_' + v.event.toUpperCase(),
        );
      },
      provide: (d: Descriptor, h: Record<string, Handler>) =>
        this.provide(i, s, d, h),
      require: async (r: Requirement) => {
        this.live(i, s, true);
        this.declared(i, r, false);
        const expected = i.mandatory.get(r.capabilityId);
        check(expected, 'FAILED_PRECONDITION');
        const x = this.resolve(
          i,
          s,
          r,
          false,
          this.instance(expected).pkg.manifest.id,
        );
        check(x.selected && x.selected.instance.id === expected, 'UNAVAILABLE');
        return this.bind(i, s, x.selected, r, x.grant);
      },
      optional: async (r: Requirement) => {
        this.live(i, s);
        this.declared(i, r, true);
        const x = this.resolve(i, s, r, false);
        return x.selected ? this.bind(i, s, x.selected, r, x.grant) : null;
      },
      effect: <T>(
        acquire: (registerCleanup: (dispose: Disposer) => void) => Promise<T>,
      ) => this.effect(i, s, acquire),
      secret: async (ref: string) => this.secret(i, s, ref),
      on: (type: string, handler: (e: EventEnvelope) => Promise<void>) =>
        this.subscribe(i, s, type, handler),
      emit: async (type: string, data: Value) => this.emit(i, s, type, data),
      createScope: () => {
        this.live(i, s, true);
        const child = this.newScope(randomUUID(), s, i);
        return this.contextFor(i, child);
      },
    });
  }
  private own(i: Instance, s: Scope, cleanup: Disposer): Disposer {
    this.live(i, s, true);
    check(typeof cleanup === 'function');
    check(i.effects.length < this.#config.maxEffects, 'RESOURCE_EXHAUSTED');
    const e: Effect = { scope: s, cleanup, done: false };
    i.effects.push(e);
    return () => this.clean(i, e);
  }
  private clean(i: Instance, e: Effect): Promise<void> {
    if (e.task) return e.task;
    e.done = true;
    e.task = this.bounded(e.cleanup, this.#config.cleanupMs).then(
      () => {
        i.report.completedDisposers++;
      },
      (error) => {
        const code = normalized(error).code;
        i.report.failedDisposers.push(code);
        i.report.restartRequired = true;
        if (code === 'DEADLINE_EXCEEDED') i.report.timedOutResources++;
        this.record('kernel', i.id, e.scope.id, 'FAIL', 'CLEANUP', true);
        throw new AcapError(code);
      },
    );
    return e.task;
  }
  private async effect<T>(
    i: Instance,
    s: Scope,
    acquire: (registerCleanup: (dispose: Disposer) => void) => Promise<T>,
  ): Promise<T> {
    this.live(i, s, true);
    const owned: Disposer[] = [];
    let accepting = true;
    try {
      const result = await this.bounded(
        () =>
          acquire((cleanup) => {
            check(accepting, 'FAILED_PRECONDITION');
            owned.push(this.own(i, s, cleanup));
          }),
        this.#config.activationMs,
      );
      this.live(i, s, true);
      return result;
    } catch (e) {
      for (const d of owned.reverse())
        try {
          await d();
        } catch {
          /* recorded by clean */
        }
      throw normalized(e);
    } finally {
      accepting = false;
    }
  }
  private provide(
    i: Instance,
    s: Scope,
    input: Descriptor,
    handlers: Record<string, Handler>,
  ): Disposer {
    this.live(i, s, true);
    const d = detach(input);
    const bound = i.pkg.descriptors.get(d.id + '@' + d.version);
    check(bound && digest(bound) === digest(d), 'CONTRACT_MISMATCH');
    check(
      canonical(Object.keys(handlers).sort()) ===
        canonical(d.operations.map((x) => x.name).sort()) &&
        Object.values(handlers).every((x) => typeof x === 'function'),
      'CONTRACT_MISMATCH',
    );
    check(
      ![...i.staged, ...this.registrations()].some(
        (r) =>
          r.instance === i &&
          r.scope === s &&
          r.descriptor.id === d.id &&
          r.descriptor.version === d.version,
      ),
      'CONFLICT',
    );
    const r: Registration = {
      instance: i,
      scope: s,
      descriptor: bound,
      handlers: Object.freeze({ ...handlers }),
      provider: new ContractProvider(bound, handlers),
      live: false,
    };
    const disposer = this.own(i, s, async () => {
      i.staged = i.staged.filter((x) => x !== r);
      r.provider?.close();
      this.remove(r);
    });
    if (i.state === 'ACTIVATING') i.staged.push(r);
    else {
      this.record(i.pkg.manifest.id, d.id, s.id, 'ALLOW', 'PROVIDE');
      this.insert(r);
    }
    return disposer;
  }
  private bind(
    i: Instance,
    s: Scope,
    r: Registration,
    req: Requirement,
    grant: BoundGrant,
  ): BoundCapability {
    req = freeze(detach(req));
    const generation = s.generation;
    check(r.provider, 'FAILED_PRECONDITION');
    const session = new ContractSession(r.provider, {
      caller: { principal: i.pkg.manifest.id, instanceId: i.id, scope: s.id },
      scopeGeneration: generation,
      maxCallMs: this.#config.maxCallMs,
      maxPending: this.#config.maxCalls,
      streamCapacity: this.#config.eventQueue,
      now: this.#now,
      authorize: (operation?: string) => {
        this.live(i, s);
        check(s.generation === generation, 'FAILED_PRECONDITION');
        check(r.live && r.instance.state === 'ACTIVE', 'UNAVAILABLE');
        this.fresh(r.instance);
        if (operation)
          check(req.operations.includes(operation), 'PERMISSION_DENIED');
        this.authorize(
          i,
          s,
          'acap.grant/v1',
          req.capabilityId,
          operation ? [operation] : req.operations,
          grant,
        );
      },
      admit: (cancel) => {
        check(this.#pending.size < this.#config.maxCalls, 'RESOURCE_EXHAUSTED');
        this.record(i.pkg.manifest.id, req.capabilityId, s.id, 'ALLOW', 'CALL');
        const pending: Pending = {
          caller: i,
          provider: r.instance,
          scope: s,
          cancel,
        };
        this.#pending.add(pending);
        return () => {
          this.#pending.delete(pending);
        };
      },
      track: <T>(promise: Promise<T>) => this.track(r.instance, promise),
    });
    return Object.freeze({
      descriptorDigest: digest(r.descriptor),
      negotiatedFeatures: Object.freeze(
        (req.optionalFeatures ?? [])
          .filter((f) => r.descriptor.features.includes(f))
          .sort(),
      ),
      call: (operation: string, input: Value, options: CallOptions) =>
        session.call(operation, input, options),
      stream: (operation: string, input: Value, options: CallOptions) =>
        session.openStream(operation, input, options),
    });
  }
  private async secret(i: Instance, s: Scope, ref: string): Promise<string> {
    this.live(i, s, true);
    check(i.pkg.manifest.secretReferences.includes(ref), 'PERMISSION_DENIED');
    const g = this.authorize(i, s, 'acap.secret-grant/v1', ref, ['read']);
    check(ref === 'synthetic-test' && this.#secret !== undefined, 'NOT_FOUND');
    this.record(i.pkg.manifest.id, ref, s.id, 'ALLOW', 'SECRET_READ');
    await Promise.resolve();
    this.live(i, s, true);
    this.authorize(i, s, 'acap.secret-grant/v1', ref, ['read'], g);
    return this.#secret;
  }
  private subscribe(
    i: Instance,
    s: Scope,
    type: string,
    handler: (event: EventEnvelope) => Promise<void>,
  ): Disposer {
    this.live(i, s, true);
    const b = i.pkg.manifest.subscribedEvents.find((x) => x.eventType === type);
    check(b && typeof handler === 'function', 'PERMISSION_DENIED');
    const grant = this.authorize(i, s, 'acap.event-grant/v1', type, [
      'subscribe',
    ]);
    const sub: Subscription = {
      instance: i,
      scope: s,
      type,
      contractDigest: b.descriptorDigest,
      grant,
      handler,
      queue: [],
      live: true,
      working: false,
    };
    const dispose = this.own(i, s, async () => {
      sub.live = false;
      sub.queue = [];
      sub.cancel?.();
      this.#subscriptions.delete(sub);
    });
    this.#subscriptions.add(sub);
    return dispose;
  }
  private emit(
    i: Instance,
    s: Scope,
    type: string,
    data: Value,
  ): { admitted: number } {
    this.live(i, s);
    check(
      i.pkg.manifest.publishedEvents.some((x) => x.eventType === type),
      'PERMISSION_DENIED',
    );
    const grant = this.authorize(i, s, 'acap.event-grant/v1', type, [
      'publish',
    ]);
    const d = i.pkg.events.get(type)!;
    const body = detach(data);
    payload(d.payload, body);
    const event: EventEnvelope = {
      eventId: randomUUID(),
      type,
      contractDigest: digest(d),
      sourceProvider: i.pkg.manifest.id,
      sourceScope: s.id,
      sourceInstanceId: i.id,
      scopeGeneration: s.generation,
      sequence: ++i.sequence,
      timeMs: this.#now(),
      data: body,
    };
    let admitted = 0;
    for (const sub of this.#subscriptions) {
      if (
        !sub.live ||
        sub.type !== type ||
        sub.contractDigest !== event.contractDigest ||
        sub.instance.state !== 'ACTIVE' ||
        !this.visible(s, sub.scope)
      )
        continue;
      if (sub.queue.length >= this.#config.eventQueue) {
        sub.live = false;
        sub.queue = [];
        sub.cancel?.();
        this.#subscriptions.delete(sub);
        this.record(
          'kernel',
          sub.instance.id,
          sub.scope.id,
          'FAIL',
          'RESOURCE_EXHAUSTED',
          true,
        );
        continue;
      }
      sub.queue.push({ event, source: i, grant });
      admitted++;
      if (!sub.working) void this.pump(sub);
    }
    return { admitted };
  }
  private async pump(sub: Subscription): Promise<void> {
    sub.working = true;
    await Promise.resolve();
    try {
      while (sub.live && sub.queue.length) {
        const x = sub.queue.shift()!;
        try {
          this.live(sub.instance, sub.scope);
          this.live(x.source, this.#scopes.get(x.event.sourceScope)!);
          this.authorize(
            sub.instance,
            sub.scope,
            'acap.event-grant/v1',
            sub.type,
            ['subscribe'],
            sub.grant,
          );
          this.authorize(
            x.source,
            this.#scopes.get(x.event.sourceScope)!,
            'acap.event-grant/v1',
            sub.type,
            ['publish'],
            x.grant,
          );
          let cancel: (() => void) | undefined;
          const stop = new Promise<void>((resolve) => {
            cancel = resolve;
          });
          sub.cancel = cancel!;
          await this.bounded(
            () =>
              Promise.race([
                this.track(
                  sub.instance,
                  Promise.resolve().then(() => {
                    if (!sub.live) return;
                    this.live(sub.instance, sub.scope);
                    const sourceScope = this.#scopes.get(x.event.sourceScope);
                    check(sourceScope, 'UNAVAILABLE');
                    this.live(x.source, sourceScope);
                    this.authorize(
                      sub.instance,
                      sub.scope,
                      'acap.event-grant/v1',
                      sub.type,
                      ['subscribe'],
                      sub.grant,
                    );
                    this.authorize(
                      x.source,
                      sourceScope,
                      'acap.event-grant/v1',
                      sub.type,
                      ['publish'],
                      x.grant,
                    );
                    return sub.handler(detach(x.event));
                  }),
                ),
                stop,
              ]),
            this.#config.maxCallMs,
          );
        } catch (e) {
          this.record(
            'kernel',
            sub.instance.id,
            sub.scope.id,
            'FAIL',
            normalized(e).code,
            true,
          );
          if (normalized(e).code === 'DEADLINE_EXCEEDED')
            sub.instance.report.restartRequired = true;
        } finally {
          delete sub.cancel;
        }
      }
    } finally {
      sub.working = false;
    }
  }
  quiesce(id: string): Promise<CleanupReport> {
    return this.dispose(id);
  }
  dispose(id: string): Promise<CleanupReport> {
    const i = this.instance(id);
    if (i.disposal) return i.disposal;
    if (i.state === 'DISPOSED' || i.state === 'FAILED')
      return Promise.resolve(freeze(detach(i.report)));
    const wasActive = i.state === 'ACTIVE';
    if (wasActive) this.transition(i, 'QUIESCING');
    else this.transition(i, 'FAILED');
    this.#tokens.delete(i.token);
    for (const p of this.#pending)
      if (p.caller === i || p.provider === i) p.cancel('UNAVAILABLE');
    for (const g of this.#grants.values())
      if (g.record.instanceId === i.id) g.revoked = true;
    for (const r of [
      ...i.staged,
      ...this.registrations().filter((r) => r.instance === i),
    ])
      r.live = false;
    i.disposal = (async () => {
      for (const dependent of this.#instances.values())
        if (dependent.dependencies.has(i.id)) await this.dispose(dependent.id);
      for (const s of [...this.#scopes.values()].reverse())
        if (s.owner === i.id) await this.destroyScope(s.id);
      for (const e of [...i.effects].reverse())
        try {
          await this.clean(i, e);
        } catch {
          /* recorded; keep cleaning */
        }
      i.staged = [];
      const work = this.#work.get(i);
      if (work?.size)
        try {
          await this.bounded(
            () => Promise.allSettled([...work]),
            this.#config.cleanupMs,
          );
        } catch {
          i.report.timedOutResources += work.size;
          i.report.failedDisposers.push('DEADLINE_EXCEEDED');
          i.report.restartRequired = true;
          this.record(
            'kernel',
            i.id,
            i.scope.id,
            'FAIL',
            'UNCOOPERATIVE_WORK',
            true,
          );
        }
      if (wasActive)
        this.transition(
          i,
          i.report.failedDisposers.length ? 'FAILED' : 'DISPOSED',
        );
      return freeze(detach(i.report));
    })();
    return i.disposal;
  }
  async destroyScope(id: string): Promise<void> {
    const root = this.#scopes.get(id);
    if (!root) return;
    const scopes = [...this.#scopes.values()].filter((s) =>
      this.visible(root, s),
    );
    for (const s of scopes) {
      s.state = 'CLOSING';
      for (const g of this.#grants.values())
        if (g.record.scope === s.id) g.revoked = true;
      for (const p of this.#pending)
        if (p.scope === s || p.provider.scope === s) p.cancel('UNAVAILABLE');
    }
    this.record('operator', id, id, 'CLOSE', 'SCOPE_DESTROY', true);
    for (const s of scopes.reverse()) {
      for (const i of this.#instances.values()) {
        if (i.scope === s) await this.dispose(i.id);
        else
          for (const e of [...i.effects].reverse())
            if (e.scope === s)
              try {
                await this.clean(i, e);
              } catch {
                /* recorded */
              }
      }
      s.state = 'CLOSED';
      this.#scopes.delete(s.id);
    }
  }
  updateTrust(
    material: TrustMaterial,
    rotation?: {
      record: unknown;
      oldSignature: import('@alica/acap-types').Signature;
      newSignature: import('@alica/acap-types').Signature;
    },
  ): void {
    this.record(
      'operator',
      'trust',
      this.#config.rootScope,
      'ATTEMPT',
      'UPDATE_TRUST',
    );
    this.#trust.update(material, rotation);
    for (const i of this.#instances.values())
      try {
        this.#trust.accepted(i.pkg);
      } catch {
        void this.dispose(i.id);
      }
    this.scheduleTrust();
  }
  inspect(): unknown {
    return freeze(
      detach({
        cellId: this.#config.cellId,
        instances: [...this.#instances.values()].map((i) => ({
          id: i.id,
          principal: i.pkg.manifest.id,
          scope: i.scope.id,
          generation: i.scope.generation,
          state: i.state,
          history: i.history,
          packageDigest: i.pkg.digest,
          cleanup: i.report,
        })),
        scopes: [...this.#scopes.values()],
        registry: this.registrations()
          .filter((r) => r.live)
          .map((r) => ({
            scope: r.scope.id,
            capability: r.descriptor.id,
            version: r.descriptor.version,
            owner: r.instance.id,
            packageDigest: r.instance.pkg.digest,
          })),
        grants: [...this.#grants.values()].map((g) => ({
          id: g.record.grantId,
          principal: g.record.principal,
          scope: g.record.scope,
          instanceId: g.record.instanceId,
          revision: g.record.revision,
          revoked: g.revoked,
          valid: this.valid(g),
        })),
        resources: {
          registrations: this.registrations().filter((r) => r.live).length,
          listeners: this.#subscriptions.size,
          pendingCalls: this.#pending.size,
          effects: [...this.#instances.values()].reduce(
            (n, i) => n + i.effects.filter((e) => !e.done).length,
            0,
          ),
        },
        unsettledWork: [...this.#work.values()].reduce(
          (n, work) => n + work.size,
          0,
        ),
        audit: this.#audit.slice(-256),
        auditRecords: this.#audit.length,
        auditUnavailable: this.#auditUnavailable,
      }),
    );
  }
  drainAudit(): unknown {
    const out = freeze(detach(this.#audit, this.#config.auditCapacity * 1024));
    this.#audit = [];
    return out;
  }
  async shutdown(): Promise<unknown> {
    if (this.#closed) return this.inspect();
    this.#closed = true;
    if (this.#trustTimer) clearTimeout(this.#trustTimer);
    await this.destroyScope(this.#config.rootScope);
    this.#secret = undefined;
    return this.inspect();
  }
}
function documentProfile(text: string): Profile {
  return schema<Profile>('profile', parse(text));
}
