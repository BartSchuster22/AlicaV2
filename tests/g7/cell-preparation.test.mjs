import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  chmodSync,
  symlinkSync,
  linkSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { canonical, digest } from '@alica/acap-contracts';
import { CellPreparation, validateJournal } from '../../tools/g7-cell.mjs';
import { cellFixture } from './cell-fixture.mjs';
const runner = 'tests/g7/cell-process.mjs';
async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'g7-cell-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const f = await cellFixture(dir),
    root = join(dir, 'cell');
  mkdirSync(root, { mode: 0o700 });
  const cell = new CellPreparation(root);
  await cell.initialize(f.trust, f.floor);
  cell.close();
  const input = join(dir, 'input.json');
  writeFileSync(
    input,
    JSON.stringify({
      archive: f.archive,
      trust: f.trust,
      authorization: f.authorization,
    }),
    { mode: 0o600 },
  );
  return { ...f, dir, root, input };
}
function external(f, operation) {
  return spawnSync(
    process.execPath,
    ['--experimental-vm-modules', runner, operation, f.root, f.input],
    {
      encoding: 'utf8',
      timeout: 30000,
    },
  );
}
async function stoppedAt(t, f, operation, boundary) {
  const child = spawn(
    process.execPath,
    ['--experimental-vm-modules', runner, operation, f.root, f.input, boundary],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  t.after(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  });
  let error = '';
  child.stderr.on('data', (b) => {
    error += b;
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('boundary timeout: ' + error)),
      15000,
    );
    child.stdout.on('data', (b) => {
      if (b.toString().includes('BOUNDARY')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', () => {
      clearTimeout(timer);
      reject(new Error('premature exit: ' + error));
    });
  });
  return child;
}
test('real staged transaction, separate-process status/recovery, persistent identity/floor and no accepted selection', async (t) => {
  const f = await setup(t),
    before = readFileSync(join(f.root, 'identity.json'));
  const staged = external(f, 'stage');
  assert.equal(staged.status, 0, staged.stderr);
  assert.equal(JSON.parse(staged.stdout).state, 'VERIFIED');
  const status = external(f, 'status');
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).accepted, null);
  const recovered = external(f, 'recover');
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(JSON.parse(recovered.stdout).transactions[0].state, 'ABORTED');
  assert.deepEqual(readFileSync(join(f.root, 'identity.json')), before);
  assert(!existsSync(join(f.root, 'accepted.json')));
  const tx = readdirSync(join(f.root, 'transactions'))[0];
  const rows = readdirSync(join(f.root, 'transactions', tx))
    .sort()
    .map((n) => JSON.parse(readFileSync(join(f.root, 'transactions', tx, n))));
  assert.equal(validateJournal(rows).state, 'ABORTED');
  assert.deepEqual(
    rows.map((r) => r.record.state),
    ['STAGING', 'VERIFIED', 'RECOVERING', 'ABORTED'],
  );
});
test('OS flock contention is immediate across processes and releases on SIGKILL without PID guessing', async (t) => {
  const f = await setup(t),
    child = await stoppedAt(t, f, 'hold', '');
  const identity = readFileSync(join(f.root, 'identity.json'));
  assert.throws(() => new CellPreparation(f.root), { code: 'CONFLICT' });
  assert.deepEqual(readFileSync(join(f.root, 'identity.json')), identity);
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
  const next = new CellPreparation(f.root);
  next.status();
  next.close();
});
for (const boundary of [
  'staging-durable',
  'verified-durable',
  'journal-link',
  'floor-rename',
])
  test(
    'external SIGKILL at ' + boundary + ' with fresh-process readback',
    async (t) => {
      const f = await setup(t),
        identity = readFileSync(join(f.root, 'identity.json'));
      const child = await stoppedAt(t, f, 'stage', boundary);
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      const [, signal] = await exited;
      assert.equal(signal, 'SIGKILL');
      const recovered = external(f, 'recover');
      if (boundary === 'journal-link')
        assert.notEqual(
          recovered.status,
          0,
          'hardlinked/incomplete journal must deny recovery',
        );
      else {
        assert.equal(recovered.status, 0, recovered.stderr);
        assert(
          JSON.parse(recovered.stdout).transactions.every(
            (x) => x.state === 'ABORTED',
          ),
        );
      }
      assert.deepEqual(readFileSync(join(f.root, 'identity.json')), identity);
      assert(!existsSync(join(f.root, 'accepted.json')));
    },
  );
for (const attack of [
  'symlink-root',
  'root-mode',
  'identity-hardlink',
  'floor-symlink',
  'floor-mode',
  'unknown-root',
  'missing-kernel',
  'accepted-selection',
])
  test('private-root attack rejects ' + attack, async (t) => {
    const f = await setup(t);
    let root = f.root;
    if (attack === 'symlink-root') {
      root = join(f.dir, 'alias');
      symlinkSync(f.root, root);
    }
    if (attack === 'root-mode') chmodSync(root, 0o755);
    if (attack === 'identity-hardlink')
      linkSync(join(root, 'identity.json'), join(f.dir, 'identity-copy'));
    if (attack === 'floor-symlink') {
      rmSync(join(root, 'floor.json'));
      symlinkSync(f.input, join(root, 'floor.json'));
    }
    if (attack === 'floor-mode') chmodSync(join(root, 'floor.json'), 0o644);
    if (attack === 'unknown-root')
      writeFileSync(join(root, 'admin.sock'), 'not a socket');
    if (attack === 'missing-kernel') rmSync(join(root, 'kernel.json'));
    if (attack === 'accepted-selection')
      writeFileSync(join(root, 'accepted.json'), '{}', { mode: 0o600 });
    assert.throws(() => {
      const c = new CellPreparation(root);
      try {
        c.status();
      } finally {
        c.close();
      }
    });
  });
for (const attack of [
  'wrong-root',
  'clock-floor',
  'metadata-floor',
  'intent-profile',
  'intent-operation',
  'intent-duplicate',
  'intent-secret',
  'source-corruption',
])
  test(
    'stage rejects ' + attack + ' without accepted publication',
    async (t) => {
      const f = await setup(t);
      if (attack === 'wrong-root')
        f.trust.rootKeyId = 'sha256:' + '0'.repeat(64);
      if (attack === 'clock-floor' || attack === 'metadata-floor') {
        const floor = JSON.parse(readFileSync(join(f.root, 'floor.json')));
        if (attack === 'clock-floor') floor.lastWallMs += 3600000;
        else floor.policyVersion++;
        writeFileSync(join(f.root, 'floor.json'), canonical(floor));
      }
      if (attack === 'intent-profile')
        f.authorization.profileDigest = 'sha256:' + '0'.repeat(64);
      if (attack === 'intent-operation')
        f.authorization.capabilities[0].operations = ['destroy'];
      if (attack === 'intent-duplicate')
        f.authorization.capabilities.push({
          ...f.authorization.capabilities[0],
          lifetimeMs: 1,
        });
      if (attack === 'intent-secret') f.authorization.secrets.push('forbidden');
      if (attack === 'source-corruption') {
        const b = readFileSync(f.archive);
        b[4096] ^= 1;
        writeFileSync(f.archive, b);
      }
      const c = new CellPreparation(f.root);
      try {
        await assert.rejects(c.stage(f.archive, f.trust, f.authorization));
      } finally {
        c.close();
      }
      assert(!existsSync(join(f.root, 'accepted.json')));
    },
  );
test('journal corruption, unknown shape, checksum-valid illegal edge and rollback deny', async (t) => {
  const f = await setup(t);
  assert.equal(external(f, 'stage').status, 0);
  const tx = readdirSync(join(f.root, 'transactions'))[0],
    path = join(f.root, 'transactions', tx, '000002.json');
  const original = JSON.parse(readFileSync(path));
  for (const mutate of [
    (r) => {
      r.extra = true;
    },
    (r) => {
      r.checksum = 'sha256:' + '0'.repeat(64);
    },
    (r) => {
      r.record.state = 'COMMITTED';
      r.record.outcome = 'OK';
      r.checksum = digest(r.record);
    },
    (r) => {
      r.record.trustFloor.policyVersion = 0;
      r.checksum = digest(r.record);
    },
    (r) => {
      r.record.transactionId = 'other';
      r.checksum = digest(r.record);
    },
  ]) {
    const r = structuredClone(original);
    mutate(r);
    writeFileSync(path, canonical(r));
    assert.notEqual(external(f, 'recover').status, 0);
  }
});
test('install, upgrade, start, stop, verify and backup are explicitly unavailable; no root mutation', async (t) => {
  const f = await setup(t),
    before = readdirSync(f.root);
  for (const operation of [
    'install',
    'upgrade',
    'start',
    'stop',
    'verify',
    'backup',
  ]) {
    const p = spawnSync(
      process.execPath,
      ['--experimental-vm-modules', 'tools/g7-cell-cli.mjs', operation, f.root],
      { encoding: 'utf8' },
    );
    assert.equal(p.status, 1);
    assert.equal(JSON.parse(p.stderr).code, 'UNAVAILABLE');
  }
  assert.deepEqual(readdirSync(f.root), before);
});
