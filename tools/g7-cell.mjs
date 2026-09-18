// Lifetime-locked Cell. Supervised custody is host-only; upgrade remains unavailable.
import { OwnerChannel } from './g7-owner-channel.mjs';
import { ownedStop } from './g7-owned-bridge.mjs';
import {
  closeSync,
  readFileSync,
  statfsSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
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
import {
  inspectRelease,
  inspectStoredRelease,
  verifyCurrentTrust,
} from './g7-release.mjs';
const require = createRequire(import.meta.url);
const { lockRoot, adoptRoot } = require('../native/g7/build/ownership.node');
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
// Real monotonic elapsed time; one budget across all awaits in a phase.
// Race only leaf Kernel promises, never a continuation that can publish selection.
function deadline(ms) {
  const end = process.hrtime.bigint() + BigInt(ms) * 1000000n;
  let expired = false;
  const timeout = () =>
    Object.assign(new Error('Cell deadline exceeded'), { code: 'TIMEOUT' });
  const remaining = () => Number(end - process.hrtime.bigint()) / 1000000;
  const assert = () => {
    if (expired || remaining() <= 0) {
      expired = true;
      throw timeout();
    }
  };
  return {
    assert,
    async wait(start) {
      assert();
      let timer;
      try {
        const value = await Promise.race([
          Promise.resolve().then(() => {
            assert();
            return start();
          }),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => {
                expired = true;
                reject(timeout());
              },
              Math.max(1, remaining()),
            );
          }),
        ]);
        assert();
        return value;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
function outcome(error, runtime) {
  // In-process error metadata only, not a new admin wire/schema contract.
  return Object.assign(error, {
    runtime,
    outcome:
      runtime === 'NEEDS_OPERATOR' ? 'CLEANUP_UNCERTAIN' : 'ACTIVATION_FAILED',
  });
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
// Cross-transaction validation is independent of UUID/directory ordering.
// Committed history must be contiguous and unique; aborted attempts may share a
// revision but must bind the actual committed prior, never a caller's substitute.
export function validateHistory(journals, accepted, cellId, floor) {
  const committed = new Map();
  const starts = new Map();
  const pending = [];
  for (const { rows, last } of journals) {
    check(last.cellId === cellId, 'FAILED_PRECONDITION');
    monotonic(last.trustFloor, floor);
    check(
      (last.priorRevision === 0) === (last.prior === null),
      'FAILED_PRECONDITION',
    );
    check(
      last.operation !== 'install' || last.priorRevision === 0,
      'FAILED_PRECONDITION',
    );
    check(
      last.operation !== 'upgrade' || last.priorRevision > 0,
      'FAILED_PRECONDITION',
    );
    if (last.state === 'COMMITTED') {
      check(!committed.has(last.targetRevision), 'FAILED_PRECONDITION');
      committed.set(last.targetRevision, last);
      starts.set(last.targetRevision, rows[0].record.trustFloor);
    } else if (last.state !== 'ABORTED') pending.push(last);
  }
  check(pending.length <= 1, 'FAILED_PRECONDITION');
  for (let revision = 1; revision <= committed.size; revision++)
    check(committed.has(revision), 'FAILED_PRECONDITION');
  for (const { rows, last } of journals) {
    if (last.priorRevision > 0) {
      const prior = committed.get(last.priorRevision);
      check(prior && same(prior.target, last.prior), 'FAILED_PRECONDITION');
      monotonic(prior.trustFloor, rows[0].record.trustFloor);
    }
    check(last.priorRevision <= committed.size, 'FAILED_PRECONDITION');
    if (last.state === 'ABORTED' && starts.has(last.targetRevision))
      monotonic(last.trustFloor, starts.get(last.targetRevision));
  }
  const tip = committed.get(committed.size);
  if (pending.length)
    check(pending[0].priorRevision === committed.size, 'FAILED_PRECONDITION');
  if (!accepted) check(!tip, 'FAILED_PRECONDITION');
  else {
    const selected = committed.get(accepted.sequence);
    if (selected)
      check(
        selected === tip &&
          selected.transactionId === accepted.transactionId &&
          same(selected.target, accepted.release),
        'FAILED_PRECONDITION',
      );
    else
      check(
        pending.length === 1 &&
          pending[0].transactionId === accepted.transactionId &&
          pending[0].targetRevision === accepted.sequence &&
          ['ACTIVATING', 'RECOVERING', 'NEEDS_OPERATOR'].includes(
            pending[0].state,
          ) &&
          same(pending[0].target, accepted.release),
        'FAILED_PRECONDITION',
      );
  }
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
// Standalone instances hold a separate flock description; supervised owners adopt
// the custodian's SAME held description. No public death assertion, supplied clock,
// readiness callback, or offline mutation escape hatch.
export class CellPreparation {
  #fd;
  #channel;
  #root;
  #owned = false;
  #session = false;
  #serving = false;
  #watch;
  #failed = false;
  #busy = false;
  #host;
  #stopped = false;
  #running = false;
  #cleanupUncertain = false;
  #cleanAbort;
  #priorRecovery;
  // Starts the actual coordinator relationship, not adoption of stopped residue.
  // No clean/PID/socket/receipt input exists. Only the lexical child lifecycle
  // below may confer #stopped on this independently running maintenance process.
  ownedReinstall(inputs) {
    return this.#ownedLifecycle(inputs);
  }
  ownedUpgrade(priorInputs, targetInputs) {
    return this.#ownedLifecycle(priorInputs, targetInputs);
  }
  // Foreground orchestration only. This never accepts a receipt or adopts a
  // detached Cell. Each maintenance entry seals admission and normally reaps
  // a newly owned custodian/owner before any original Cell access.
  ownedBegin(inputs) {
    return this.#ownedLifecycle(inputs, undefined, true);
  }
  ownedWait() {
    this.#guard();
    check(this.#session && this.#watch, 'FAILED_PRECONDITION');
    return this.#watch.lost;
  }
  #local(input) {
    const path = resolve(input),
      fd = openPrivateRoot(dirname(path));
    let current;
    try {
      current = parse(readPrivate(fd, basename(path)));
    } finally {
      closeSync(fd);
    }
    check(
      Object.keys(current).sort().join(',') === 'archive,authorization,trust',
    );
    return current;
  }
  #ownedOperation(operation) {
    return this.#run(async () => {
      check(this.#session && this.#watch && !this.#host, 'FAILED_PRECONDITION');
      try {
        return await operation();
      } catch (error) {
        // Only #activate mints this lexical result after actual Kernel cleanup
        // and durable ABORTED. Public error fields/receipts are not authority.
        if (error === this.#cleanAbort && this.#priorRecovery) {
          this.#cleanAbort = undefined;
          throw error;
        }
        this.#failed = true;
        this.#stopped = false;
        this.#watch.abandon();
        throw outcome(error, 'NEEDS_OPERATOR');
      }
    }, true);
  }
  ownedServe(inputs) {
    return this.#ownedOperation(async () => {
      check(!this.#priorRecovery, 'FAILED_PRECONDITION');
      check(!this.#serving && this.#stopped, 'FAILED_PRECONDITION');
      const current = this.#local(inputs);
      const result = await this.#stage(
        current.archive,
        current.trust,
        current.authorization,
        true,
      );
      const selection = {
        status: 'STOPPED',
        sequence: result.accepted.sequence,
        acceptedDigest: digest(result.accepted),
      };
      this.#stopped = false;
      await this.#watch.serve(resolve(inputs), selection);
      this.#serving = true;
      // This reports the just-observed readiness, not cached future liveness.
      // Subsequent status/stop/start remain on the unchanged live admin protocol.
      return { ...result, runtime: 'RUNNING' };
    });
  }
  ownedMaintain(inputs, targetInputs) {
    return this.#ownedOperation(async () => {
      check(this.#serving, 'FAILED_PRECONDITION');
      await this.#watch.seal();
      this.#serving = false;
      const status = this.#status();
      check(
        status.accepted &&
          status.accepted.sequence === this.#watch.stopped.sequence &&
          digest(status.accepted) === this.#watch.stopped.acceptedDigest,
        'CONFLICT',
      );
      this.#stopped = true;
      const current = this.#local(inputs);
      let result = await this.#stage(
        current.archive,
        current.trust,
        current.authorization,
        true,
      );
      if (targetInputs !== undefined) {
        const target = this.#local(targetInputs);
        try {
          await this.#stage(
            target.archive,
            target.trust,
            target.authorization,
            true,
            true,
          );
        } catch (error) {
          if (error === this.#cleanAbort) {
            this.#watch.assert();
            const stopped = this.#status();
            check(
              !this.#failed &&
                !this.#cleanupUncertain &&
                this.#stopped &&
                !this.#host &&
                !this.#running &&
                same(stopped.accepted, status.accepted) &&
                stopped.transactions.every((t) =>
                  ['COMMITTED', 'ABORTED'].includes(t.state),
                ),
              'FAILED_PRECONDITION',
            );
            this.#priorRecovery = digest(status.accepted);
          }
          throw error;
        }
        await this.#shutdown();
        result = this.#status();
      }
      return result;
    });
  }
  // Explicit choice, not rollback: the original prior selection never moved.
  // Independent current authority and both retained/requested bytes are checked.
  // Serving is separate and requires fresh grants/readiness in a new owner.
  ownedRecoverPrior(inputs) {
    return this.#ownedOperation(async () => {
      check(
        this.#priorRecovery && !this.#serving && this.#stopped,
        'FAILED_PRECONDITION',
      );
      check(
        digest(this.#status().accepted) === this.#priorRecovery,
        'CONFLICT',
      );
      const current = this.#local(inputs);
      const result = await this.#stage(
        current.archive,
        current.trust,
        current.authorization,
        true,
      );
      this.#watch.assert();
      check(digest(result.accepted) === this.#priorRecovery, 'CONFLICT');
      this.#priorRecovery = undefined;
      return result;
    });
  }
  ownedFinish() {
    return this.#ownedOperation(async () => {
      check(!this.#serving && this.#stopped, 'FAILED_PRECONDITION');
      const result = this.#status();
      await this.#watch.finish();
      this.#watch = undefined;
      this.#session = false;
      return result;
    });
  }
  #ownedLifecycle(inputs, targetInputs, continuous = false) {
    return this.#run(async () => {
      check(
        !this.#channel &&
          !this.#owned &&
          !this.#host &&
          !listPrivate(this.#fd).includes('supervision'),
        'FAILED_PRECONDITION',
      );
      this.#owned = true;
      try {
        this.#watch = await ownedStop(this.#root, resolve(inputs), this.#fd);
        this.#watch.lost.catch(() => {
          this.#failed = true;
          this.#stopped = false;
          this.#serving = false;
        });
        const status = this.#status();
        check(
          status.accepted &&
            status.accepted.sequence === this.#watch.stopped.sequence &&
            digest(status.accepted) === this.#watch.stopped.acceptedDigest,
          'CONFLICT',
        );
        this.#stopped = true;
        // Re-read independent operator inputs AFTER clean owned reaps, not the
        // initial child's cached trust or an archive-supplied authorization.
        const current = this.#local(inputs);
        let result = await this.#stage(
          current.archive,
          current.trust,
          current.authorization,
          true,
        );
        if (targetInputs !== undefined) {
          const target = this.#local(targetInputs);
          result = await this.#stage(
            target.archive,
            target.trust,
            target.authorization,
            true,
            true,
          );
          await this.#shutdown();
          result = this.#status();
        }
        if (continuous) this.#session = true;
        else {
          await this.#watch.finish();
          this.#watch = undefined;
        }
        return result;
      } catch (error) {
        this.#failed = true;
        this.#stopped = false;
        this.#watch?.abandon();
        this.#watch = undefined;
        throw outcome(error, 'NEEDS_OPERATOR');
      }
    });
  }
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
  // Host-only continuation: only the continuously holding supervisor may supply
  // this selection after clean shutdown AND exact previous child reap.
  startAccepted(material, authorization, expectedDigest) {
    return this.#run(() =>
      this.#startAccepted(
        parse(canonical(material)),
        parse(canonical(authorization)),
        expectedDigest,
      ),
    );
  }
  async #startAccepted(material, authorization, expectedDigest) {
    check(this.#channel && !this.#host && !this.#running, 'PERMISSION_DENIED');
    const verification = deadline(limits.verifyTimeoutMs);
    try {
      const status = this.#status(),
        accepted = status.accepted;
      check(
        accepted &&
          digest(accepted) === expectedDigest &&
          status.transactions.every((t) =>
            ['COMMITTED', 'ABORTED'].includes(t.state),
          ),
        'FAILED_PRECONDITION',
      );
      cellSchema('authorization', authorization);
      check(
        digest(authorization) === accepted.release.authorizationDigest,
        'PERMISSION_DENIED',
      );
      const prefix = 'releases/' + accepted.release.bundleDigest.slice(7);
      check(
        same(this.#read(prefix + '/authorization.json'), authorization),
        'PERMISSION_DENIED',
      );
      const inspected = inspectStoredRelease(
        this.#fd,
        prefix,
        material,
        status.trustFloor,
      );
      for (const k of [
        'bundleDigest',
        'profileDigest',
        'lockDigest',
        'policyDigest',
      ])
        check(inspected[k] === accepted.release[k], 'CONTRACT_MISMATCH');
      const floor = this.#advance(material, status.trustFloor);
      verification.assert();
      await this.#channel.send({ phase: 'activation' });
      const budget = deadline(limits.activationTimeoutMs);
      this.#stopped = false;
      const { h, ids } = await this.#admit(
        prefix,
        inspected,
        material,
        status.cellId,
        authorization,
        true,
      );
      await this.#ready(h, ids, inspected, authorization, budget);
      this.#advance(material, floor);
      budget.assert();
      // Same accepted revision/transaction/profile. No journal reopening/publication.
      check(digest(this.#read('accepted.json')) === expectedDigest, 'CONFLICT');
      this.#running = true;
      return this.#status();
    } catch (error) {
      try {
        await this.#shutdown();
      } catch {
        /* uncertainty is sticky */
      }
      this.#failed = true;
      this.#stopped = false;
      throw outcome(error, 'NEEDS_OPERATOR');
    }
  }
  shutdown() {
    check(!this.#session, 'CONFLICT');
    check(!this.#busy, 'CONFLICT');
    this.#busy = true;
    return this.#shutdown().finally(() => {
      this.#busy = false;
    });
  }
  async #shutdown() {
    this.#running = false;
    if (!this.#host) return;
    try {
      await (this.#channel ?? this.#watch)?.send({ phase: 'cleanup' });
      const budget = deadline(limits.cleanupTimeoutMs);
      // A second Kernel shutdown can return an interim inspect report. Never
      // use that as proof that the original shutdown completed.
      check(!this.#cleanupUncertain, 'FAILED_PRECONDITION');
      const report = await budget.wait(() => this.#host.shutdown());
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
    } catch (error) {
      this.#cleanupUncertain = true;
      this.#failed = true;
      this.#stopped = false;
      throw outcome(error, 'NEEDS_OPERATOR');
    } finally {
      await (this.#channel ?? this.#watch)?.send({ phase: 'resume' });
    }
  }
  async #run(operation, ownedOperation = false) {
    this.#guard();
    check(!this.#session || ownedOperation, 'CONFLICT');
    check(!this.#owned || this.#watch, 'FAILED_PRECONDITION');
    check(!this.#busy, 'CONFLICT');
    this.#busy = true;
    try {
      return await operation();
    } catch (error) {
      if (this.#failed) throw outcome(error, 'NEEDS_OPERATOR');
      throw error;
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
  constructor(root, custody) {
    this.#root = resolve(root);
    this.#fd = openPrivateRoot(root);
    try {
      if (custody !== undefined) {
        check(custody.channel instanceof OwnerChannel, 'PERMISSION_DENIED');
        const adopted = adoptRoot(custody.fd, this.#fd);
        closeSync(this.#fd);
        this.#fd = adopted;
        this.#channel = custody.channel;
      } else {
        lockRoot(this.#fd);
        // Durable custody residue is not stale-PID evidence. No automatic takeover.
        check(
          !listPrivate(this.#fd).includes('supervision'),
          'FAILED_PRECONDITION',
        );
      }
    } catch (e) {
      closeSync(this.#fd);
      this.#fd = undefined;
      throw e;
    }
  }
  close() {
    check(!this.#session && !this.#watch, 'CONFLICT');
    check(!this.#owned || !this.#failed, 'FAILED_PRECONDITION');
    check(!this.#busy && !this.#host, 'CONFLICT');
    if (this.#fd !== undefined) closeSync(this.#fd);
    this.#fd = undefined;
  }
  #guard() {
    this.#watch?.assert();
    if (this.#failed)
      throw outcome(
        Object.assign(new Error('Cell requires operator review'), {
          code: 'FAILED_PRECONDITION',
        }),
        'NEEDS_OPERATOR',
      );
    check(this.#fd !== undefined, 'FAILED_PRECONDITION');
  }
  #read(p, max) {
    this.#guard();
    return parse(readPrivate(this.#fd, p, max), max);
  }
  #write(p, v, replace = false, budget) {
    this.#guard();
    try {
      durableWrite(this.#fd, p, bytes(v), {
        replace,
        maximum: limits.jsonBytes,
        boundary: () => {
          budget?.assert();
          this.#watch?.assert();
        },
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
            ...(this.#channel || this.#owned ? ['supervision'] : []),
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
      if (h) {
        this.#host = h;
        await this.#shutdown();
        this.#stopped = false;
      }
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
    check(!this.#serving, 'CONFLICT');
    check(!this.#busy, 'CONFLICT');
    return this.#status();
  }
  #status() {
    try {
      return this.#validatedStatus();
    } catch (error) {
      this.#failed = true;
      throw outcome(error, 'NEEDS_OPERATOR');
    }
  }
  #validatedStatus() {
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
    validateHistory(journals, accepted, id.cellId, floor);
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
        {
          maximum: limits.journalRecordBytes,
          boundary: () => this.#watch?.assert(),
        },
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
  async #exactReinstall(archivePath, material, authorization, status, budget) {
    // This flag is set ONLY by this object's clean public Kernel shutdown, under
    // its continuously held flock. A new object, readable journal, or STOPPED
    // admin reply cannot supply it. This is not offline custody transfer.
    check(
      this.#stopped && !this.#host && !this.#running,
      'FAILED_PRECONDITION',
    );
    check(
      status.transactions.every((t) =>
        ['COMMITTED', 'ABORTED'].includes(t.state),
      ),
      'FAILED_PRECONDITION',
    );
    const accepted = status.accepted;
    cellSchema('authorization', authorization);
    check(
      digest(authorization) === accepted.release.authorizationDigest,
      'PERMISSION_DENIED',
    );
    const prefix = 'releases/' + accepted.release.bundleDigest.slice(7);
    check(
      same(this.#read(prefix + '/authorization.json'), authorization),
      'PERMISSION_DENIED',
    );
    // Validate BOTH the existing accepted inventory and the entire requested tar.
    // A matching manifest digest alone is not an exact-reinstall certificate.
    const stored = inspectStoredRelease(
      this.#fd,
      prefix,
      material,
      status.trustFloor,
    );
    const requested = inspectRelease(archivePath, material, status.trustFloor);
    for (const k of [
      'bundleDigest',
      'profileDigest',
      'lockDigest',
      'policyDigest',
    ])
      check(
        stored[k] === accepted.release[k] &&
          requested[k] === accepted.release[k],
        'CONTRACT_MISMATCH',
      );
    budget.assert();
    // Public Kernel bootstrap enforces its own opaque high-water semantics,
    // including same-version digest continuity and clock rollback. It persists
    // on bootstrap, so validate a verbatim private working copy, NEVER rewrite
    // or decode the original Kernel state to manufacture a read-only result.
    const original = readPrivate(this.#fd, 'kernel.json');
    const directory = mkdtempSync(join(tmpdir(), 'g7-reinstall-trust-'));
    try {
      const statePath = join(directory, 'kernel.json');
      writeFileSync(statePath, original, { mode: 0o600, flag: 'wx' });
      this.#host = bootstrap(
        configuration(
          status.cellId,
          stored.profile.scopes.find((s) => s.parent === null).id,
        ),
        {
          trust: material,
          statePath,
          initialize: false,
        },
      );
      // No packages, grants, providers or synthetic mutations are started for a no-op.
      await this.#shutdown();
      budget.assert();
      check(original.equals(readPrivate(this.#fd, 'kernel.json')), 'CONFLICT');
      check(same(this.#status(), status), 'CONFLICT');
      this.#trust(material, status.trustFloor);
      budget.assert();
      return status;
    } finally {
      // Uncertain cleanup retains the host, lock and private diagnostic residue.
      if (!this.#host) rmSync(directory, { recursive: true });
    }
  }
  async #stage(
    archivePath,
    material,
    authorization,
    activate = false,
    upgrade = false,
  ) {
    const verification = deadline(limits.verifyTimeoutMs);
    const status = this.#status();
    if (status.accepted && !upgrade) {
      check(activate, 'CONFLICT');
      return this.#exactReinstall(
        archivePath,
        material,
        authorization,
        status,
        verification,
      );
    }
    if (upgrade) {
      check(
        status.accepted &&
          this.#stopped &&
          !this.#host &&
          !this.#running &&
          this.#watch,
        'FAILED_PRECONDITION',
      );
      const candidate = inspectRelease(
        archivePath,
        material,
        status.trustFloor,
      );
      if (candidate.bundleDigest === status.accepted.release.bundleDigest)
        return this.#exactReinstall(
          archivePath,
          material,
          authorization,
          status,
          verification,
        );
    }
    check(
      status.transactions.every(
        (t) => t.state === 'ABORTED' || (upgrade && t.state === 'COMMITTED'),
      ),
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
    // Retained immutable bytes from a failed attempt are evidence, not a
    // reusable staging area. Exact retry/reinstall remains outside this component.
    if (listPrivate(this.#fd).includes('releases'))
      check(
        !listPrivate(this.#fd, 'releases').includes(
          inspected.bundleDigest.slice(7),
        ),
        'CONFLICT',
      );
    const transactionId = randomUUID(),
      rows = [];
    this.#append(rows, {
      schemaVersion: 'alica.cell-journal/v1',
      cellId: status.cellId,
      transactionId,
      sequence: 1,
      priorRevision: status.accepted?.sequence ?? 0,
      targetRevision: (status.accepted?.sequence ?? 0) + 1,
      operation: upgrade ? 'upgrade' : 'install',
      state: 'STAGING',
      prior: status.accepted?.release ?? null,
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
      for (const entry of archive.entries) {
        verification.assert();
        durableWrite(
          this.#fd,
          prefix + '/' + entry.path,
          archive.read(entry.path),
          {
            maximum: limits.fileBytes,
            boundary: () => {
              verification.assert();
              this.#watch?.assert();
            },
          },
        );
      }
      this.#write(prefix + '/authorization.json', authorization);
      await this.#admit(
        prefix,
        inspected,
        material,
        status.cellId,
        authorization,
      );
      const fresh = this.#advance(material, floor);
      verification.assert();
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
      if (e.runtime !== 'STOPPED') this.#failed = true;
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
    this.#host = h;
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
      if (!retain) {
        await this.#shutdown();
        this.#stopped = false;
      }
    }
  }
  async #ready(h, ids, inspected, authorization, budget) {
    budget.assert();
    await budget.wait(() => h.startProfile(canonical(inspected.profile)));
    // Exact same fixed readiness as original installation, never a supplied callback.
    for (const capabilityId of ['org.alica.echo', 'org.alica.consumer']) {
      const intent = authorization.capabilities.find(
        (c) => c.capabilityId === capabilityId && c.operations.includes('echo'),
      );
      check(intent, 'PERMISSION_DENIED');
      const bound = await budget.wait(() =>
        h.context(ids.get(intent.principal)).require({
          capabilityId,
          major: 1,
          minMinor: 0,
          operations: ['echo'],
          features: [],
        }),
      );
      const text = 'g7-readiness-' + randomUUID();
      const result = await budget.wait(() =>
        bound.call('echo', { text }, { deadlineMs: Date.now() + 1000 }),
      );
      check(same(result, { text }), 'CONTRACT_MISMATCH');
    }
    check(
      h.inspect().instances.every((i) => i.state === 'ACTIVE'),
      'FAILED_PRECONDITION',
    );
  }
  async #activate(prefix, inspected, material, cellId, authorization, rows) {
    await (this.#channel ?? this.#watch)?.send({ phase: 'activation' });
    const budget = deadline(limits.activationTimeoutMs);
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
      await this.#ready(h, ids, inspected, authorization, budget);
      floor = this.#advance(material, floor);
      budget.assert();
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
      this.#write('accepted.json', accepted, true, budget);
      budget.assert();
      this.#transition(rows, 'COMMITTED', floor, 'OK');
      budget.assert();
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
      if (error.code === 'TIMEOUT') clean = false;
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
      if (publishing || !clean || this.#failed) {
        this.#failed = true;
        this.#stopped = false;
        throw outcome(error, 'NEEDS_OPERATOR');
      }
      const stoppedError = outcome(error, 'STOPPED');
      if (this.#session && rows[0].record.priorRevision > 0)
        this.#cleanAbort = stoppedError;
      throw stoppedError;
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
      if (h) {
        this.#host = h;
        await this.#shutdown();
        this.#stopped = false;
      }
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
