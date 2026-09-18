import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  lstatSync,
  existsSync,
  rmSync,
  cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { connect } from 'node:net';
import { canonical, rawDigest } from '@alica/acap-contracts';
import { CellPreparation } from '../../tools/g7-cell.mjs';
import { cellFixture } from './cell-fixture.mjs';

async function waitFor(fn, ms = 20000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    const v = fn();
    if (v) return v;
    await delay(20);
  }
  throw new Error('condition timed out');
}
function snapshot(root) {
  return Object.fromEntries(
    readdirSync(root, { recursive: true })
      .sort()
      .flatMap((p) => {
        const s = lstatSync(join(root, p));
        return s.isFile()
          ? [
              [
                p,
                {
                  sha256: rawDigest(readFileSync(join(root, p))),
                  ino: s.ino,
                  mode: s.mode,
                  mtimeMs: s.mtimeMs,
                },
              ],
            ]
          : [];
      }),
  );
}
async function setup(t, mode = 'none', env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'g7-owned-')),
    f = await cellFixture(dir),
    root = join(dir, 'cell');
  mkdirSync(root, { mode: 0o700 });
  const cell = new CellPreparation(root);
  await cell.initialize(f.trust, f.floor);
  cell.close();
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
  assert.equal(spawnSync('mkfifo', [join(dir, 'pause.fifo')]).status, 0);
  if (mode.startsWith('block-')) {
    env = {
      ...env,
      G7_OWNED_BLOCK: mode.slice(6),
      G7_OWNED_FIFO: join(dir, 'pause.fifo'),
      NODE_OPTIONS:
        '--import=' + resolve('tests/g7/owned-coordinator-block.mjs'),
    };
  }
  const argv =
    mode === 'production'
      ? [
          'tools/g7-owned-coordinator.py',
          'run-verify-stopped',
          process.execPath,
          root,
          input,
        ]
      : [
          'tests/g7/owned-coordinator-driver.py',
          mode,
          dir,
          process.execPath,
          root,
          input,
        ];
  const child = spawn('python3', argv, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
  let output = '',
    errors = '';
  child.stdout.on('data', (b) => {
    output += b;
  });
  child.stderr.on('data', (b) => {
    errors += b;
  });
  t.after(async () => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (e) {
      if (e.code !== 'ESRCH') throw e;
    }
    if (child.exitCode === null && child.signalCode === null)
      await once(child, 'exit');
    if (process.env.G7_OWNED_EVIDENCE) {
      const target = join(process.env.G7_OWNED_EVIDENCE, dir.split('/').at(-1));
      mkdirSync(target, { recursive: true });
      writeFileSync(join(target, 'stdout.log'), output);
      writeFileSync(join(target, 'stderr.log'), errors);
      for (const name of ['events.jsonl', 'boundary.json', 'input.json'])
        if (existsSync(join(dir, name)))
          cpSync(join(dir, name), join(target, name));
      // Preserve actual original test artifacts and Cell bytes, but no live sockets/FIFOs.
      for (const p of readdirSync(dir, { recursive: true })) {
        if (lstatSync(join(dir, p)).isFile()) {
          const dest = join(target, 'originals', p);
          mkdirSync(resolve(dest, '..'), { recursive: true });
          cpSync(join(dir, p), dest);
        }
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    ...f,
    dir,
    root,
    input,
    child,
    output: () => output,
    errors: () => errors,
  };
}
async function paused(f) {
  return waitFor(
    () =>
      existsSync(join(f.dir, 'boundary.json')) &&
      JSON.parse(readFileSync(join(f.dir, 'boundary.json'))),
  );
}
function resume(f) {
  const p = spawn('python3', [
    '-c',
    'import os,sys; f=os.open(sys.argv[1],os.O_WRONLY); os.write(f,b"x"); os.close(f)',
    join(f.dir, 'pause.fifo'),
  ]);
  return once(p, 'exit');
}
function excluded(f) {
  assert.throws(() => new CellPreparation(f.root));
  const contender = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import {CellPreparation} from './tools/g7-cell.mjs'; new CellPreparation(process.argv[1]);",
      f.root,
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(contender.status, 0);
}
function events(f) {
  return readFileSync(join(f.dir, 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
}
async function result(f) {
  await waitFor(() => f.child.exitCode !== null || f.child.signalCode !== null);
  assert.equal(f.child.exitCode, 0, f.errors());
  return JSON.parse(f.output());
}
function admin(f, version, operation) {
  return new Promise((resolvePromise) => {
    const socket = connect(
      join(
        f.root,
        'supervision',
        version === 1 ? 'admin.sock' : 'admin-v2.sock',
      ),
    );
    let response = '';
    socket.on('error', () => resolvePromise(null));
    socket.on('data', (b) => {
      response += b.toString('hex');
    });
    socket.on('close', () => resolvePromise(response));
    socket.on('connect', () => {
      const incarnation = JSON.parse(
        readFileSync(join(f.root, 'supervision/incarnation.json')),
      ).incarnation;
      const data = Buffer.from(
        JSON.stringify({
          schemaVersion: `alica.cell-admin-request/v${version}`,
          requestId: 'race',
          incarnation,
          expectedSequence: 1,
          operation,
        }),
      );
      const header = Buffer.alloc(4);
      header.writeUInt32BE(data.length);
      socket.end(Buffer.concat([header, data]));
    });
  });
}

test(
  'unmodified CLI path establishes custody from inception and refuses later residue adoption',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, 'production');
    const identity = readFileSync(join(f.root, 'identity.json'));
    assert.equal((await result(f)).status, 'STOPPED');
    assert.deepEqual(readFileSync(join(f.root, 'identity.json')), identity);
    const before = snapshot(f.root);
    const retry = spawnSync(
      'python3',
      [
        'tools/g7-owned-coordinator.py',
        'run-verify-stopped',
        process.execPath,
        f.root,
        f.input,
      ],
      { encoding: 'utf8', timeout: 5000 },
    );
    assert.notEqual(retry.status, 0);
    assert(retry.stderr.includes('existing custody is not owned'));
    assert.deepEqual(snapshot(f.root), before);
    excluded(f);
  },
);

test(
  'owned coordinator: independent custodian and owner normal reaps precede real stopped verification; original Cell preserved',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, 'before-maintenance');
    await paused(f);
    excluded(f);
    const before = snapshot(f.root);
    const e = events(f);
    assert(e.some((v) => v.event === 'after-CLEAN' && v.pid !== f.child.pid));
    const ownerReap = e.find((v) => v.event === 'owner-waitpid');
    assert.equal(ownerReap.status, 0);
    assert.equal(
      ownerReap.child,
      e.find((v) => v.event === 'owner-spawn').child,
    );
    assert(
      ownerReap.monotonic < e.find((v) => v.event === 'before-CLEAN').monotonic,
    );
    assert.equal(e.filter((v) => v.event === 'owner-spawn').length, 1);
    assert.equal(e.filter((v) => v.event === 'normal-reap').length, 1);
    assert.equal(
      e.find((v) => v.event === 'normal-reap').child,
      e.find((v) => v.event === 'after-CLEAN').pid,
    );
    await resume(f);
    const r = await result(f);
    assert.equal(r.operation, 'verify-stopped');
    assert.equal(r.status, 'STOPPED');
    assert.equal(r.fence, 'RETAINED');
    const after = snapshot(f.root);
    writeFileSync(
      join(f.dir, 'maintenance-binding.json'),
      JSON.stringify({ before, after }, null, 2),
    );
    assert.deepEqual(after, before);
    assert.equal(events(f).filter((v) => v.event === 'normal-reap').length, 2);
    excluded(f); // Successful operation does not turn durable residue into takeover authority.
  },
);

for (const boundary of [
  'before-fsync-1',
  'after-fsync-1',
  'before-fsync-2',
  'after-fsync-2',
  'before-fsync-3',
  'after-fsync-3',
  'before-READY',
  'after-READY',
  'before-SEALED',
  'after-SEALED',
  'before-CLEAN',
  'after-CLEAN',
  'after-reap',
  'before-maintenance',
  'after-maintenance',
]) {
  test(
    'owned coordinator loss retains fence at ' + boundary,
    { timeout: 30000 },
    async (t) => {
      const f = await setup(t, boundary);
      const p = await paused(f);
      excluded(f);
      const before = snapshot(f.root);
      process.kill(f.child.pid, 'SIGKILL');
      await once(f.child, 'exit');
      await delay(100);
      excluded(f);
      const after = snapshot(f.root);
      writeFileSync(
        join(f.dir, 'crash-binding.json'),
        JSON.stringify({ boundary, before, after }, null, 2),
      );
      // Before owner reap the live public Kernel may persist its own high-water
      // observation. A kill cannot undo that IO. Preserve it; do not call it a no-op.
      const immutable = (value) =>
        Object.fromEntries(
          Object.entries(value).filter(
            ([name]) =>
              ![
                'before-READY',
                'after-READY',
                'before-SEALED',
                'after-SEALED',
              ].includes(boundary) ||
              !['kernel.json', 'kernel.json.next'].includes(name),
          ),
        );
      assert.deepEqual(immutable(after), immutable(before));
      assert(!f.output().includes('"operation": "verify-stopped"'));
      assert(existsSync(join(f.root, 'supervision')));
      if (p.pid !== f.child.pid) {
        // /proc is diagnostic only, never used by the production gate.
        const status = existsSync(`/proc/${p.pid}/stat`)
          ? readFileSync(`/proc/${p.pid}/stat`, 'utf8')
          : '';
        assert(!status || status.split(') ')[1].startsWith('Z'));
      }
    },
  );
}

for (const boundary of [
  'before-fsync-1',
  'after-fsync-1',
  'before-fsync-2',
  'after-fsync-2',
  'before-fsync-3',
  'after-fsync-3',
  'before-READY',
  'before-SEALED',
  'after-SEALED',
  'before-CLEAN',
  'after-CLEAN',
]) {
  test(
    'custodian abnormal death cannot become stopped permission at ' + boundary,
    { timeout: 30000 },
    async (t) => {
      const f = await setup(t, boundary);
      const p = await paused(f);
      assert.notEqual(p.pid, f.child.pid);
      process.kill(p.pid, 'SIGKILL');
      await waitFor(() => f.output().includes('NEEDS_OPERATOR'));
      excluded(f);
      assert(!events(f).some((v) => v.event === 'before-maintenance'));
    },
  );
}

for (const point of ['after-READY', 'before-SEALED', 'after-SEALED']) {
  test(
    'exact owner pidfd death denies maintenance at ' + point,
    { timeout: 30000 },
    async (t) => {
      const f = await setup(t, 'owner-death-' + point);
      await waitFor(() => f.output().includes('NEEDS_OPERATOR'));
      assert(events(f).some((v) => v.event === 'owner-killed'));
      assert(!events(f).some((v) => v.event === 'before-maintenance'));
      excluded(f);
    },
  );
}

test(
  'requests queued before seal cannot restart after the seal linearization point',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, 'before-READY');
    await paused(f);
    const pending = [1, 2].flatMap((v) =>
      ['stop', 'start', 'verify'].map((op) => admin(f, v, op)),
    );
    await delay(50);
    await resume(f);
    await Promise.all(pending);
    assert.equal((await result(f)).status, 'STOPPED');
    assert.equal(events(f).filter((v) => v.event === 'owner-spawn').length, 1);
  },
);

test(
  'sealing excludes concurrent v1/v2 starts stops and mutations without a successor',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, 'after-SEALED');
    await paused(f);
    const before = snapshot(f.root);
    const replies = await Promise.all(
      [1, 2].flatMap((v) =>
        ['start', 'stop', 'verify', 'status', 'upgrade'].map((op) =>
          admin(f, v, op),
        ),
      ),
    );
    assert(replies.every((v) => v === null || v === ''));
    excluded(f);
    const after = snapshot(f.root);
    writeFileSync(
      join(f.dir, 'sealed-race-binding.json'),
      JSON.stringify({ before, after }, null, 2),
    );
    // Admission is sealed but the prior Kernel has not shut down yet. Its
    // own opaque high-water observations are not an admitted admin mutation.
    const immutable = (value) =>
      Object.fromEntries(
        Object.entries(value).filter(
          ([name]) => !['kernel.json', 'kernel.json.next'].includes(name),
        ),
      );
    assert.deepEqual(immutable(after), immutable(before));
    await resume(f);
    assert.equal((await result(f)).status, 'STOPPED');
    assert.equal(events(f).filter((v) => v.event === 'owner-spawn').length, 1);
  },
);

for (const corruption of [
  'retained',
  'archive',
  'current-trust',
  'authorization',
]) {
  test(
    'stopped verification rejects ' +
      corruption +
      ' tamper without Cell writes',
    { timeout: 30000 },
    async (t) => {
      const f = await setup(t, 'before-maintenance');
      await paused(f);
      if (corruption === 'retained') {
        const retained = join(
          f.root,
          'releases',
          readdirSync(join(f.root, 'releases'))[0],
          'docs/fixture.txt',
        );
        writeFileSync(retained, 'corrupt');
      } else if (corruption === 'archive') writeFileSync(f.archive, 'corrupt');
      else {
        const input = JSON.parse(readFileSync(f.input));
        if (corruption === 'current-trust') input.trust = {};
        else input.authorization.capabilities[0].lifetimeMs--;
        writeFileSync(f.input, canonical(input));
      }
      const before = snapshot(f.root);
      await resume(f);
      await waitFor(() => f.output().includes('NEEDS_OPERATOR'));
      assert.deepEqual(snapshot(f.root), before);
      excluded(f);
    },
  );
}

test('real Unix credentials reject forged/unowned/closed inherited channels and abnormal/late pidfd reaps', () => {
  const p = spawnSync('python3', ['tests/g7/owned-channel-process.py', '-v'], {
    encoding: 'utf8',
  });
  console.log(p.stdout + p.stderr);
  assert.equal(p.status, 0);
});

test(
  'independent stopped worker blocked IO expires unchanged verification budget without release',
  { timeout: 320000 },
  async (t) => {
    const started = performance.now();
    const f = await setup(t, 'block-maintenance');
    await waitFor(() => existsSync(join(f.dir, 'pause.fifo.entered')));
    assert(events(f).some((v) => v.event === 'before-maintenance'));
    const before = snapshot(f.root);
    excluded(f);
    await waitFor(() => f.output().includes('NEEDS_OPERATOR'), 310000);
    assert(performance.now() - started >= 300000);
    assert(!events(f).some((v) => v.event === 'after-maintenance'));
    assert(!f.output().includes('"operation": "verify-stopped"'));
    const after = snapshot(f.root);
    writeFileSync(
      join(f.dir, 'blocked-maintenance-binding.json'),
      JSON.stringify({ before, after }, null, 2),
    );
    assert.deepEqual(after, before);
    excluded(f);
  },
);

test(
  'coordinator death kills the guarded independent stopped worker while retaining residue',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, 'block-maintenance');
    await waitFor(() => existsSync(join(f.dir, 'pause.fifo.entered')));
    const pid = Number(readFileSync(join(f.dir, 'pause.fifo.entered'), 'utf8'));
    const ready = join(f.dir, 'pidfd-watcher-ready');
    const observer = spawn(
      'python3',
      [
        '-c',
        "import os,select,sys,pathlib; fd=os.pidfd_open(int(sys.argv[1])); pathlib.Path(sys.argv[2]).write_text('held'); ready=select.select([fd],[],[],5)[0]; os.close(fd); print('EXITED' if ready else 'ALIVE'); sys.exit(0 if ready else 1)",
        String(pid),
        ready,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let observed = '';
    observer.stdout.on('data', (b) => {
      observed += b;
    });
    const completed = once(observer, 'exit');
    await waitFor(() => existsSync(ready));
    const before = snapshot(f.root);
    process.kill(f.child.pid, 'SIGKILL');
    await once(f.child, 'exit');
    assert.equal((await completed)[0], 0);
    writeFileSync(join(f.dir, 'held-pidfd-containment.log'), observed);
    assert.equal(observed.trim(), 'EXITED'); // Containment only, never clean-reap authority.
    assert.deepEqual(snapshot(f.root), before);
    excluded(f);
    assert(!f.output().includes('"operation": "verify-stopped"'));
  },
);

for (const [phase, budget] of [
  ['cleanup', 30000],
  ['verification', 300000],
]) {
  test(
    'real owner blocked IO expires unchanged ' +
      phase +
      ' budget without offline admission',
    { timeout: budget + 20000 },
    async (t) => {
      const start = performance.now();
      const f = await setup(t, 'block-' + phase);
      await waitFor(() => existsSync(join(f.dir, 'pause.fifo.entered')));
      excluded(f);
      const before = snapshot(f.root);
      await waitFor(
        () => f.output().includes('NEEDS_OPERATOR'),
        budget + 10000,
      );
      assert(performance.now() - start >= budget);
      assert(!events(f).some((v) => v.event === 'before-maintenance'));
      excluded(f);
      assert.deepEqual(snapshot(f.root), before);
    },
  );
}

test(
  'buffered genuine CLEAN and normal child exit cannot certify after the unchanged reap deadline',
  { timeout: 45000 },
  async (t) => {
    const f = await setup(t, 'before-reap');
    await paused(f);
    await delay(30500);
    await resume(f);
    await waitFor(() => f.output().includes('NEEDS_OPERATOR'));
    assert(events(f).some((v) => v.event === 'after-CLEAN'));
    assert(!events(f).some((v) => v.event === 'before-maintenance'));
    excluded(f);
  },
);

test(
  'blocked seal acknowledgement expires the actual unchanged cleanup budget without maintenance',
  { timeout: 45000 },
  async (t) => {
    const f = await setup(t, 'before-SEALED');
    await paused(f);
    await waitFor(() => f.output().includes('NEEDS_OPERATOR'), 35000);
    assert(!events(f).some((v) => v.event === 'before-maintenance'));
    excluded(f);
  },
);
