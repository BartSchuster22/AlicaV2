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
import { join, resolve, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { canonical, digest, rawDigest } from '@alica/acap-contracts';
import { CellPreparation } from '../../tools/g7-cell.mjs';
import { adminRequest } from '../../tools/g7-admin.mjs';
import { cellFixture } from './cell-fixture.mjs';
import { upgradeTarget } from './cross-process-target.mjs';
import { signature } from '../../tools/g3-fixtures.mjs';
async function wait(fn, ms = 20000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    const result = fn();
    if (result) return result;
    await delay(10);
  }
  throw new Error('condition timed out');
}
function inventory(root) {
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
                  ino: s.ino,
                  mode: s.mode,
                  digest: rawDigest(readFileSync(join(root, p))),
                },
              ],
            ]
          : [];
      }),
  );
}
async function setup(t, mode = 'none', cli) {
  const dir = mkdtempSync(join(tmpdir(), 'g7-serve-'));
  const f = await cellFixture(dir),
    rootPath = join(dir, 'cell');
  cpSync(f.archive, join(dir, 'accepted-original.tar'));
  f.trust.revocation.version = 2;
  f.trust.revocationSignature = signature(
    f.trust.revocation,
    'ALICA-REVOCATION-v1',
    f.root,
  );
  mkdirSync(rootPath, { mode: 0o700 });
  const cell = new CellPreparation(rootPath);
  await cell.initialize(f.trust, f.floor);
  cell.close();
  const input = join(dir, 'input.json');
  const writeInput = () =>
    writeFileSync(
      input,
      canonical({
        archive: f.archive,
        trust: f.trust,
        authorization: f.authorization,
      }),
      { mode: 0o600 },
    );
  writeInput();
  const target = await upgradeTarget(dir, f, mode);
  assert.equal(spawnSync('mkfifo', [join(dir, 'pause.fifo')]).status, 0);
  const child = spawn(
    process.execPath,
    [
      '--experimental-vm-modules',
      ...(cli
        ? [
            'tools/g7-owned-cli.mjs',
            cli,
            rootPath,
            input,
            ...(cli === 'cycle' ? [target, target] : []),
          ]
        : ['tests/g7/serving-driver.mjs', rootPath, input, target]),
    ],
    {
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        G7_SERVING_DIR: dir,
        G7_SERVING_MODE: mode,
        NODE_OPTIONS: '--import=' + resolve('tests/g7/serving-faults.mjs'),
      },
    },
  );
  let output = '',
    errors = '';
  child.stdout.on('data', (b) => (output += b));
  child.stderr.on('data', (b) => (errors += b));
  t.after(async () => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (e) {
      if (e.code !== 'ESRCH') throw e;
    }
    if (child.exitCode === null && child.signalCode === null)
      await once(child, 'exit');
    if (process.env.G7_SERVING_EVIDENCE) {
      const dest = join(process.env.G7_SERVING_EVIDENCE, dir.split('/').at(-1));
      mkdirSync(dest, { recursive: true });
      writeFileSync(join(dest, 'stdout.log'), output);
      writeFileSync(join(dest, 'stderr.log'), errors);
      for (const p of readdirSync(dir, { recursive: true }))
        if (lstatSync(join(dir, p)).isFile()) {
          mkdirSync(dirname(join(dest, 'originals', p)), { recursive: true });
          cpSync(join(dir, p), join(dest, 'originals', p));
        }
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const rows = () => output.trim().split('\n').filter(Boolean).map(JSON.parse);
  const event = async (name, count = 1) =>
    wait(() => rows().filter((r) => r.event === name)[count - 1]);
  const command = async (name, count = 1) => {
    child.stdin.write(name + '\n');
    return event(name, count);
  };
  return {
    ...f,
    dir,
    rootPath,
    input,
    target,
    child,
    writeInput,
    rows,
    event,
    command,
    output: () => output,
    errors: () => errors,
  };
}
function selection(f) {
  return JSON.parse(readFileSync(join(f.rootPath, 'accepted.json')));
}
async function admin(f, version, operation, extra = {}) {
  const a = selection(f),
    incarnation = JSON.parse(
      readFileSync(join(f.rootPath, 'supervision/incarnation.json')),
    ).incarnation;
  const request = {
    schemaVersion: 'alica.cell-admin-request/v' + version,
    requestId: 'serving-request',
    incarnation,
    expectedSequence: a.sequence,
    operation,
    ...extra,
  };
  const result = await adminRequest(f.rootPath, version, request);
  return { request, result, accepted: a };
}
async function exactAdmin(f, version, operation, status) {
  const { request, result, accepted } = await admin(f, version, operation);
  assert.deepEqual(JSON.parse(canonical(result)), {
    schemaVersion: 'alica.cell-admin-response/v' + version,
    requestId: request.requestId,
    incarnation: request.incarnation,
    status,
    code: 'OK',
    sequence: accepted.sequence,
    acceptedDigest: digest(accepted),
  });
}
function excluded(f) {
  const p = spawnSync(
    process.execPath,
    [
      '--experimental-vm-modules',
      '--input-type=module',
      '-e',
      "import {CellPreparation} from './tools/g7-cell.mjs';new CellPreparation(process.argv[1]);",
      f.rootPath,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(p.status, 1);
  assert.match(p.stderr, /code: '(CONFLICT|FAILED_PRECONDITION)'/);
}
test(
  'continuous original Cell: serve, admin stop/start v1/v2, exact reinstall, real upgrade, repeated serving and maintenance',
  { timeout: 60000 },
  async (t) => {
    const f = await setup(t);
    const first = await f.event('begin');
    const noOp = (clean, after) =>
      assert.deepEqual(
        JSON.parse(readFileSync(join(f.dir, clean + '.json'))),
        JSON.parse(readFileSync(join(f.dir, after + '.json'))),
      );
    noOp('clean-1', 'begin-1');
    const original = inventory(f.rootPath),
      fence = lstatSync(join(f.rootPath, 'supervision')).ino;
    await f.command('serve');
    await exactAdmin(f, 1, 'status', 'RUNNING');
    await exactAdmin(f, 2, 'stop', 'STOPPED');
    await exactAdmin(f, 1, 'start', 'RUNNING');
    await exactAdmin(f, 2, 'status', 'RUNNING');
    excluded(f);
    const stop = await f.command('concurrent');
    assert.equal(stop.result.runtime, 'STOPPED');
    noOp('clean-2', 'concurrent-1');
    assert.deepEqual(stop.result.accepted, first.result.accepted);
    for (const [p, v] of Object.entries(original))
      if (
        !['kernel.json', 'floor.json'].includes(p) &&
        !p.startsWith('supervision/')
      )
        assert.deepEqual(inventory(f.rootPath)[p], v, p);
    await f.command('serve', 2);
    await exactAdmin(f, 2, 'status', 'RUNNING');
    const upgrade = await f.command('upgrade');
    assert.equal(upgrade.result.accepted.sequence, 2);
    assert.equal(upgrade.result.cellId, first.result.cellId);
    assert.notEqual(
      upgrade.result.accepted.release.profileDigest,
      first.result.accepted.release.profileDigest,
    );
    for (const [p, v] of Object.entries(original))
      if (
        p === 'identity.json' ||
        p.startsWith('releases/') ||
        p.startsWith('transactions/')
      )
        assert.deepEqual(inventory(f.rootPath)[p], v, p);
    await f.command('serve', 3);
    await exactAdmin(f, 1, 'status', 'RUNNING');
    const last = await f.command('maintain');
    assert.deepEqual(last.result.accepted, upgrade.result.accepted);
    noOp('clean-4', 'maintain-1');
    assert.equal(lstatSync(join(f.rootPath, 'supervision')).ino, fence);
    const retired = Object.entries(inventory(f.rootPath)).filter(([p]) =>
      p.startsWith('supervision/retired-'),
    );
    assert.equal(retired.length, 3);
    assert(
      retired.some(
        ([, v]) =>
          v.ino === original['supervision/incarnation.json'].ino &&
          v.digest === original['supervision/incarnation.json'].digest,
      ),
    );
    await f.command('finish');
    await wait(() => f.child.exitCode !== null);
    assert.equal(f.child.exitCode, 0, f.errors());
    excluded(f);
  },
);
test(
  'public cycle CLI restarts actual prior and target twice under continuous custody',
  { timeout: 60000 },
  async (t) => {
    const f = await setup(t, 'none', 'cycle');
    await wait(
      () => f.child.exitCode !== null || f.child.signalCode !== null,
      50000,
    );
    assert.equal(f.child.exitCode, 0, f.errors());
    const rows = f.rows();
    assert.deepEqual(
      rows.filter((r) => r.event === 'SERVING').map((r) => r.accepted.sequence),
      [1, 2, 2],
    );
    assert.equal(rows.at(-1).status, 'STOPPED');
    assert.equal(rows.at(-1).fence, 'RETAINED');
    excluded(f);
  },
);
function events(f) {
  return existsSync(join(f.dir, 'events.jsonl'))
    ? readFileSync(join(f.dir, 'events.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse)
    : [];
}
async function resume(f) {
  const p = spawn('python3', [
    '-c',
    'import os,sys;f=os.open(sys.argv[1],os.O_WRONLY);os.close(f)',
    join(f.dir, 'pause.fifo'),
  ]);
  const [code] = await once(p, 'exit');
  assert.equal(code, 0);
}
function immutablePreserved(f, before) {
  for (const [p, v] of Object.entries(before))
    if (
      p === 'identity.json' ||
      p === 'accepted.json' ||
      p.startsWith('releases/') ||
      p.startsWith('transactions/')
    ) {
      const s = lstatSync(join(f.rootPath, p));
      assert.deepEqual(
        {
          ino: s.ino,
          mode: s.mode,
          digest: rawDigest(readFileSync(join(f.rootPath, p))),
        },
        v,
        p,
      );
    }
}
function changeAuthority(f, kind) {
  if (kind === 'revoked') {
    f.trust.revocation.version++;
    f.trust.revocation.revokedArtifactDigests.push(
      selection(f).release.bundleDigest,
    );
  } else if (kind === 'equivocation') f.trust.revocation.expiresAtMs--;
  else if (kind === 'grants') f.authorization.capabilities[0].lifetimeMs--;
  f.trust.revocationSignature = signature(
    f.trust.revocation,
    'ALICA-REVOCATION-v1',
    f.root,
  );
  f.writeInput();
}
for (const boundary of ['maintenance', 'successor'])
  for (const kind of ['revoked', 'equivocation', 'grants'])
    test(
      `${boundary} rechecks current ${kind}; original accepted artifacts remain intact`,
      { timeout: 30000 },
      async (t) => {
        const f = await setup(
          t,
          boundary === 'successor' ? 'pause-serve' : 'none',
        );
        await f.event('begin');
        const before = inventory(f.rootPath);
        if (boundary === 'successor') {
          f.child.stdin.write('serve\n');
          await wait(() => events(f).some((e) => e.event === 'paused-serve'));
          changeAuthority(f, kind);
          await resume(f);
        } else {
          await f.command('serve');
          changeAuthority(f, kind);
          f.child.stdin.write('maintain\n');
        }
        await wait(
          () =>
            f.child.signalCode !== null ||
            f.errors().includes('NEEDS_OPERATOR'),
        );
        assert.equal(
          f
            .rows()
            .filter(
              (r) =>
                r.event === (boundary === 'successor' ? 'serve' : 'maintain'),
            ).length,
          0,
        );
        immutablePreserved(f, before);
        excluded(f);
      },
    );
for (const kind of [
  'bad-target-grants',
  'bad-target-readiness',
  'bad-target-call',
])
  test(
    'repeated maintenance real target denies ' + kind,
    { timeout: 30000 },
    async (t) => {
      const f = await setup(t, kind);
      await f.event('begin');
      const before = inventory(f.rootPath);
      await f.command('serve');
      f.child.stdin.write('upgrade\n');
      await wait(() => f.errors().includes('NEEDS_OPERATOR'));
      assert.equal(f.rows().filter((r) => r.event === 'upgrade').length, 0);
      immutablePreserved(f, before);
      excluded(f);
      const states = readdirSync(join(f.rootPath, 'transactions')).map((p) => {
        const dir = join(f.rootPath, 'transactions', p);
        return JSON.parse(
          readFileSync(join(dir, readdirSync(dir).sort().at(-1))),
        ).record.state;
      });
      assert(
        states.includes(kind === 'bad-target-grants' ? 'STAGING' : 'ABORTED'),
      );
    },
  );
for (const mode of [
  'forged-selection',
  'kill-owner',
  'kill-coordinator',
  'crash-before-serve',
  'crash-after-serve',
  'forged-clean',
  'crash-after-clean',
])
  test(
    'continuous custody fails closed at ' + mode,
    { timeout: 30000 },
    async (t) => {
      const f = await setup(t, mode);
      await f.event('begin');
      const before = inventory(f.rootPath);
      f.child.stdin.write('serve\n');
      if (['forged-clean', 'crash-after-clean'].includes(mode)) {
        await f.event('serve');
        f.child.stdin.write('maintain\n');
      }
      await wait(
        () =>
          f.child.signalCode !== null || f.errors().includes('NEEDS_OPERATOR'),
      );
      assert.equal(f.rows().filter((r) => r.event === 'maintain').length, 0);
      immutablePreserved(f, before);
      excluded(f);
      const replay = spawnSync(
        process.execPath,
        [
          '--experimental-vm-modules',
          'tools/g7-owned-cli.mjs',
          'serve',
          f.rootPath,
          f.input,
        ],
        { encoding: 'utf8', timeout: 5000 },
      );
      assert.equal(replay.status, 1);
      assert.deepEqual(JSON.parse(replay.stderr), {
        status: 'NEEDS_OPERATOR',
        fence: 'RETAINED',
      });
      for (const custody of [
        { clean: true },
        { receipt: f.rows()[0] },
        { pid: f.child.pid },
        { stopped: { status: 'STOPPED' } },
      ])
        assert.throws(() => new CellPreparation(f.rootPath, custody));
    },
  );
for (const mode of [
  'crash-before-accepted',
  'crash-after-accepted',
  'uncertain-rename',
  'uncertain-fsync',
  'crash-after-commit',
])
  test(
    'repeated upgrade uncertain commit retains original history: ' + mode,
    { timeout: 30000 },
    async (t) => {
      const f = await setup(t, mode);
      await f.event('begin');
      const before = inventory(f.rootPath),
        original = selection(f);
      await f.command('serve');
      f.child.stdin.write('upgrade\n');
      await wait(
        () =>
          f.child.signalCode !== null || f.errors().includes('NEEDS_OPERATOR'),
      );
      assert.equal(f.rows().filter((r) => r.event === 'upgrade').length, 0);
      excluded(f);
      const after = inventory(f.rootPath);
      for (const [p, v] of Object.entries(before))
        if (
          p === 'identity.json' ||
          p.startsWith('releases/') ||
          p.startsWith('transactions/')
        )
          assert.deepEqual(after[p], v, p);
      assert.equal(
        selection(f).sequence,
        mode === 'crash-before-accepted' ? 1 : 2,
      );
      if (mode === 'crash-before-accepted')
        assert.deepEqual(selection(f), original);
      const tx = readdirSync(join(f.rootPath, 'transactions')).filter(
        (p) => p !== original.transactionId,
      );
      assert.equal(tx.length, 1);
      const dir = join(f.rootPath, 'transactions', tx[0]);
      const published = readdirSync(dir)
        .filter((p) => /^\d{6}\.json$/.test(p))
        .sort();
      assert.equal(
        JSON.parse(readFileSync(join(dir, published.at(-1)))).record.state,
        mode === 'crash-after-commit' ? 'COMMITTED' : 'ACTIVATING',
      );
      if (mode === 'crash-after-commit')
        assert(readdirSync(dir).some((p) => p.startsWith('next-')));
    },
  );
for (const mode of [
  'block-activation',
  'block-cleanup',
  'block-normal-exit',
  'late-clean',
  'block-maintenance',
])
  test(
    'independent unchanged watchdog contains actual repeated ' + mode,
    { timeout: mode === 'block-maintenance' ? 340000 : 65000 },
    async (t) => {
      const f = await setup(t, mode);
      await f.event('begin');
      const before = inventory(f.rootPath);
      f.child.stdin.write('serve\n');
      if (mode !== 'block-activation') {
        await f.event('serve');
        f.child.stdin.write('maintain\n');
      }
      await wait(
        () => f.child.signalCode !== null,
        mode === 'block-maintenance' ? 325000 : 50000,
      );
      assert.equal(f.child.signalCode, 'SIGKILL');
      const marker =
        mode === 'late-clean'
          ? events(f)
              .filter(
                (e) => e.event === 'packet' && e.packet.startsWith('CLEAN '),
              )
              .at(-1)
          : events(f).find(
              (e) => e.event === mode.replace('block-', 'blocked-'),
            );
      assert(marker, 'real blocking boundary reached');
      const elapsed =
        Number(process.hrtime.bigint() - BigInt(marker.monotonicNs)) / 1e6;
      // CLEAN's ACK is inside the same original cleanup budget, not a new timer.
      const budget = mode === 'block-maintenance' ? 300000 : 30000;
      assert(
        elapsed >= budget - 1000 && elapsed <= budget + 2000,
        'external containment ms: ' + elapsed,
      );
      assert.equal(f.rows().filter((r) => r.event === 'maintain').length, 0);
      immutablePreserved(f, before);
      excluded(f);
    },
  );
for (const mode of [
  'fence-before-retire-link',
  'fence-after-retire-link',
  'fence-after-retire-fsync',
  'fence-after-incarnation-unlink',
  'fence-after-v1-unlink',
  'fence-after-v2-unlink',
  'fence-after-new-incarnation-fsync',
])
  test(
    'successor real filesystem crash preserves original fence: ' + mode,
    { timeout: 30000 },
    async (t) => {
      const f = await setup(t, mode);
      await f.event('begin');
      const before = inventory(f.rootPath),
        fence = lstatSync(join(f.rootPath, 'supervision')).ino;
      f.child.stdin.write('serve\n');
      await wait(
        () =>
          f.child.signalCode !== null || f.errors().includes('NEEDS_OPERATOR'),
      );
      assert(events(f).some((e) => e.event === mode));
      assert.equal(f.rows().filter((r) => r.event === 'serve').length, 0);
      assert.equal(lstatSync(join(f.rootPath, 'supervision')).ino, fence);
      immutablePreserved(f, before);
      excluded(f);
      const original = before['supervision/incarnation.json'];
      assert(
        Object.entries(inventory(f.rootPath)).some(
          ([p, v]) =>
            p.startsWith('supervision/') &&
            v.ino === original.ino &&
            v.digest === original.digest,
        ),
      );
    },
  );
test(
  'actual successor runtime death before its readiness snapshot cannot certify serving',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, 'failed-runtime-before-ready');
    await f.event('begin');
    const before = inventory(f.rootPath);
    f.child.stdin.write('serve\n');
    await wait(
      () =>
        f.child.signalCode !== null || f.errors().includes('NEEDS_OPERATOR'),
    );
    const observed = events(f).find((e) => e.event === 'real-failed-status');
    assert(observed);
    assert.equal(observed.runtime, 'FAILED');
    assert.equal(f.rows().filter((r) => r.event === 'serve').length, 0);
    immutablePreserved(f, before);
    excluded(f);
  },
);
function raw(f, version, request, sealed = true) {
  const socket = connect(
    join(
      f.rootPath,
      'supervision',
      version === 1 ? 'admin.sock' : 'admin-v2.sock',
    ),
  );
  let data = Buffer.alloc(0),
    closed = false;
  socket.on('error', () => {});
  socket.on('data', (b) => (data = Buffer.concat([data, b])));
  socket.on('close', () => (closed = true));
  const body = Buffer.from(canonical(request)),
    header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  socket.on('connect', () =>
    sealed
      ? socket.end(Buffer.concat([header, body]))
      : socket.write(Buffer.concat([header, body])),
  );
  return { socket, closed: () => closed, data: () => data };
}
test(
  'successor shared eight admissions, EOF sealing, wrong version and stale incarnation retain exact wire behavior',
  { timeout: 40000 },
  async (t) => {
    const f = await setup(t);
    await f.event('begin');
    await f.command('serve');
    const a = selection(f),
      old = JSON.parse(
        readFileSync(join(f.rootPath, 'supervision/incarnation.json')),
      ).incarnation;
    const request = (v) => ({
      schemaVersion: 'alica.cell-admin-request/v' + v,
      requestId: 'sealed-request',
      incarnation: old,
      expectedSequence: a.sequence,
      operation: 'stop',
    });
    const holders = [];
    for (let i = 0; i < 7; i++)
      holders.push(raw(f, (i % 2) + 1, request((i % 2) + 1), false));
    t.after(() => holders.forEach((h) => h.socket.destroy()));
    await Promise.all(holders.map((h) => once(h.socket, 'connect')));
    await delay(100);
    await exactAdmin(f, 2, 'status', 'RUNNING');
    const eighth = raw(f, 2, request(2), false);
    holders.push(eighth);
    await once(eighth.socket, 'connect');
    await delay(100);
    const ninth = raw(f, 1, request(1), false);
    t.after(() => ninth.socket.destroy());
    await wait(ninth.closed, 2000);
    assert.equal(ninth.data().length, 0);
    for (const h of holders) assert.equal(h.data().length, 0);
    // Orchestration seals already accepted unsealed requests without dispatch.
    await f.command('maintain');
    await wait(() => holders.every((h) => h.closed()));
    for (const h of holders) assert.equal(h.data().length, 0);
    await f.command('serve', 2);
    await exactAdmin(f, 1, 'status', 'RUNNING');
    const current = JSON.parse(
      readFileSync(join(f.rootPath, 'supervision/incarnation.json')),
    ).incarnation;
    assert.notEqual(current, old);
    const wrong = raw(f, 1, { ...request(2), incarnation: current });
    await wait(wrong.closed);
    assert.equal(wrong.data().length, 0);
    const stale = raw(f, 2, request(2));
    await wait(stale.closed);
    const b = stale.data();
    assert.equal(b.readUInt32BE(), b.length - 4);
    assert.deepEqual(JSON.parse(b.subarray(4)), {
      schemaVersion: 'alica.cell-admin-response/v2',
      requestId: 'sealed-request',
      incarnation: current,
      status: 'NEEDS_OPERATOR',
      sequence: a.sequence,
      acceptedDigest: digest(a),
      code: 'DENIED',
    });
    await exactAdmin(f, 2, 'status', 'RUNNING');
    await f.command('maintain', 2);
    await f.command('finish');
  },
);
test(
  'same flock competitor excluded through serving, actual upgrade and repeated owned reaps',
  { timeout: 60000 },
  async (t) => {
    const f = await setup(t);
    await f.event('begin');
    const done = join(f.dir, 'competition-ended');
    const p = spawn(
      'python3',
      [
        '-c',
        `import os,fcntl,time,sys,json
f=os.open(sys.argv[1],os.O_RDONLY|os.O_DIRECTORY);attempts=0
while not os.path.exists(sys.argv[2]):
 try:
  fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
  raise RuntimeError('original flock lost')
 except BlockingIOError: pass
 attempts+=1
 if attempts==1: print('READY',flush=True)
 time.sleep(.005)
print(json.dumps({'attempts':attempts}),flush=True)
`,
        f.rootPath,
        done,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    t.after(() => p.kill('SIGKILL'));
    let output = '',
      error = '';
    p.stdout.on('data', (b) => (output += b));
    p.stderr.on('data', (b) => (error += b));
    await wait(() => output.includes('READY'));
    await f.command('serve');
    await f.command('upgrade');
    await f.command('serve', 2);
    await f.command('maintain');
    writeFileSync(done, 'done');
    await wait(() => p.exitCode !== null);
    assert.equal(p.exitCode, 0, error);
    assert(JSON.parse(output.trim().split('\n').at(-1)).attempts > 1);
    await f.command('finish');
  },
);
test(
  'public foreground serve closes by actual seal/reaps, not signal-as-clean',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, 'none', 'serve');
    await f.event('SERVING');
    await exactAdmin(f, 2, 'status', 'RUNNING');
    f.child.kill('SIGTERM');
    await wait(() => f.child.exitCode !== null || f.child.signalCode !== null);
    assert.equal(f.child.exitCode, 0, f.errors());
    assert.equal(f.rows().at(-1).status, 'STOPPED');
    excluded(f);
  },
);
