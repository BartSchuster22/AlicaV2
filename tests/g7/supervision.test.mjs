import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
  rmSync,
  readdirSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { canonical, rawDigest } from '@alica/acap-contracts';
import { signature, echo } from '../../tools/g3-fixtures.mjs';
import { CellPreparation, cellSchema } from '../../tools/g7-cell.mjs';
import { cellFixture } from './cell-fixture.mjs';

async function waitFor(check, ms = 15000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    const value = await check();
    if (value) return value;
    await delay(30);
  }
  throw new Error('Fixture condition timed out');
}
function request(f, operation = 'status', extra = {}, raw) {
  return new Promise((resolvePromise, reject) => {
    const c = connect(join(f.root, 'supervision/admin.sock'));
    let data = Buffer.alloc(0);
    c.setTimeout(35000, () => c.destroy(new Error('admin timeout')));
    c.on('error', (e) =>
      e.code === 'ECONNRESET' ? resolvePromise(null) : reject(e),
    );
    c.on('connect', () => {
      const payload =
        raw ??
        Buffer.from(
          JSON.stringify({
            schemaVersion: 'alica.cell-admin-request/v1',
            requestId: 'test',
            incarnation: f.incarnation,
            expectedSequence: 1,
            operation,
            ...extra,
          }),
        );
      const header = Buffer.alloc(4);
      header.writeUInt32BE(payload.length);
      c.end(Buffer.concat([header, payload]));
    });
    c.on('data', (b) => {
      data = Buffer.concat([data, b]);
    });
    c.on('end', () => {
      if (!data.length) return resolvePromise(null);
      assert.equal(data.readUInt32BE(), data.length - 4);
      resolvePromise(cellSchema('adminResponse', JSON.parse(data.subarray(4))));
    });
  });
}
async function setup(t, block = false, fixtureOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'g7-supervisor-'));
  const f = await cellFixture(dir, fixtureOptions),
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
  const env = { ...process.env };
  if (block) {
    const fifo = join(dir, 'block.fifo');
    assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
    env.G7_TEST_FIFO = fifo;
    if (block === 'activation') env.G7_TEST_PHASE = 'activation';
    env.NODE_OPTIONS = '--import=' + resolve('tests/g7/supervision-block.mjs');
    if (
      [
        'successor',
        'stop-exit',
        'successor-cleanup',
        'publication',
        'floor-publication',
      ].includes(block)
    ) {
      env.G7_TEST_START_BLOCK = block;
      env.NODE_OPTIONS =
        '--import=' + resolve('tests/g7/clean-start-block.mjs');
    }
  }
  const supervisor = spawn(
    'python3',
    ['tools/g7-supervisor.py', process.execPath, root, input],
    {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env,
    },
  );
  let stderr = '';
  supervisor.stderr.on('data', (b) => {
    stderr += b;
  });
  t.after(async () => {
    if (supervisor.exitCode === null && supervisor.signalCode === null) {
      const exited = once(supervisor, 'exit');
      // Only this disposable fixture's independently created session/process group.
      process.kill(-supervisor.pid, 'SIGKILL');
      await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const record = join(root, 'supervision/incarnation.json');
  await waitFor(
    () =>
      existsSync(record) && existsSync(join(root, 'supervision/admin.sock')),
  );
  const result = {
    ...f,
    rootKey: f.root,
    dir,
    root,
    input,
    supervisor,
    incarnation: JSON.parse(readFileSync(record)).incarnation,
  };
  if (!['activation', 'publication'].includes(block)) {
    await waitFor(async () => {
      assert.equal(supervisor.exitCode, null, stderr);
      return (await request(result))?.status === 'RUNNING';
    });
  }
  return result;
}
function treeHashes(root) {
  return Object.fromEntries(
    readdirSync(root, { recursive: true })
      .filter((p) => statSync(join(root, p)).isFile())
      .sort()
      .map((p) => [p, rawDigest(readFileSync(join(root, p)))]),
  );
}
function children(f) {
  return readFileSync(
    `/proc/${f.supervisor.pid}/task/${f.supervisor.pid}/children`,
    'utf8',
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

test(
  'clean stop then authenticated same-revision start uses preserved bytes and new exact owner',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t);
    const accepted = readFileSync(join(f.root, 'accepted.json'));
    const identity = readFileSync(join(f.root, 'identity.json'));
    const releases = treeHashes(join(f.root, 'releases'));
    const journals = treeHashes(join(f.root, 'transactions'));
    const first = children(f);
    assert.equal(first.length, 1);
    const before = await request(f);
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
    assert.deepEqual(children(f), []); // waitpid completed, not merely a stopped message.
    excluded(f);
    assert.equal(
      (await request(f, 'start', { incarnation: 'wrong' })).code,
      'DENIED',
    );
    assert.equal(
      (await request(f, 'start', { expectedSequence: 0 })).code,
      'CONFLICT',
    );
    assert.deepEqual(children(f), []);
    // No original archive dependency, no reconstructed or replacement candidate.
    rmSync(f.archive);
    const started = await request(f, 'start');
    assert.equal(started?.code, 'OK');
    assert.equal(started.status, 'RUNNING');
    assert.equal(started.sequence, before.sequence);
    assert.equal(started.acceptedDigest, before.acceptedDigest);
    assert.equal(started.incarnation, before.incarnation);
    assert.equal(children(f).length, 1);
    assert.notDeepEqual(children(f), first);
    assert.deepEqual(readFileSync(join(f.root, 'accepted.json')), accepted);
    assert.deepEqual(readFileSync(join(f.root, 'identity.json')), identity);
    assert.equal((await request(f, 'start')).code, 'DENIED');
    excluded(f);
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
    assert.deepEqual(children(f), []);
    assert.equal((await request(f, 'start')).status, 'RUNNING');
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
    assert.deepEqual(readFileSync(join(f.root, 'accepted.json')), accepted);
    assert.deepEqual(treeHashes(join(f.root, 'releases')), releases);
    assert.deepEqual(treeHashes(join(f.root, 'transactions')), journals);
  },
);

test(
  'same-revision start: expired grants stay FAILED until clean stop and fresh issuance',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, false, { grantLifetimeMs: 7000 });
    await delay(7500);
    assert.equal((await request(f)).status, 'FAILED');
    assert.equal((await request(f, 'start')).code, 'DENIED');
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
    assert.equal((await request(f, 'start')).status, 'RUNNING');
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
  },
);

test(
  'same-revision start rechecks newer current revocation while preserving accepted bytes and floor monotonicity',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t);
    const accepted = readFileSync(join(f.root, 'accepted.json'));
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
    const input = JSON.parse(readFileSync(f.input));
    input.trust.revocation.version += 1;
    input.trust.revocationSignature = signature(
      input.trust.revocation,
      'ALICA-REVOCATION-v1',
      f.rootKey,
    );
    writeFileSync(f.input, canonical(input));
    assert.equal((await request(f, 'start')).status, 'RUNNING');
    assert.equal(
      JSON.parse(readFileSync(join(f.root, 'floor.json'))).revocationVersion,
      2,
    );
    assert.deepEqual(readFileSync(join(f.root, 'accepted.json')), accepted);
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
    // Restoring earlier operator metadata cannot lower either persisted high-water.
    input.trust = f.trust;
    writeFileSync(f.input, canonical(input));
    assert.equal(await request(f, 'start'), null);
    await waitFor(() => children(f).length === 0);
    assert.equal(
      JSON.parse(readFileSync(join(f.root, 'floor.json'))).revocationVersion,
      2,
    );
    assert.deepEqual(readFileSync(join(f.root, 'accepted.json')), accepted);
    excluded(f);
  },
);

for (const kind of [
  'authorization',
  'trust-signature',
  'revoked-bundle',
  'expired-trust',
  'policy-continuity',
  'accepted-sequence',
  'missing-selection',
  'journal',
  'artifact',
  'extra-file',
  'symlink',
  'future-floor',
  'kernel-residue',
]) {
  test(
    'same-revision start refuses fresh validation failure: ' + kind,
    { timeout: 30000 },
    async (t) => {
      const f = await setup(t);
      assert.equal((await request(f, 'stop')).status, 'STOPPED');
      const selected = join(f.root, 'accepted.json');
      const original = readFileSync(selected);
      const accepted = JSON.parse(original);
      const release = join(
        f.root,
        'releases',
        accepted.release.bundleDigest.slice(7),
      );
      const input = JSON.parse(readFileSync(f.input));
      if (kind === 'authorization')
        input.authorization.capabilities[0].lifetimeMs -= 1;
      if (kind === 'trust-signature') input.trust.policy.expiresAtMs += 1;
      if (kind === 'revoked-bundle' || kind === 'expired-trust') {
        input.trust.revocation.version += 1;
        if (kind === 'revoked-bundle')
          input.trust.revocation.revokedArtifactDigests.push(
            accepted.release.bundleDigest,
          );
        else input.trust.revocation.expiresAtMs = Date.now() - 1;
        // Existing disposable fixture signer ONLY, never custody or production keys.
        input.trust.revocationSignature = signature(
          input.trust.revocation,
          'ALICA-REVOCATION-v1',
          f.rootKey,
        );
      }
      if (kind === 'policy-continuity') {
        input.trust.policy.expiresAtMs += 1;
        input.trust.policySignature = signature(
          input.trust.policy,
          'ALICA-TRUST-POLICY-v1',
          f.rootKey,
        );
      }
      if (kind === 'accepted-sequence') {
        accepted.sequence += 1;
        writeFileSync(selected, canonical(accepted));
      }
      if (kind === 'missing-selection') rmSync(selected);
      if (kind === 'journal') {
        const tx = readdirSync(join(f.root, 'transactions'))[0];
        writeFileSync(join(f.root, 'transactions', tx, '000004.json'), '{}');
      }
      if (kind === 'artifact')
        writeFileSync(join(release, 'profile/profile.json'), '{}');
      if (kind === 'extra-file')
        writeFileSync(join(release, 'docs/extra.txt'), 'not accepted', {
          mode: 0o600,
        });
      if (kind === 'symlink') {
        rmSync(join(release, 'profile/profile.json'));
        symlinkSync(f.input, join(release, 'profile/profile.json'));
      }
      if (kind === 'future-floor') {
        const path = join(f.root, 'floor.json'),
          floor = JSON.parse(readFileSync(path));
        floor.lastWallMs = Date.now() + 60000;
        writeFileSync(path, canonical(floor));
      }
      if (kind === 'kernel-residue')
        writeFileSync(join(f.root, 'kernel.json.next'), '{}', { mode: 0o600 });
      writeFileSync(f.input, canonical(input));
      const before = existsSync(selected) ? readFileSync(selected) : null;
      // Fail closed rather than manufacture a known-selection response on failure.
      assert.equal(await request(f, 'start'), null);
      await waitFor(() => children(f).length === 0);
      assert.equal(await request(f, 'start'), null);
      assert.deepEqual(children(f), []);
      excluded(f);
      assert.deepEqual(
        existsSync(selected) ? readFileSync(selected) : null,
        before,
      );
    },
  );
}

test(
  'same-revision start waits for actual prior owner reap, not its clean stopped message',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, 'stop-exit');
    const old = children(f);
    const stopping = request(f, 'stop');
    await waitFor(() => existsSync(join(f.dir, 'block.fifo.entered')));
    assert.deepEqual(children(f), old);
    assert.equal((await request(f, 'start')).code, 'CONFLICT');
    excluded(f);
    // Force-killing even AFTER the real clean Kernel report does not grant restart.
    killOwner(f);
    assert.equal((await stopping)?.status, 'NEEDS_OPERATOR');
    assert.equal((await request(f, 'start')).code, 'DENIED');
    assert.deepEqual(children(f), []);
  },
);

test(
  'same-revision successor launch is not readiness; concurrent start conflicts and disconnect is not cancellation',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, 'successor');
    const accepted = readFileSync(join(f.root, 'accepted.json'));
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
    const starting = request(f, 'start');
    await waitFor(() => existsSync(join(f.dir, 'block.fifo.entered')));
    assert.equal(children(f).length, 1);
    assert.equal((await request(f)).code, 'CONFLICT');
    const conflict = await request(f, 'start');
    assert.equal(conflict.code, 'CONFLICT');
    assert.notEqual(conflict.status, 'RUNNING');
    excluded(f);
    // Release the real blocking syscall, not a simulated Kernel readiness receipt.
    const unblock = spawnSync(
      'python3',
      [
        '-c',
        `import os;fd=os.open(${JSON.stringify(join(f.dir, 'block.fifo'))},os.O_WRONLY);os.close(fd)`,
      ],
      { timeout: 5000 },
    );
    assert.equal(unblock.status, 0);
    assert.equal((await starting).status, 'RUNNING');
    assert.deepEqual(readFileSync(join(f.root, 'accepted.json')), accepted);
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
    rmSync(join(f.dir, 'block.fifo.entered'));
    const disconnected = connect(join(f.root, 'supervision/admin.sock'));
    disconnected.on('error', () => {});
    await once(disconnected, 'connect');
    const payload = Buffer.from(
      JSON.stringify({
        schemaVersion: 'alica.cell-admin-request/v1',
        requestId: 'disconnected',
        incarnation: f.incarnation,
        expectedSequence: 1,
        operation: 'start',
      }),
    );
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length);
    disconnected.end(Buffer.concat([header, payload]));
    await waitFor(() => existsSync(join(f.dir, 'block.fifo.entered')));
    disconnected.destroy();
    assert.equal((await request(f, 'start')).code, 'CONFLICT');
    const release = spawnSync(
      'python3',
      [
        '-c',
        `import os;fd=os.open(${JSON.stringify(join(f.dir, 'block.fifo'))},os.O_WRONLY);os.close(fd)`,
      ],
      { timeout: 5000 },
    );
    assert.equal(release.status, 0);
    await waitFor(async () => (await request(f))?.status === 'RUNNING');
    assert.equal(children(f).length, 1);
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
  },
);

test(
  'same-revision successor retains parent-death guard while blocked and residue denies takeover',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, 'successor');
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
    const starting = request(f, 'start');
    await waitFor(() => existsSync(join(f.dir, 'block.fifo.entered')));
    const owner = Number(readFileSync(join(f.dir, 'block.fifo.entered')));
    const result = spawnSync(
      'python3',
      [
        '-c',
        `import os,signal,select\nofd=os.pidfd_open(${owner});sfd=os.pidfd_open(${f.supervisor.pid})\nsignal.pidfd_send_signal(sfd,signal.SIGKILL)\nobserved=bool(select.select([ofd],[],[],5)[0])\nif not observed: signal.pidfd_send_signal(ofd,signal.SIGKILL)\nos.close(ofd);os.close(sfd)\nassert observed, 'successor survived supervisor death'`,
      ],
      { encoding: 'utf8', timeout: 12000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await starting, null);
    await waitFor(() => f.supervisor.signalCode !== null);
    assert.throws(() => new CellPreparation(f.root), {
      code: 'FAILED_PRECONDITION',
    });
  },
);

for (const boundary of ['publication', 'floor-publication']) {
  test(
    'actual ' +
      boundary +
      ' rename uncertainty forbids start and preserves selection without rollback',
    { timeout: 30000 },
    async (t) => {
      const f = await setup(t, boundary);
      let before;
      if (boundary === 'floor-publication') {
        assert.equal((await request(f, 'stop')).status, 'STOPPED');
        before = readFileSync(join(f.root, 'accepted.json'));
        assert.equal(await request(f, 'start'), null);
      }
      await waitFor(() => existsSync(join(f.dir, 'block.fifo.entered')));
      await waitFor(() => children(f).length === 0);
      const accepted = readFileSync(join(f.root, 'accepted.json'));
      if (before) assert.deepEqual(accepted, before);
      assert.equal(await request(f, 'start'), null);
      assert.equal(await request(f), null);
      assert.deepEqual(children(f), []);
      assert.deepEqual(readFileSync(join(f.root, 'accepted.json')), accepted);
      excluded(f);
    },
  );
}

for (const failure of ['activation', 'readiness']) {
  test(
    'same accepted provider fails actual successor ' +
      failure +
      ' without replacing artifacts',
    { timeout: 40000 },
    async (t) => {
      const end = Date.now() + 10000;
      const providerCode = `export async function activate(ctx) {
      ${failure === 'activation' ? `if (Date.now() >= ${end}) throw new Error('aged fixture activation');` : ''}
      ctx.provide(${JSON.stringify(echo)}, { echo: async x => {
        ${failure === 'readiness' ? `if (Date.now() >= ${end}) return { text: 'not-the-readiness-request' };` : ''}
        return x;
      }});
    }`;
      const f = await setup(t, false, { providerCode });
      const accepted = readFileSync(join(f.root, 'accepted.json'));
      const release = treeHashes(join(f.root, 'releases'));
      assert.equal((await request(f, 'stop')).status, 'STOPPED');
      await delay(Math.max(0, end - Date.now() + 50));
      assert.equal(await request(f, 'start'), null);
      await waitFor(() => children(f).length === 0);
      assert.deepEqual(readFileSync(join(f.root, 'accepted.json')), accepted);
      assert.deepEqual(treeHashes(join(f.root, 'releases')), release);
      assert.equal(await request(f, 'start'), null);
      excluded(f);
    },
  );
}

for (const phase of ['successor', 'successor-cleanup']) {
  test(
    'same-revision ' +
      phase +
      ' external 30s expiry is sticky and cannot authorize another owner',
    { timeout: 50000 },
    async (t) => {
      const f = await setup(t, phase);
      assert.equal((await request(f, 'stop')).status, 'STOPPED');
      let pending;
      if (phase === 'successor') pending = request(f, 'start');
      else {
        assert.equal((await request(f, 'start')).status, 'RUNNING');
        pending = request(f, 'stop');
      }
      const start = performance.now();
      await waitFor(() => existsSync(join(f.dir, 'block.fifo.entered')));
      assert.equal((await request(f, 'start')).code, 'CONFLICT');
      excluded(f);
      await pending;
      await waitFor(() => children(f).length === 0, 35000);
      assert(performance.now() - start >= 29000);
      const result = await request(f, 'start');
      if (phase === 'successor') assert.equal(result, null);
      else assert.equal(result.code, 'DENIED');
      assert.deepEqual(children(f), []);
      excluded(f);
    },
  );
}

test(
  'clean stopped residue is not a restart permit after supervisor death',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t);
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
    assert.deepEqual(children(f), []);
    const accepted = readFileSync(join(f.root, 'accepted.json'));
    const exited = once(f.supervisor, 'exit');
    f.supervisor.kill('SIGKILL');
    await exited;
    assert.throws(() => new CellPreparation(f.root), {
      code: 'FAILED_PRECONDITION',
    });
    const retry = spawnSync(
      'python3',
      ['tools/g7-supervisor.py', process.execPath, f.root, f.input],
      { encoding: 'utf8', timeout: 5000 },
    );
    assert.notEqual(retry.status, 0);
    assert.deepEqual(readFileSync(join(f.root, 'accepted.json')), accepted);
  },
);

test(
  'restricted framing requires write EOF; delayed trailing bytes never execute stop',
  { timeout: 45000 },
  async (t) => {
    const f = await setup(t);
    const body = Buffer.from(
      JSON.stringify({
        schemaVersion: 'alica.cell-admin-request/v1',
        requestId: 'unsealed',
        incarnation: f.incarnation,
        expectedSequence: 1,
        operation: 'stop',
      }),
    );
    const header = Buffer.alloc(4);
    header.writeUInt32BE(body.length);
    const frame = Buffer.concat([header, body]);
    const c = connect(join(f.root, 'supervision/admin.sock'));
    c.on('error', () => {});
    await once(c, 'connect');
    c.write(frame);
    await delay(100);
    assert.equal((await request(f)).status, 'RUNNING');
    c.end(Buffer.from('x'));
    let data = '';
    c.on('data', (b) => {
      data += b;
    });
    await once(c, 'close');
    assert.equal(data, '');
    assert.equal((await request(f)).status, 'RUNNING');
    const unsealed = connect(join(f.root, 'supervision/admin.sock'));
    await once(unsealed, 'connect');
    const start = performance.now();
    unsealed.write(frame);
    let output = '';
    unsealed.on('data', (b) => {
      output += b;
    });
    await once(unsealed, 'end');
    unsealed.destroy();
    assert(performance.now() - start >= 29000);
    assert.equal(output, '');
    assert.equal(children(f).length, 1);
    // Grants naturally expired; absence of STOPPED is not falsely labeled RUNNING.
    assert.equal((await request(f)).status, 'FAILED');
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
  },
);

function excluded(f) {
  assert.throws(() => new CellPreparation(f.root), { code: 'CONFLICT' });
}
function killOwner(f) {
  // pidfd target acquisition while the actual supervisor still owns its child.
  const result = spawnSync(
    'python3',
    [
      '-c',
      `import os,signal
pids=open('/proc/${f.supervisor.pid}/task/${f.supervisor.pid}/children').read().split()
assert len(pids)==1
fd=os.pidfd_open(int(pids[0]))
signal.pidfd_send_signal(fd, signal.SIGKILL)
os.close(fd)
`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
}

test(
  'supervised real IPC install, exact local admin status/stop, retained custody',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t);
    excluded(f);
    assert.equal(
      statSync(join(f.root, 'supervision/admin.sock')).mode & 0o777,
      0o600,
    );
    assert.equal((await request(f)).status, 'RUNNING');
    assert.equal(
      (await request(f, 'status', { incarnation: 'wrong' })).code,
      'DENIED',
    );
    assert.equal(
      (await request(f, 'status', { expectedSequence: 0 })).code,
      'CONFLICT',
    );
    for (const operation of ['start', 'verify'])
      assert.equal((await request(f, operation)).code, 'DENIED');
    assert.equal(await request(f, 'upgrade'), null);
    assert.equal(await request(f, 'status', { uid: process.getuid() }), null);
    const stopped = await request(f, 'stop');
    assert.equal(stopped.code, 'OK');
    assert.equal(stopped.status, 'STOPPED');
    assert.equal((await request(f)).status, 'STOPPED');
    excluded(f);
  },
);

test(
  'external SIGKILL of actual owner never proves descendants reaped; fence survives supervisor death',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t);
    const accepted = readFileSync(join(f.root, 'accepted.json'));
    killOwner(f);
    await waitFor(async () => (await request(f))?.status === 'NEEDS_OPERATOR');
    assert.equal((await request(f, 'stop')).code, 'CLEANUP_UNCERTAIN');
    excluded(f);
    assert.deepEqual(readFileSync(join(f.root, 'accepted.json')), accepted);
    const exited = once(f.supervisor, 'exit');
    process.kill(-f.supervisor.pid, 'SIGKILL');
    await exited;
    assert.throws(() => new CellPreparation(f.root), {
      code: 'FAILED_PRECONDITION',
    });
    const retry = spawnSync(
      'python3',
      ['tools/g7-supervisor.py', process.execPath, f.root, f.input],
      { encoding: 'utf8' },
    );
    assert.notEqual(retry.status, 0);
    assert.deepEqual(readFileSync(join(f.root, 'accepted.json')), accepted);
  },
);

test(
  'real synchronous FIFO IO during outer cleanup: responsive admin, 30s external expiry, no restart',
  { timeout: 50000 },
  async (t) => {
    const f = await setup(t, true);
    const start = performance.now();
    const stopping = request(f, 'stop');
    await waitFor(() => existsSync(join(f.dir, 'block.fifo.entered')));
    const response = await request(f);
    assert.equal(response.code, 'CONFLICT');
    assert(performance.now() - start < 10000);
    excluded(f);
    // Connection ceiling can expire just before operation disposition: timeout is
    // not rollback. A fresh status reports sticky uncertainty after exact expiry.
    await stopping;
    await waitFor(
      async () => (await request(f))?.status === 'NEEDS_OPERATOR',
      35000,
    );
    assert(performance.now() - start >= 30000);
    excluded(f);
    assert.equal((await request(f, 'start')).code, 'DENIED');
  },
);

test(
  'activation blocked in real synchronous IO is externally killed without publication or new admission',
  { timeout: 45000 },
  async (t) => {
    const f = await setup(t, 'activation');
    const entered = join(f.dir, 'block.fifo.entered');
    await waitFor(() => existsSync(entered));
    const pid = Number(readFileSync(entered));
    const waiter = spawn('python3', [
      '-c',
      `import os,select,sys
fd=os.pidfd_open(${pid})
print('PIDFD_OPEN',flush=True)
assert select.select([fd],[],[],35)[0]
print('PIDFD_EXIT',flush=True)
os.close(fd)
`,
    ]);
    const done = once(waiter, 'exit');
    let output = '';
    waiter.stdout.on('data', (b) => {
      output += b;
    });
    await waitFor(() => output.includes('PIDFD_OPEN'));
    excluded(f);
    const start = performance.now();
    assert.equal(await request(f, 'status', { expectedSequence: 0 }), null);
    assert(performance.now() - start < 1000);
    assert.equal((await done)[0], 0);
    assert(output.includes('PIDFD_EXIT'));
    assert(!existsSync(join(f.root, 'accepted.json')));
    excluded(f);
    await delay(200);
    assert(!existsSync(join(f.root, 'accepted.json')));
  },
);

test(
  'actual Unix peer credentials, malformed/duplicate/oversized frames and eight-connection ceiling',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t);
    const peer = spawnSync(
      'python3',
      [
        '-c',
        `import socket,struct
s=socket.socket(socket.AF_UNIX);s.connect(${JSON.stringify(join(f.root, 'supervision/admin.sock'))})
pid,uid,gid=struct.unpack('3i',s.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
assert pid==${f.supervisor.pid} and uid==${process.getuid()}
print('SO_PEERCRED',pid,uid,gid)
`,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(peer.status, 0, peer.stderr);
    for (const raw of [
      Buffer.from('{"operation":"status","operation":"stop"}'),
      Buffer.alloc(65537, 32),
      Buffer.from('['.repeat(34) + '0' + ']'.repeat(34)),
      Buffer.from([255]),
      Buffer.alloc(0),
    ]) {
      assert.equal(await request(f, 'status', {}, raw), null);
    }
    const sockets = [];
    t.after(() => sockets.forEach((s) => s.destroy()));
    for (let i = 0; i < 8; i++) {
      const c = connect(join(f.root, 'supervision/admin.sock'));
      sockets.push(c);
      await once(c, 'connect');
    }
    await delay(100);
    const extra = connect(join(f.root, 'supervision/admin.sock'));
    sockets.push(extra);
    await once(extra, 'end');
    for (const c of sockets) c.destroy();
    await delay(100);
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
  },
);

test(
  'launcher exits before real first-install completes; owner remains alive for authenticated status and clean stop',
  { timeout: 30000 },
  async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'g7-launch-'));
    const fixture = await cellFixture(dir),
      root = join(dir, 'cell');
    mkdirSync(root, { mode: 0o700 });
    const cell = new CellPreparation(root);
    await cell.initialize(fixture.trust, fixture.floor);
    cell.close();
    const input = join(dir, 'input.json');
    writeFileSync(
      input,
      canonical({
        archive: fixture.archive,
        trust: fixture.trust,
        authorization: fixture.authorization,
      }),
      { mode: 0o600 },
    );
    const launch = spawnSync(
      'python3',
      ['tools/g7-supervisor.py', '--launch', process.execPath, root, input],
      { encoding: 'utf8' },
    );
    assert.equal(launch.status, 0, launch.stderr);
    const receipt = JSON.parse(launch.stdout);
    assert.equal(receipt.runtime, 'NOT_OBSERVED');
    // A real pidfd is held before querying readiness and used for scoped cleanup.
    const guardian = spawn(
      'python3',
      [
        '-c',
        `import os,signal,select,sys
fd=os.pidfd_open(${receipt.supervisorPid})
print('HELD',flush=True)
sys.stdin.read()
signal.pidfd_send_signal(fd,signal.SIGKILL)
assert select.select([fd],[],[],10)[0]
os.close(fd)
`,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const guardianDone = once(guardian, 'exit');
    await once(guardian.stdout, 'data');
    t.after(async () => {
      guardian.stdin.end();
      await guardianDone;
      rmSync(dir, { recursive: true, force: true });
    });
    const record = join(root, 'supervision/incarnation.json');
    await waitFor(
      () =>
        existsSync(record) && existsSync(join(root, 'supervision/admin.sock')),
    );
    const f = {
      root,
      incarnation: JSON.parse(readFileSync(record)).incarnation,
    };
    await waitFor(async () => (await request(f))?.status === 'RUNNING');
    assert.equal((await request(f, 'stop')).status, 'STOPPED');
  },
);

test(
  'supervisor SIGKILL terminates the blocked owner without an event-loop callback',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, 'activation');
    const entered = join(f.dir, 'block.fifo.entered');
    await waitFor(() => existsSync(entered));
    const result = spawnSync(
      'python3',
      [
        '-c',
        `
import os,signal,select
owner=int(open(${JSON.stringify(entered)}).read())
children=open('/proc/${f.supervisor.pid}/task/${f.supervisor.pid}/children').read().split()
assert str(owner) in children
ofd=os.pidfd_open(owner)
sfd=os.pidfd_open(${f.supervisor.pid})
signal.pidfd_send_signal(sfd, signal.SIGKILL)
p=select.poll();p.register(ofd,select.POLLIN)
observed=bool(p.poll(5000))
if not observed:
    signal.pidfd_send_signal(ofd,signal.SIGKILL)
    assert p.poll(5000), 'test owner cleanup failed'
os.close(sfd);os.close(ofd)
assert observed, 'blocked owner survived supervisor death; socket callbacks cannot fence it'
`,
      ],
      { encoding: 'utf8', timeout: 12000 },
    );
    assert.equal(result.status, 0, result.stderr);
    await waitFor(() => f.supervisor.signalCode !== null);
    assert.equal(existsSync(join(f.root, 'accepted.json')), false);
    // Both owners are dead: durable residue, not a live flock, denies takeover.
    assert.throws(() => new CellPreparation(f.root), {
      code: 'FAILED_PRECONDITION',
    });
  },
);
