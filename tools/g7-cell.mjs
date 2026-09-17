// Lifetime-locked in-process Cell. CLI daemon/admin and upgrade remain unavailable.
import { closeSync, readFileSync, statfsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { bootstrap } from '@alica/kernel';
import { canonical, parse, digest, check } from '@alica/acap-contracts';
import {
  openPrivateRoot,
  readPrivate,
  listPrivate,
  durableWrite,
} from './g7-durable.mjs';
import { openArchive } from './g7-archive.mjs';
import { inspectRelease, verifyCurrentTrust } from './g7-release.mjs';
const require = createRequire(import.meta.url);
const { lockRoot } = require('../native/g7/build/ownership.node');
const contract = JSON.parse(
  readFileSync(
    new URL('../docs/g7/draft/contracts.schema.json', import.meta.url),
  ),
);
const limits = JSON.parse(
  readFileSync(new URL('../docs/g7/draft/limits.json', import.meta.url)),
);
const ajv = new Ajv2020({ strict: true });
ajv.addSchema(contract);
const validators = new Map();
export function cellSchema(name, value) {
  if (!validators.has(name))
    validators.set(
      name,
      ajv.compile({ $ref: contract.$id + '#/$defs/' + name }),
    );
  // The bounded parser returns null-prototype data. Ajv uniqueItems uses
  // fast-deep-equal, which expects ordinary JSON object prototypes. Preserve
  // exact canonical JSON values while normalizing only this validator view.
  check(validators.get(name)(JSON.parse(canonical(value))), 'INVALID_ARGUMENT');
  return value;
}
const same = (a, b) => canonical(a) === canonical(b);
const bytes = (v) => Buffer.from(canonical(v));
const edges = {
  STAGING: ['VERIFIED', 'RECOVERING'],
  VERIFIED: ['ACTIVATING', 'RECOVERING'],
  ACTIVATING: ['COMMITTED', 'RECOVERING'],
  RECOVERING: ['ABORTED', 'NEEDS_OPERATOR'],
  COMMITTED: [],
  ABORTED: [],
  NEEDS_OPERATOR: [],
};
export function monotonic(previous, next) {
  cellSchema('floor', previous);
  cellSchema('floor', next);
  check(
    previous.rootKeyId === next.rootKeyId &&
      ['policyVersion', 'revocationVersion', 'lastWallMs'].every(
        (k) => next[k] >= previous[k],
      ),
    'PERMISSION_DENIED',
  );
}
export function validateJournal(rows) {
  check(rows.length > 0 && rows.length <= limits.journalRecords);
  let prior;
  for (const item of rows) {
    cellSchema('journal', item);
    const r = item.record;
    check(
      bytes(item).length <= limits.journalRecordBytes &&
        item.checksum === digest(r),
    );
    check(r.targetRevision === r.priorRevision + 1);
    if (!prior)
      check(
        r.state === 'STAGING' && r.sequence === 1 && r.previousHash === null,
      );
    else {
      check(
        r.sequence === prior.record.sequence + 1 &&
          r.previousHash === prior.checksum &&
          edges[prior.record.state].includes(r.state),
      );
      for (const k of [
        'cellId',
        'transactionId',
        'operation',
        'prior',
        'target',
        'priorRevision',
        'targetRevision',
      ])
        check(same(r[k], prior.record[k]));
      monotonic(prior.record.trustFloor, r.trustFloor);
    }
    if (['STAGING', 'VERIFIED', 'ACTIVATING'].includes(r.state))
      check(r.outcome === 'PENDING');
    else if (r.state === 'COMMITTED') check(r.outcome === 'OK');
    else check(!['PENDING', 'OK'].includes(r.outcome));
    check(r.state !== 'ABORTED' || r.outcome !== 'CLEANUP_UNCERTAIN');
    prior = item;
  }
  return prior.record;
}
function configuration(cellId, rootScope) {
  return canonical({
    cellId,
    rootScope,
    timeTrusted: true,
    maxCallMs: 1000,
    cleanupMs: 30000,
    activationMs: 30000,
    eventQueue: 4,
    auditCapacity: 4096,
    maxInstances: 64,
    maxScopes: 64,
    maxGrants: 512,
    maxEffects: 128,
    maxCalls: 64,
  });
}
// Every instance owns a separate flock open-file description. No public lock assertion,
// verified flag, activation callback, supplied clock, or shared-mutation escape hatch.
export class CellPreparation {
  #fd;
  #failed = false;
  #busy = false;
  #host;
  #stopped = false;
  #running = false;
  install(archivePath, material, authorization) {
    return this.#run(() =>
      this.#stage(
        archivePath,
        parse(canonical(material)),
        parse(canonical(authorization)),
        true,
      ),
    );
  }
  shutdown() {
    check(!this.#busy, 'CONFLICT');
    this.#busy = true;
    return this.#shutdown().finally(() => {
      this.#busy = false;
    });
  }
  async #shutdown() {
    this.#running = false;
    if (!this.#host) return;
    const report = await this.#host.shutdown();
    check(
      report.unsettledWork === 0 &&
        Object.values(report.resources).every((n) => n === 0) &&
        report.instances.every(
          (i) =>
            ['DISPOSED', 'FAILED'].includes(i.state) &&
            !i.cleanup.restartRequired &&
            i.cleanup.timedOutResources === 0 &&
            i.cleanup.failedDisposers.length === 0,
        ),
      'FAILED_PRECONDITION',
    );
    this.#host = undefined;
    this.#stopped = true;
    return report;
  }
  async #run(operation) {
    this.#guard();
    check(!this.#busy, 'CONFLICT');
    this.#busy = true;
    try {
      return await operation();
    } finally {
      this.#busy = false;
    }
  }
  initialize(material, floor) {
    return this.#run(() =>
      this.#initialize(parse(canonical(material)), parse(canonical(floor))),
    );
  }
  stage(archivePath, material, authorization) {
    return this.#run(() =>
      this.#stage(
        archivePath,
        parse(canonical(material)),
        parse(canonical(authorization)),
      ),
    );
  }
  constructor(root) {
    this.#fd = openPrivateRoot(root);
    try {
      lockRoot(this.#fd);
    } catch (e) {
      closeSync(this.#fd);
      this.#fd = undefined;
      throw e;
    }
  }
  close() {
    check(!this.#busy && !this.#host, 'CONFLICT');
    if (this.#fd !== undefined) closeSync(this.#fd);
    this.#fd = undefined;
  }
  #guard() {
    check(this.#fd !== undefined && !this.#failed, 'FAILED_PRECONDITION');
  }
  #read(p, max) {
    this.#guard();
    return parse(readPrivate(this.#fd, p, max), max);
  }
  #write(p, v, replace = false) {
    this.#guard();
    try {
      durableWrite(this.#fd, p, bytes(v), {
        replace,
        maximum: limits.jsonBytes,
      });
    } catch (e) {
      this.#failed = true;
      throw e;
    }
  }
  #base() {
    this.#guard();
    const names = listPrivate(this.#fd);
    // Public Kernel creates private g6-XXXXXX socket directories beside its
    // state file. Validate their ownership/path without treating their presence
    // or absence as authority or proof of worker death.
    for (const n of names.filter((n) => /^g6-[A-Za-z0-9]{6}$/.test(n)))
      listPrivate(this.#fd, n);
    check(
      names.every(
        (n) =>
          [
            'identity.json',
            'floor.json',
            'kernel.json',
            'transactions',
            'releases',
            'accepted.json',
          ].includes(n) || /^g6-[A-Za-z0-9]{6}$/.test(n),
      ),
      'FAILED_PRECONDITION',
    );
    const id = this.#read('identity.json');
    check(
      same(Object.keys(id).sort(), ['cellId', 'schemaVersion']) &&
        id.schemaVersion === 'alica.cell-identity/v1' &&
        /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id.cellId),
    );
    const floor = cellSchema('floor', this.#read('floor.json'));
    // Preserve Kernel-owned bytes; do not decode, repair or reset them.
    readPrivate(this.#fd, 'kernel.json');
    return { id, floor };
  }
  #trust(material, floor) {
    return verifyCurrentTrust(material, floor);
  }
  #advance(material, floor) {
    this.#trust(material, floor);
    const next = {
      rootKeyId: material.rootKeyId,
      policyVersion: material.policy.version,
      revocationVersion: material.revocation.version,
      lastWallMs: Date.now(),
    };
    monotonic(floor, next);
    this.#write('floor.json', next, true);
    return next;
  }
  async #initialize(material, floor) {
    this.#guard();
    check(listPrivate(this.#fd).length === 0, 'CONFLICT');
    cellSchema('floor', floor);
    this.#trust(material, floor);
    const id = {
      schemaVersion: 'alica.cell-identity/v1',
      cellId: randomUUID(),
    };
    // Incomplete initialization remains dirty and cannot silently mint a new identity.
    this.#write('identity.json', id);
    this.#write('floor.json', {
      rootKeyId: floor.rootKeyId,
      policyVersion: material.policy.version,
      revocationVersion: material.revocation.version,
      lastWallMs: Date.now(),
    });
    let h;
    try {
      h = bootstrap(configuration(id.cellId, 'root'), {
        trust: material,
        statePath: '/proc/' + process.pid + '/fd/' + this.#fd + '/kernel.json',
        initialize: true,
      });
    } catch (e) {
      this.#failed = true;
      throw e;
    } finally {
      if (h) await h.shutdown();
    }
    return { cellId: id.cellId, accepted: null, runtime: 'UNAVAILABLE' };
  }
  #journals() {
    let names;
    try {
      names = listPrivate(this.#fd, 'transactions');
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    return names.sort().map((name) => {
      check(/^[0-9a-f-]{36}$/.test(name));
      const dir = 'transactions/' + name;
      const files = listPrivate(this.#fd, dir).sort();
      check(files.length > 0 && files.length <= limits.journalRecords);
      const rows = files.map((file, i) => {
        check(file === String(i + 1).padStart(6, '0') + '.json');
        return this.#read(dir + '/' + file, limits.journalRecordBytes);
      });
      const last = validateJournal(rows);
      check(last.transactionId === name);
      return { rows, last };
    });
  }
  status() {
    check(!this.#busy, 'CONFLICT');
    return this.#status();
  }
  #status() {
    const { id, floor } = this.#base(),
      journals = this.#journals();
    const accepted = listPrivate(this.#fd).includes('accepted.json')
      ? cellSchema('accepted', this.#read('accepted.json'))
      : null;
    if (accepted) {
      check(accepted.cellId === id.cellId, 'FAILED_PRECONDITION');
      monotonic(accepted.trustFloor, floor);
      const match = journals.find(
        (j) => j.last.transactionId === accepted.transactionId,
      );
      check(
        match &&
          ['ACTIVATING', 'COMMITTED', 'RECOVERING', 'NEEDS_OPERATOR'].includes(
            match.last.state,
          ) &&
          match.last.targetRevision === accepted.sequence &&
          same(match.last.target, accepted.release),
        'FAILED_PRECONDITION',
      );
      const activation = match.rows.find(
        (r) => r.record.state === 'ACTIVATING',
      );
      check(activation, 'FAILED_PRECONDITION');
      monotonic(activation.record.trustFloor, accepted.trustFloor);
      if (match.last.state === 'COMMITTED')
        check(
          same(match.last.trustFloor, accepted.trustFloor),
          'FAILED_PRECONDITION',
        );
    }
    for (const { last } of journals) {
      check(
        last.cellId === id.cellId &&
          last.prior === null &&
          last.priorRevision === 0 &&
          last.targetRevision === 1,
        'FAILED_PRECONDITION',
      );
      monotonic(last.trustFloor, floor);
      if (last.state === 'COMMITTED')
        check(
          accepted?.transactionId === last.transactionId,
          'FAILED_PRECONDITION',
        );
    }
    check(
      journals.filter((j) => j.last.state !== 'ABORTED').length <= 1,
      'FAILED_PRECONDITION',
    );
    const live = this.#running ? this.#host.inspect() : undefined;
    return {
      cellId: id.cellId,
      accepted,
      runtime: this.#running
        ? !live.auditUnavailable &&
          live.instances.every((i) => i.state === 'ACTIVE') &&
          live.grants.every((g) => g.valid && !g.revoked)
          ? 'RUNNING'
          : 'FAILED'
        : this.#stopped
          ? 'STOPPED'
          : journals.some((j) =>
                j.rows.some((r) => r.record.state === 'ACTIVATING'),
              )
            ? 'NEEDS_OPERATOR'
            : 'UNAVAILABLE',
      trustFloor: floor,
      transactions: journals.map((j) => ({
        transactionId: j.last.transactionId,
        state: j.last.state,
      })),
    };
  }
  #append(rows, record) {
    const item = { record, checksum: digest(record) };
    validateJournal([...rows, item]);
    try {
      durableWrite(
        this.#fd,
        'transactions/' +
          record.transactionId +
          '/' +
          String(record.sequence).padStart(6, '0') +
          '.json',
        bytes(item),
        { maximum: limits.journalRecordBytes },
      );
    } catch (e) {
      this.#failed = true;
      throw e;
    }
    rows.push(item);
  }
  #transition(rows, state, floor, outcome) {
    const last = rows.at(-1);
    this.#append(rows, {
      ...last.record,
      sequence: last.record.sequence + 1,
      previousHash: last.checksum,
      state,
      trustFloor: floor,
      outcome,
    });
  }
  async #stage(archivePath, material, authorization, activate = false) {
    const status = this.#status();
    check(
      status.transactions.every((t) => t.state === 'ABORTED'),
      'CONFLICT',
    );
    const floor = this.#advance(material, status.trustFloor);
    const inspected = inspectRelease(archivePath, material, floor);
    cellSchema('authorization', authorization);
    check(
      authorization.profileDigest === inspected.profileDigest,
      'PERMISSION_DENIED',
    );
    const seen = new Set();
    for (const c of authorization.capabilities) {
      const k = [c.principal, c.scope, c.capabilityId].join('|');
      check(!seen.has(k), 'CONFLICT');
      seen.add(k);
      check(
        inspected.profile.plugins.some((p) => p.id === c.principal) &&
          inspected.profile.scopes.some((s) => s.id === c.scope),
        'PERMISSION_DENIED',
      );
    }
    const target = Object.fromEntries(
      ['bundleDigest', 'profileDigest', 'lockDigest', 'policyDigest'].map(
        (k) => [k, inspected[k]],
      ),
    );
    target.authorizationDigest = digest(authorization);
    const transactionId = randomUUID(),
      rows = [];
    this.#append(rows, {
      schemaVersion: 'alica.cell-journal/v1',
      cellId: status.cellId,
      transactionId,
      sequence: 1,
      priorRevision: 0,
      targetRevision: 1,
      operation: 'install',
      state: 'STAGING',
      prior: null,
      target,
      trustFloor: floor,
      previousHash: null,
      outcome: 'PENDING',
    });
    const archive = openArchive(archivePath);
    const prefix = 'releases/' + inspected.bundleDigest.slice(7);
    try {
      const space = statfsSync('/proc/self/fd/' + this.#fd);
      check(
        space.bavail * space.bsize >=
          archive.entries.reduce((n, e) => n + e.bytes, 0) +
            limits.diskReserveBytes,
        'RESOURCE_EXHAUSTED',
      );
      check(
        digest(parse(archive.read('bundle.json'))) === inspected.bundleDigest,
        'CONTRACT_MISMATCH',
      );
      const bundle = parse(archive.read('bundle.json'));
      check(archive.entries.length === bundle.artifacts.length + 2);
      for (const entry of archive.entries.slice(2)) {
        const a = bundle.artifacts.find((a) => a.path === entry.path);
        check(
          a && a.bytes === entry.bytes && a.digest === entry.digest,
          'CONTRACT_MISMATCH',
        );
      }
      for (const entry of archive.entries)
        durableWrite(
          this.#fd,
          prefix + '/' + entry.path,
          archive.read(entry.path),
          { maximum: limits.fileBytes },
        );
      this.#write(prefix + '/authorization.json', authorization);
      await this.#admit(
        prefix,
        inspected,
        material,
        status.cellId,
        authorization,
      );
      const fresh = this.#advance(material, floor);
      this.#transition(rows, 'VERIFIED', fresh, 'PENDING');
      if (activate)
        return await this.#activate(
          prefix,
          inspected,
          material,
          status.cellId,
          authorization,
          rows,
        );
      return {
        transactionId,
        state: 'VERIFIED',
        accepted: null,
        runtime: 'UNAVAILABLE',
        qualification: 'NOT_QUALIFIED',
      };
    } catch (e) {
      this.#failed = true;
      throw e;
    } finally {
      archive.close();
    }
  }
  async #admit(
    prefix,
    inspected,
    material,
    cellId,
    authorization,
    retain = false,
  ) {
    const read = (p) => readPrivate(this.#fd, prefix + '/' + p);
    const rootScope = inspected.profile.scopes.find(
      (s) => s.parent === null,
    ).id;
    // Non-root intent is unavailable in this bounded implementation, never widened.
    check(
      authorization.capabilities.every((c) => c.scope === rootScope),
      'PERMISSION_DENIED',
    );
    check(
      !listPrivate(this.#fd).includes('kernel.json.next'),
      'FAILED_PRECONDITION',
    );
    readPrivate(this.#fd, 'kernel.json');
    const h = bootstrap(configuration(cellId, rootScope), {
      trust: material,
      statePath: '/proc/' + process.pid + '/fd/' + this.#fd + '/kernel.json',
      initialize: false,
    });
    if (retain) this.#host = h;
    try {
      const ids = new Map();
      for (const p of inspected.profile.plugins) {
        const base = 'plugins/' + p.id + '/',
          indexText = read(base + 'index.json').toString();
        const index = parse(indexText),
          files = Object.fromEntries(
            index.files.map((f) => [f.path, read(base + f.path)]),
          );
        ids.set(
          p.id,
          h.discoverReleasePackage({
            packagePrefix: base,
            indexText,
            files,
            bundleText: read('bundle.json').toString(),
            profileText: read('profile/profile.json').toString(),
            signature: parse(read('bundle-signature.json')),
          }),
        );
      }
      for (const c of authorization.capabilities) {
        const declared = inspected.lock.bindings.filter(
          (b) =>
            b.consumerId === c.principal && b.capabilityId === c.capabilityId,
        );
        check(declared.length > 0, 'PERMISSION_DENIED');
        const manifest = parse(
          read('plugins/' + c.principal + '/manifest.json'),
        );
        const req = manifest.requires.find(
          (r) => r.capabilityId === c.capabilityId,
        );
        check(
          req && c.operations.every((o) => req.operations.includes(o)),
          'PERMISSION_DENIED',
        );
        this.#trust(material, this.#read('floor.json'));
        const now = Date.now();
        h.issueGrant({
          schemaVersion: 'acap.grant/v1',
          grantId: randomUUID(),
          ...h.identity(ids.get(c.principal)),
          capabilityId: c.capabilityId,
          operations: c.operations,
          issuedAtMs: now,
          expiresAtMs: Math.min(
            now + c.lifetimeMs,
            material.policy.expiresAtMs,
            material.revocation.expiresAtMs,
          ),
          revision: 0,
        });
      }
      check(
        same(h.plan(canonical(inspected.profile)).lock, inspected.lock),
        'CONTRACT_MISMATCH',
      );
      return { h, ids };
    } finally {
      if (!retain) await h.shutdown();
    }
  }
  async #activate(prefix, inspected, material, cellId, authorization, rows) {
    let publishing = false;
    let floor = this.#advance(material, this.#read('floor.json'));
    this.#transition(rows, 'ACTIVATING', floor, 'PENDING');
    this.#stopped = false;
    try {
      const { h, ids } = await this.#admit(
        prefix,
        inspected,
        material,
        cellId,
        authorization,
        true,
      );
      await h.startProfile(canonical(inspected.profile));
      // Fixed synthetic readiness contract, never a caller-supplied callback.
      for (const capabilityId of ['org.alica.echo', 'org.alica.consumer']) {
        const intent = authorization.capabilities.find(
          (c) =>
            c.capabilityId === capabilityId && c.operations.includes('echo'),
        );
        check(intent, 'PERMISSION_DENIED');
        const bound = await h.context(ids.get(intent.principal)).require({
          capabilityId,
          major: 1,
          minMinor: 0,
          operations: ['echo'],
          features: [],
        });
        const text = 'g7-readiness-' + randomUUID();
        const result = await bound.call(
          'echo',
          { text },
          { deadlineMs: Date.now() + 1000 },
        );
        check(same(result, { text }), 'CONTRACT_MISMATCH');
      }
      check(
        h.inspect().instances.every((i) => i.state === 'ACTIVE'),
        'FAILED_PRECONDITION',
      );
      floor = this.#advance(material, floor);
      const last = rows.at(-1).record;
      const accepted = cellSchema('accepted', {
        schemaVersion: 'alica.cell-accepted/v1',
        cellId,
        transactionId: last.transactionId,
        sequence: last.targetRevision,
        release: last.target,
        trustFloor: floor,
      });
      publishing = true;
      this.#write('accepted.json', accepted, true);
      this.#transition(rows, 'COMMITTED', floor, 'OK');
      this.#running = true;
      return this.#status();
    } catch (error) {
      let clean = false;
      try {
        await this.#shutdown();
        clean = !this.#host;
      } catch {
        /* no fabricated reap */
      }
      if (!publishing && !this.#failed) {
        this.#transition(
          rows,
          'RECOVERING',
          floor,
          clean ? 'ACTIVATION_FAILED' : 'CLEANUP_UNCERTAIN',
        );
        this.#transition(
          rows,
          clean ? 'ABORTED' : 'NEEDS_OPERATOR',
          floor,
          clean ? 'ACTIVATION_FAILED' : 'CLEANUP_UNCERTAIN',
        );
      }
      // Durability uncertainty preserves evidence and never rolls selection back.
      throw error;
    }
  }
  recover(material) {
    return this.#run(() => this.#recover(parse(canonical(material))));
  }
  async #recover(material) {
    const status = this.#status();
    check(!this.#host, 'CONFLICT');
    const floor = this.#advance(material, status.trustFloor);
    // Public Kernel enforces same-version digest continuity as well as current
    // signatures/freshness. The opaque persisted Kernel high-water is not reset.
    let h;
    try {
      h = bootstrap(configuration(status.cellId, 'root'), {
        trust: material,
        statePath: '/proc/' + process.pid + '/fd/' + this.#fd + '/kernel.json',
        initialize: false,
      });
    } catch (e) {
      this.#failed = true;
      throw e;
    } finally {
      if (h) await h.shutdown();
    }
    if (
      this.#journals().some((j) =>
        j.rows.some((r) => r.record.state === 'ACTIVATING'),
      )
    ) {
      for (const { rows, last } of this.#journals()) {
        if (['ABORTED', 'COMMITTED', 'NEEDS_OPERATOR'].includes(last.state))
          continue;
        if (last.state !== 'RECOVERING')
          this.#transition(rows, 'RECOVERING', floor, 'CLEANUP_UNCERTAIN');
        this.#transition(rows, 'NEEDS_OPERATOR', floor, 'CLEANUP_UNCERTAIN');
      }
      return this.#status();
    }
    for (const { rows, last } of this.#journals()) {
      if (last.state === 'ABORTED') continue;
      check(
        ['STAGING', 'VERIFIED', 'RECOVERING'].includes(last.state),
        'FAILED_PRECONDITION',
      );
      if (last.state !== 'RECOVERING')
        this.#transition(rows, 'RECOVERING', floor, 'CRASH_RECONCILIATION');
      this.#transition(rows, 'ABORTED', floor, 'CRASH_RECONCILIATION');
    }
    return this.#status();
  }
}
