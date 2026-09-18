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
  closeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { canonical, digest } from '@alica/acap-contracts';
import { createRequire } from 'node:module';
const native = createRequire(import.meta.url)(
  '../../native/g7/build/ownership.node',
);
import { upgradeTarget } from './cross-process-target.mjs';
import { CellPreparation } from '../../tools/g7-cell.mjs';
import { cellFixture } from './cell-fixture.mjs';
import { signature } from '../../tools/g3-fixtures.mjs';
import { validateJournal, validateHistory } from '../../tools/g7-cell.mjs';
async function wait(fn, ms = 20000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    const v = fn();
    if (v) return v;
    await delay(10);
  }
  throw new Error('condition timed out');
}
async function setup(t, mode = 'none', upgrade = false) {
  const dir = mkdtempSync(join(tmpdir(), 'g7-cross-')),
    f = await cellFixture(dir),
    root = join(dir, 'cell');
  cpSync(f.archive, join(dir, 'accepted-original.tar'));
  f.trust.revocation.version = 2;
  f.trust.revocationSignature = signature(
    f.trust.revocation,
    'ALICA-REVOCATION-v1',
    f.root,
  );
  mkdirSync(root, { mode: 0o700 });
  const cell = new CellPreparation(root);
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
  let target;
  if (upgrade) {
    target = await upgradeTarget(dir, f, mode);
  }
  assert.equal(spawnSync('mkfifo', [join(dir, 'pause.fifo')]).status, 0);
  const child = spawn(
    process.execPath,
    [
      '--experimental-vm-modules',
      'tools/g7-owned-cli.mjs',
      upgrade ? 'upgrade' : 'exact-reinstall',
      root,
      input,
      ...(upgrade ? [target] : []),
    ],
    {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        G7_CROSS_DIRECTORY: dir,
        G7_CROSS_MODE: mode,
        NODE_OPTIONS: '--import=' + resolve('tests/g7/cross-process-block.mjs'),
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
    if (process.env.G7_CROSS_EVIDENCE) {
      const target = join(process.env.G7_CROSS_EVIDENCE, dir.split('/').at(-1));
      mkdirSync(target, { recursive: true });
      writeFileSync(join(target, 'stdout.log'), output);
      writeFileSync(join(target, 'stderr.log'), errors);
      for (const p of readdirSync(dir, { recursive: true }))
        if (lstatSync(join(dir, p)).isFile()) {
          const dest = join(target, 'originals', p);
          mkdirSync(dirname(dest), { recursive: true });
          cpSync(join(dir, p), dest);
        }
    }
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    ...f,
    dir,
    rootPath: root,
    input,
    writeInput,
    child,
    output: () => output,
    errors: () => errors,
  };
}
async function resume(f) {
  const p = spawn('python3', [
    '-c',
    'import os,sys;f=os.open(sys.argv[1],os.O_WRONLY);os.write(f,b"x");os.close(f)',
    join(f.dir, 'pause.fifo'),
  ]);
  await once(p, 'exit');
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
  'cross-process exact reinstall: actual original Cell/Kernel bytes and inodes preserved, fence retained',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t);
    await wait(() => f.child.exitCode !== null || f.child.signalCode !== null);
    assert.equal(f.child.exitCode, 0, f.errors());
    const result = JSON.parse(f.output());
    assert.equal(result.operation, 'exact-reinstall');
    assert.equal(result.status, 'STOPPED');
    assert.equal(result.fence, 'RETAINED');
    for (const custody of [
      { clean: true },
      { stopped: result },
      { pid: f.child.pid },
      { receipt: result },
    ])
      assert.throws(() => new CellPreparation(f.rootPath, custody));
    const replay = spawnSync(
      process.execPath,
      [
        '--experimental-vm-modules',
        'tools/g7-owned-cli.mjs',
        'exact-reinstall',
        f.rootPath,
        f.input,
      ],
      { encoding: 'utf8', timeout: 5000 },
    );
    assert.equal(replay.status, 1);
    assert.equal(JSON.parse(replay.stderr).status, 'NEEDS_OPERATOR');
    assert.deepEqual(
      JSON.parse(readFileSync(join(f.dir, 'after.json'))),
      JSON.parse(readFileSync(join(f.dir, 'before.json'))),
    );
    const events = readFileSync(join(f.dir, 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert(
      events.some(
        (e) =>
          e.event === 'packet' &&
          e.packet.startsWith('CLEAN ') &&
          e.child !== e.pid,
      ),
    );
    assert(events.some((e) => e.event === 'send' && e.packet === 'CLEANUP'));
    excluded(f);
  },
);
for (const kind of [
  'same-version-equivocation',
  'revoked-bundle',
  'authorization',
  'archive',
  'forged-clean',
  'kill-coordinator',
])
  test('cross-process rejects ' + kind, { timeout: 30000 }, async (t) => {
    const f = await setup(
      t,
      ['forged-clean', 'kill-coordinator'].includes(kind)
        ? kind
        : 'pause-clean',
    );
    await wait(() => existsSync(join(f.dir, 'before.json')));
    excluded(f);
    if (kind === 'same-version-equivocation') {
      f.trust.revocation.expiresAtMs++;
      f.trust.revocationSignature = signature(
        f.trust.revocation,
        'ALICA-REVOCATION-v1',
        f.root,
      );
      f.writeInput();
    }
    if (kind === 'revoked-bundle') {
      f.trust.revocation.version++;
      f.trust.revocation.revokedArtifactDigests.push(
        JSON.parse(readFileSync(join(f.rootPath, 'accepted.json'))).release
          .bundleDigest,
      );
      f.trust.revocationSignature = signature(
        f.trust.revocation,
        'ALICA-REVOCATION-v1',
        f.root,
      );
      f.writeInput();
    }
    if (kind === 'authorization') {
      f.authorization.capabilities[0].lifetimeMs--;
      f.writeInput();
    }
    if (kind === 'archive') {
      const b = readFileSync(f.archive);
      b[b.length - 1] = 1;
      writeFileSync(f.archive, b);
    }
    if (!['forged-clean', 'kill-coordinator'].includes(kind)) await resume(f);
    await wait(
      () =>
        f.child.signalCode !== null || f.errors().includes('NEEDS_OPERATOR'),
    );
    assert(!f.output().includes('"status":"STOPPED"'));
    assert(!existsSync(join(f.dir, 'after.json')));
    excluded(f);
  });

test(
  'continuous separate flock competitor and concurrent constructors cannot enter owned lifecycle',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, 'pause-clean', true);
    await wait(() => existsSync(join(f.dir, 'before.json')));
    const contender = spawn(
      'python3',
      [
        '-c',
        `import os,fcntl,time,sys,json
root,stop=sys.argv[1:]
f=os.open(root,os.O_RDONLY|os.O_DIRECTORY);attempts=0
while not os.path.exists(stop):
 try:
  fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if not os.path.exists(stop): raise RuntimeError('continuous flock lost')
  break
 except BlockingIOError: pass
 attempts+=1
 if attempts==1: print('READY',flush=True)
 time.sleep(.005)
print(json.dumps({'attempts':attempts}),flush=True)
`,
        f.rootPath,
        join(f.dir, 'after.json'),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '',
      error = '';
    contender.stdout.on('data', (b) => (output += b));
    contender.stderr.on('data', (b) => (error += b));
    t.after(() => contender.kill('SIGKILL'));
    await wait(() => output.includes('READY'));
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        const child = spawn(process.execPath, [
          '--experimental-vm-modules',
          'tools/g7-cell-cli.mjs',
          'status',
          f.rootPath,
        ]);
        let error = '';
        child.stderr.on('data', (b) => (error += b));
        const [code] = await once(child, 'exit');
        assert.equal(code, 1);
        assert.deepEqual(JSON.parse(error), {
          status: 'NEEDS_OPERATOR',
          code: 'CONFLICT',
        });
      }),
    );
    assert.throws(() => new CellPreparation(f.rootPath));
    const release = spawn('python3', [
      '-c',
      'import sys;open(sys.argv[1],"wb",buffering=0).write(b"x")',
      join(f.dir, 'pause.fifo'),
    ]);
    t.after(() => release.kill('SIGKILL'));
    await once(release, 'exit');
    await wait(() => f.child.exitCode !== null || f.child.signalCode !== null);
    assert.equal(f.child.exitCode, 0, f.errors());
    await wait(
      () => contender.exitCode !== null || contender.signalCode !== null,
    );
    assert.equal(contender.exitCode, 0, error);
    assert(JSON.parse(output.trim().split('\n').at(-1)).attempts > 1);
    excluded(f);
  },
);

test(
  'maintenance parent death contains exact pidfd-pinned coordinator; fence is not clean authority',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, 'pause-clean');
    await wait(() => existsSync(join(f.dir, 'before.json')));
    const events = readFileSync(join(f.dir, 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
    const pid = events.find((e) => e.packet?.startsWith('CLEAN ')).child;
    const fd = native.childPidfd(pid);
    t.after(() => closeSync(fd));
    assert.equal(native.pidfdDead(fd), false);
    f.child.kill('SIGKILL');
    await wait(() => native.pidfdDead(fd), 5000);
    assert(!f.output().includes('"status":"STOPPED"'));
    excluded(f);
  },
);

test(
  'buffered authentic CLEAN returned after real cleanup deadline is not authority',
  { timeout: 45000 },
  async (t) => {
    const f = await setup(t, 'late-clean');
    await wait(() => f.errors().includes('NEEDS_OPERATOR'), 40000);
    assert(!f.output().includes('"status":"STOPPED"'));
    assert(!existsSync(join(f.dir, 'after.json')));
    excluded(f);
  },
);
for (const mode of [
  'bad-target-grants',
  'bad-target-readiness',
  'bad-target-call',
])
  test(
    'owned upgrade denies ' + mode + ' without reviving or replacing prior',
    { timeout: 30000 },
    async (t) => {
      const f = await setup(t, mode, true);
      await wait(() => f.errors().includes('NEEDS_OPERATOR'));
      assert(!f.output().includes('"status":"STOPPED"'));
      const accepted = JSON.parse(
        readFileSync(join(f.rootPath, 'accepted.json')),
      );
      assert.equal(accepted.sequence, 1);
      assert.equal(accepted.release.bundleDigest, digest(f.bundle));
      const js = journals(f);
      assert.equal(
        js.find((j) => j.last.operation === 'upgrade').last.state,
        mode === 'bad-target-grants' ? 'STAGING' : 'ABORTED',
      );
      assert.equal(
        js.find((j) => j.last.operation === 'install').last.state,
        'COMMITTED',
      );
      excluded(f);
    },
  );

function journals(f) {
  return readdirSync(join(f.rootPath, 'transactions')).map((tx) => {
    const rows = readdirSync(join(f.rootPath, 'transactions', tx))
      // Inspect published records separately from retained next-* crash residue.
      // Production still rejects residue; this helper does NOT certify restart.
      .filter((n) => /^\d{6}\.json$/.test(n))
      .sort()
      .map((n) =>
        JSON.parse(readFileSync(join(f.rootPath, 'transactions', tx, n))),
      );
    return { rows, last: validateJournal(rows) };
  });
}
test(
  'owned upgrade commits a distinct immutable target with original prior history and actual new IPC readiness',
  { timeout: 30000 },
  async (t) => {
    const f = await setup(t, 'none', true);
    await wait(() => f.child.exitCode !== null || f.child.signalCode !== null);
    assert.equal(f.child.exitCode, 0, f.errors());
    const result = JSON.parse(f.output());
    assert.equal(result.operation, 'upgrade');
    assert.equal(result.status, 'STOPPED');
    assert.equal(result.accepted.sequence, 2);
    const js = journals(f).sort(
      (a, b) => a.last.targetRevision - b.last.targetRevision,
    );
    assert.equal(js.length, 2);
    assert.deepEqual(
      js.map((j) => j.last.state),
      ['COMMITTED', 'COMMITTED'],
    );
    assert.equal(js[1].last.operation, 'upgrade');
    assert.equal(js[1].last.priorRevision, 1);
    assert.deepEqual(js[1].last.prior, js[0].last.target);
    assert.notEqual(
      js[1].last.target.bundleDigest,
      js[0].last.target.bundleDigest,
    );
    assert.equal(js[0].last.target.bundleDigest, digest(f.bundle));
    assert.notEqual(
      js[1].last.target.profileDigest,
      js[0].last.target.profileDigest,
    );
    assert.notEqual(js[1].last.target.lockDigest, js[0].last.target.lockDigest);
    assert.notEqual(
      js[1].last.target.authorizationDigest,
      js[0].last.target.authorizationDigest,
    );
    const before = JSON.parse(readFileSync(join(f.dir, 'before.json'))),
      after = JSON.parse(readFileSync(join(f.dir, 'after.json')));
    for (const [p, b] of Object.entries(before))
      if (
        p === 'identity.json' ||
        p.startsWith('releases/') ||
        p.startsWith('transactions/')
      )
        assert.deepEqual(after[p], b, p);
    const floor = JSON.parse(readFileSync(join(f.rootPath, 'floor.json')));
    validateHistory(
      [...js].reverse(),
      result.accepted,
      result.accepted.cellId,
      floor,
    );
    for (const mutation of [
      'missing-prior',
      'fork',
      'wrong-prior',
      'old-selection',
      'backward-trust',
    ]) {
      const bad = structuredClone(js),
        selected = structuredClone(result.accepted);
      if (mutation === 'missing-prior') bad.shift();
      if (mutation === 'fork') bad.push(structuredClone(bad[1]));
      if (mutation === 'wrong-prior') bad[1].last.prior = bad[1].last.target;
      if (mutation === 'old-selection') {
        selected.sequence = 1;
        selected.transactionId = bad[0].last.transactionId;
        selected.release = bad[0].last.target;
      }
      if (mutation === 'backward-trust')
        bad[1].rows[0].record.trustFloor.lastWallMs = 0;
      assert.throws(
        () => validateHistory(bad, selected, result.accepted.cellId, floor),
        mutation,
      );
    }
    excluded(f);
  },
);
for (const mode of [
  'crash-before-accepted',
  'crash-after-accepted',
  'crash-after-accepted-fsync',
  'uncertain-rename',
  'uncertain-directory-fsync',
  'crash-before-commit',
  'crash-after-commit',
  'uncertain-commit-fsync',
])
  test(
    'owned upgrade conservative publication: ' + mode,
    { timeout: 30000 },
    async (t) => {
      const f = await setup(t, mode, true);
      await wait(
        () =>
          f.child.signalCode !== null || f.errors().includes('NEEDS_OPERATOR'),
      );
      assert(!f.output().includes('"status":"STOPPED"'));
      excluded(f);
      const accepted = JSON.parse(
        readFileSync(join(f.rootPath, 'accepted.json')),
      );
      assert.equal(accepted.sequence, mode === 'crash-before-accepted' ? 1 : 2);
      const js = journals(f),
        upgrade = js.find((j) => j.last.operation === 'upgrade');
      assert.equal(
        upgrade.last.state,
        ['crash-after-commit', 'uncertain-commit-fsync'].includes(mode)
          ? 'COMMITTED'
          : 'ACTIVATING',
      );
      assert.equal(
        js.find((j) => j.last.operation === 'install').last.state,
        'COMMITTED',
      );
      if (['crash-before-commit', 'crash-after-commit'].includes(mode)) {
        const directory = join(
          f.rootPath,
          'transactions',
          upgrade.last.transactionId,
        );
        const residue = readdirSync(directory).filter((n) =>
          n.startsWith('next-'),
        );
        assert.equal(
          residue.length,
          1,
          'crash residue is retained, not ignored as acceptance',
        );
        assert.equal(
          JSON.parse(readFileSync(join(directory, residue[0]))).record.state,
          'COMMITTED',
        );
        if (mode === 'crash-after-commit')
          assert.equal(lstatSync(join(directory, '000004.json')).nlink, 2);
      }
      // No automatic rollback, terminal fabrication or replay after uncertain commit.
      const retry = spawnSync(
        process.execPath,
        [
          '--experimental-vm-modules',
          'tools/g7-owned-cli.mjs',
          'upgrade',
          f.rootPath,
          f.input,
          join(f.dir, 'target.json'),
        ],
        { encoding: 'utf8', timeout: 5000 },
      );
      assert.equal(retry.status, 1);
      assert.equal(JSON.parse(retry.stderr).status, 'NEEDS_OPERATOR');
      assert.deepEqual(
        JSON.parse(readFileSync(join(f.rootPath, 'accepted.json'))),
        accepted,
      );
    },
  );
for (const [mode, budget] of [
  ['block-cleanup', 30000],
  ['block-activation', 30000],
  ['block-maintenance', 300000],
])
  test(
    'independent watchdog contains synchronous ' + mode + ' at real deadline',
    { timeout: budget + 20000 },
    async (t) => {
      const f = await setup(t, mode, mode === 'block-activation');
      await wait(
        () =>
          existsSync(join(f.dir, 'events.jsonl')) &&
          readFileSync(join(f.dir, 'events.jsonl'), 'utf8').includes(
            'blocked-',
          ),
      );
      const start = performance.now();
      excluded(f);
      await wait(() => f.child.signalCode !== null, budget + 5000);
      const elapsed = performance.now() - start;
      assert.equal(f.child.signalCode, 'SIGKILL');
      assert(
        elapsed >= budget - 1000 && elapsed < budget + 5000,
        String(elapsed),
      );
      assert(!f.output().includes('"status":"STOPPED"'));
      excluded(f);
    },
  );
