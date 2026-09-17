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
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { canonical } from '@alica/acap-contracts';
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
async function setup(t, block = false) {
  const dir = mkdtempSync(join(tmpdir(), 'g7-supervisor-'));
  const f = await cellFixture(dir),
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
    dir,
    root,
    input,
    supervisor,
    incarnation: JSON.parse(readFileSync(record)).incarnation,
  };
  if (block !== 'activation') {
    await waitFor(async () => {
      assert.equal(supervisor.exitCode, null, stderr);
      return (await request(result))?.status === 'RUNNING';
    });
  }
  return result;
}
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
