import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { canonical, digest } from '@alica/acap-contracts';
import {
  CellPreparation,
  cellSchema,
  validateJournal,
} from '../../tools/g7-cell.mjs';
import { cellFixture } from './cell-fixture.mjs';
import { signature } from '../../tools/g3-fixtures.mjs';
async function setup(t, options) {
  const dir = mkdtempSync(join(tmpdir(), 'g7-activation-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const f = await cellFixture(dir, options),
    root = join(dir, 'cell');
  mkdirSync(root, { mode: 0o700 });
  const c = new CellPreparation(root);
  await c.initialize(f.trust, f.floor);
  c.close();
  const input = join(dir, 'input.json');
  writeFileSync(
    input,
    canonical({
      archive: f.archive,
      trust: f.trust,
      authorization: f.authorization,
    }),
    { mode: 0o600 },
  );
  return { ...f, rootKey: f.root, root, dir, input };
}
function rows(f) {
  const tx = readdirSync(join(f.root, 'transactions'))[0];
  return readdirSync(join(f.root, 'transactions', tx))
    .sort()
    .map((n) => JSON.parse(readFileSync(join(f.root, 'transactions', tx, n))));
}
function external(f, mode) {
  return spawnSync(
    process.execPath,
    [
      '--experimental-vm-modules',
      'tests/g7/cell-process.mjs',
      mode,
      f.root,
      f.input,
    ],
    { encoding: 'utf8', timeout: 45000 },
  );
}
test('in-process IPC install: actual echo and unchanged consumer readiness, exact frozen selection, lifetime ownership and real shutdown', async (t) => {
  const f = await setup(t),
    c = new CellPreparation(f.root);
  try {
    const result = await c.install(f.archive, f.trust, f.authorization);
    assert.equal(result.runtime, 'RUNNING');
    assert.equal(result.transactions[0].state, 'COMMITTED');
    const accepted = cellSchema(
      'accepted',
      JSON.parse(readFileSync(join(f.root, 'accepted.json'))),
    );
    assert.deepEqual(JSON.parse(canonical(result.accepted)), accepted);
    assert.equal(accepted.release.bundleDigest, digest(f.bundle));
    assert.equal(accepted.release.authorizationDigest, digest(f.authorization));
    assert.equal(accepted.sequence, 1);
    assert.deepEqual(
      rows(f).map((r) => r.record.state),
      ['STAGING', 'VERIFIED', 'ACTIVATING', 'COMMITTED'],
    );
    assert.equal(validateJournal(rows(f)).state, 'COMMITTED');
    assert.throws(() => c.close(), { code: 'CONFLICT' });
    assert.notEqual(external(f, 'status').status, 0);
    const report = await c.shutdown();
    assert.equal(report.unsettledWork, 0);
    assert(report.instances.every((i) => i.state === 'DISPOSED'));
    assert.equal(c.status().runtime, 'STOPPED');
  } finally {
    await c.shutdown();
    c.close();
  }
  const result = external(f, 'recover');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).runtime, 'NEEDS_OPERATOR');
  assert.equal(JSON.parse(result.stdout).transactions[0].state, 'COMMITTED');
});

for (const boundary of [
  'activating-durable',
  'accepted-rename',
  'committed-durable',
]) {
  test(
    'external SIGKILL at ' +
      boundary +
      ' preserves selection and requires operator without inventing reap',
    async (t) => {
      const f = await setup(t);
      const child = spawn(
        process.execPath,
        [
          '--experimental-vm-modules',
          'tests/g7/cell-process.mjs',
          'install',
          f.root,
          f.input,
          boundary,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stderr = '';
      child.stderr.on('data', (b) => {
        stderr += b;
      });
      t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit');
          child.kill('SIGKILL');
          await exited;
        }
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('No real syscall boundary: ' + stderr)),
          30000,
        );
        let out = '';
        child.stdout.on('data', (b) => {
          out += b;
          if (out.includes('BOUNDARY')) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.once('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.once('exit', () => {
          clearTimeout(timer);
          reject(new Error('Exited before boundary: ' + stderr));
        });
      });
      assert.notEqual(
        external(f, 'status').status,
        0,
        'live owner must exclude another process',
      );
      const path = join(f.root, 'accepted.json');
      const before = existsSync(path) ? readFileSync(path) : null;
      assert.equal(before !== null, boundary !== 'activating-durable');
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      assert.deepEqual(await exited, [null, 'SIGKILL']);
      const recovered = external(f, 'recover');
      assert.equal(recovered.status, 0, recovered.stderr);
      const state = JSON.parse(recovered.stdout);
      assert.equal(state.runtime, 'NEEDS_OPERATOR');
      assert.equal(
        state.transactions[0].state,
        boundary === 'committed-durable' ? 'COMMITTED' : 'NEEDS_OPERATOR',
      );
      assert.deepEqual(
        existsSync(path) ? readFileSync(path) : null,
        before,
        'recovery cannot roll selection backward or invent it',
      );
      assert.notEqual(state.runtime, 'RUNNING');
      validateJournal(rows(f));
    },
  );
}
for (const kind of [
  'wrong-sequence',
  'wrong-release',
  'unknown-field',
  'missing-selection',
  'corrupt-journal',
]) {
  test('fresh recovery rejects committed corruption: ' + kind, async (t) => {
    const f = await setup(t),
      c = new CellPreparation(f.root);
    try {
      await c.install(f.archive, f.trust, f.authorization);
    } finally {
      await c.shutdown();
      c.close();
    }
    const path = join(f.root, 'accepted.json');
    if (kind === 'missing-selection') rmSync(path);
    else if (kind === 'corrupt-journal') {
      const tx = readdirSync(join(f.root, 'transactions'))[0];
      writeFileSync(join(f.root, 'transactions', tx, '000004.json'), '{}');
    } else {
      const a = JSON.parse(readFileSync(path));
      if (kind === 'wrong-sequence') a.sequence = 2;
      if (kind === 'wrong-release')
        a.release.bundleDigest = 'sha256:' + '0'.repeat(64);
      if (kind === 'unknown-field') a.trusted = true;
      writeFileSync(path, canonical(a));
    }
    const before = existsSync(path) ? readFileSync(path) : null;
    const result = external(f, 'recover');
    assert.notEqual(result.status, 0, result.stdout);
    assert.deepEqual(existsSync(path) ? readFileSync(path) : null, before);
  });
}
test('real provider activation failure never publishes accepted selection and records clean rollback', async (t) => {
  const f = await setup(t, {
    providerCode:
      'export async function activate() { throw new Error("deliberate test failure"); }',
  });
  const c = new CellPreparation(f.root);
  try {
    await assert.rejects(c.install(f.archive, f.trust, f.authorization));
    assert.equal(existsSync(join(f.root, 'accepted.json')), false);
    assert.equal(validateJournal(rows(f)).state, 'ABORTED');
    assert.equal(rows(f).at(-1).record.outcome, 'ACTIVATION_FAILED');
  } finally {
    await c.shutdown();
    c.close();
  }
});

test('post-activation recovery still enforces Kernel same-version policy digest continuity', async (t) => {
  const f = await setup(t),
    c = new CellPreparation(f.root);
  try {
    await c.install(f.archive, f.trust, f.authorization);
  } finally {
    await c.shutdown();
    c.close();
  }
  const before = readFileSync(join(f.root, 'accepted.json'));
  f.trust.policy.expiresAtMs += 1;
  f.trust.policySignature = signature(
    f.trust.policy,
    'ALICA-TRUST-POLICY-v1',
    f.rootKey,
  );
  writeFileSync(
    f.input,
    canonical({
      archive: f.archive,
      trust: f.trust,
      authorization: f.authorization,
    }),
  );
  assert.notEqual(external(f, 'recover').status, 0);
  assert.deepEqual(readFileSync(join(f.root, 'accepted.json')), before);
});

test('expired grants cannot continue to report a ready RUNNING Cell', async (t) => {
  const f = await setup(t, { grantLifetimeMs: 5000 }),
    c = new CellPreparation(f.root);
  try {
    assert.equal(
      (await c.install(f.archive, f.trust, f.authorization)).runtime,
      'RUNNING',
    );
    await new Promise((resolve) => setTimeout(resolve, 5200));
    assert.equal(c.status().runtime, 'FAILED');
  } finally {
    await c.shutdown();
    c.close();
  }
});
