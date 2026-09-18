import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  readdirSync,
  readlinkSync,
  rmSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { connect, createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { canonical, rawDigest } from '@alica/acap-contracts';
import { CellPreparation, cellSchema } from '../../tools/g7-cell.mjs';
import { adminRequest } from '../../tools/g7-admin.mjs';
import { cellFixture } from './cell-fixture.mjs';
const evidence = process.env.G7_ADMIN_EVIDENCE;
async function waitFor(fn, ms = 15000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    const value = await fn();
    if (value) return value;
    await delay(10);
  }
  throw new Error('condition deadline');
}
function value(f, version = 2, operation = 'status', extra = {}) {
  return {
    schemaVersion: `alica.cell-admin-request/v${version}`,
    requestId: 'admin-test',
    incarnation: f.incarnation,
    expectedSequence: 1,
    operation,
    ...extra,
  };
}
function frame(body) {
  body = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const h = Buffer.alloc(4);
  h.writeUInt32BE(body.length);
  return Buffer.concat([h, body]);
}
async function opened(f, version = 2) {
  const socket = connect(
    join(f.root, 'supervision', version === 1 ? 'admin.sock' : 'admin-v2.sock'),
  );
  let bytes = Buffer.alloc(0);
  const result = new Promise((resolveResult, reject) => {
    socket.on('data', (b) => {
      bytes = Buffer.concat([bytes, b]);
    });
    socket.on('error', (e) => {
      if (e.code !== 'ECONNRESET' && e.code !== 'EPIPE') reject(e);
    });
    socket.on('close', () => resolveResult(bytes));
  });
  await once(socket, 'connect');
  return { socket, result, bytes: () => bytes };
}
async function wire(f, version, bytes) {
  const c = await opened(f, version);
  c.socket.end(bytes);
  return c.result;
}
const request = (f, version = 2, operation = 'status', extra = {}) =>
  adminRequest(f.root, version, value(f, version, operation, extra));
function children(f) {
  return readFileSync(
    `/proc/${f.supervisor.pid}/task/${f.supervisor.pid}/children`,
    'utf8',
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);
}
function excluded(f) {
  assert.throws(() => new CellPreparation(f.root), { code: 'CONFLICT' });
  const r = spawnSync('python3', [
    '-c',
    'import os,fcntl,sys\nf=os.open(sys.argv[1],os.O_RDONLY|os.O_DIRECTORY)\ntry: fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept BlockingIOError: sys.exit(0)\nsys.exit(1)',
    f.root,
  ]);
  assert.equal(r.status, 0);
}
function preserve(f, label) {
  if (!evidence) return;
  const dest = join(evidence, f.id, label);
  mkdirSync(dest, { recursive: true });
  for (const file of [
    'accepted.json',
    'identity.json',
    'floor.json',
    'supervision/incarnation.json',
  ]) {
    if (existsSync(join(f.root, file))) {
      mkdirSync(join(dest, file, '..'), { recursive: true });
      copyFileSync(join(f.root, file), join(dest, file));
    }
  }
  const hashes = {};
  for (const file of readdirSync(f.root, { recursive: true })) {
    const path = join(f.root, file);
    if (statSync(path).isFile()) {
      hashes[file] = rawDigest(readFileSync(path));
      if (
        file.startsWith('transactions/') ||
        file.split('/').at(-1).startsWith('next-')
      ) {
        mkdirSync(join(dest, file, '..'), { recursive: true });
        copyFileSync(path, join(dest, file));
      }
    }
  }
  writeFileSync(join(dest, 'hashes.json'), JSON.stringify(hashes, null, 2));
}
async function setup(t, env = {}, ready = true) {
  const dir = mkdtempSync(join(tmpdir(), 'g7-admin-')),
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
  const marker = join(dir, 'boundary.json');
  const supervisor = spawn(
    'python3',
    ['tools/g7-supervisor.py', process.execPath, root, input],
    {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, G7_ADMIN_MARKER: marker, ...env },
    },
  );
  let stderr = '';
  supervisor.stderr.on('data', (b) => {
    stderr += b;
  });
  const out = {
    ...f,
    root,
    dir,
    input,
    marker,
    supervisor,
    id: dir.split('/').at(-1),
  };
  t.after(async () => {
    preserve(out, 'final');
    if (evidence) writeFileSync(join(evidence, out.id, 'stderr.log'), stderr);
    if (supervisor.exitCode === null && supervisor.signalCode === null) {
      const exited = once(supervisor, 'exit');
      process.kill(-supervisor.pid, 'SIGKILL');
      await exited;
    }
    // Failed fixture originals remain at their logged absolute path, never deleted.
    if (t.passed) rmSync(dir, { recursive: true, force: true });
    else console.log('retained fixture:', dir);
  });
  await waitFor(() => existsSync(join(root, 'supervision/admin-v2.sock')));
  out.incarnation = JSON.parse(
    readFileSync(join(root, 'supervision/incarnation.json')),
  ).incarnation;
  if (ready)
    await waitFor(async () => {
      assert.equal(supervisor.exitCode, null, stderr);
      return (await request(out)).status === 'RUNNING';
    });
  return out;
}
function unknown(response) {
  assert.deepEqual(
    {
      sequence: response.sequence,
      acceptedDigest: response.acceptedDigest,
      status: response.status,
      code: response.code,
    },
    {
      sequence: null,
      acceptedDigest: null,
      status: 'NEEDS_OPERATOR',
      code: 'CLEANUP_UNCERTAIN',
    },
  );
}

test('A1+B1 schemas: closed v1, exact cloned request, constrained v2 pairs and strict client version', async () => {
  const schema = JSON.parse(
    readFileSync('docs/g7/draft/contracts.schema.json'),
  );
  const cloned = structuredClone(schema.$defs.adminRequest);
  cloned.properties.schemaVersion.const = 'alica.cell-admin-request/v2';
  assert.deepEqual(schema.$defs.adminRequestV2, cloned);
  const base = {
    schemaVersion: 'alica.cell-admin-response/v2',
    requestId: 'r',
    incarnation: 'i',
    sequence: 1,
    acceptedDigest: 'sha256:' + '1'.repeat(64),
    status: 'STOPPED',
    code: 'OK',
  };
  for (const pair of [
    [0, null],
    [1, base.acceptedDigest],
    [Number.MAX_SAFE_INTEGER, base.acceptedDigest],
    [null, null],
  ]) {
    const v = {
      ...base,
      sequence: pair[0],
      acceptedDigest: pair[1],
      ...(pair[0] === null
        ? { status: 'NEEDS_OPERATOR', code: 'CLEANUP_UNCERTAIN' }
        : {}),
    };
    cellSchema('adminResponseV2', v);
    for (const key of Object.keys(v)) {
      const missing = { ...v };
      delete missing[key];
      assert.throws(() => cellSchema('adminResponseV2', missing));
    }
    assert.throws(() => cellSchema('adminResponseV2', { ...v, extra: true }));
  }
  for (const [sequence, acceptedDigest] of [
    [0, base.acceptedDigest],
    [1, null],
    [null, base.acceptedDigest],
    [-1, null],
    [Number.MAX_SAFE_INTEGER + 1, base.acceptedDigest],
  ])
    assert.throws(() =>
      cellSchema('adminResponseV2', { ...base, sequence, acceptedDigest }),
    );
  for (const status of ['OK', 'RUNNING', 'STOPPED', 'FAILED'])
    assert.throws(() =>
      cellSchema('adminResponseV2', {
        ...base,
        sequence: null,
        acceptedDigest: null,
        status,
        code: 'CLEANUP_UNCERTAIN',
      }),
    );
  assert.throws(() =>
    cellSchema('adminResponse', {
      ...base,
      schemaVersion: 'alica.cell-admin-response/v1',
      sequence: null,
      acceptedDigest: null,
    }),
  );
});

test(
  'A1: every header/body split, coalesced/trailing frames, strict parser, exact ceiling, credentials/modes and wrong endpoints',
  { timeout: 60000 },
  async (t) => {
    const f = await setup(t);
    for (const name of ['admin.sock', 'admin-v2.sock']) {
      const s = statSync(join(f.root, 'supervision', name));
      assert.equal(s.mode & 0o777, 0o600);
      assert.equal(s.uid, process.getuid());
    }
    assert.equal(statSync(join(f.root, 'supervision')).mode & 0o777, 0o700);
    for (const endpoint of ['admin.sock', 'admin-v2.sock']) {
      const peer = spawnSync(
        'python3',
        [
          '-c',
          'import socket,struct,json,sys\ns=socket.socket(socket.AF_UNIX);s.connect(sys.argv[1]);print(json.dumps(struct.unpack("3i",s.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))))',
          join(f.root, 'supervision', endpoint),
        ],
        { encoding: 'utf8' },
      );
      assert.equal(peer.status, 0, peer.stderr);
      assert.deepEqual(JSON.parse(peer.stdout), [
        f.supervisor.pid,
        process.getuid(),
        process.getgid(),
      ]);
      console.log('actual SO_PEERCRED', endpoint, peer.stdout.trim());
    }
    const child = children(f);
    const normal = frame(value(f));
    for (let split = 1; split < normal.length; split++) {
      const c = await opened(f);
      c.socket.write(normal.subarray(0, split));
      await delay(1);
      c.socket.end(normal.subarray(split));
      const bytes = await c.result;
      assert.equal(bytes.readUInt32BE(), bytes.length - 4);
      assert.equal(JSON.parse(bytes.subarray(4)).code, 'OK');
    }
    for (const version of [1, 2]) {
      const v = value(f, version, 'stop'),
        text = JSON.stringify(v),
        valid = frame(v);
      const malformed = [
        Buffer.alloc(0),
        Buffer.alloc(3),
        Buffer.alloc(4),
        valid.subarray(0, -1),
        Buffer.concat([valid, valid]),
        Buffer.concat([valid, Buffer.from('x')]),
        frame(
          text.replace('"operation":', '"operation":"status","operation":'),
        ),
        frame({ ...v, extra: true }),
        frame(
          text.replace(
            '"expectedSequence":1',
            '"expectedSequence":9007199254740992',
          ),
        ),
        frame(text.replace('"expectedSequence":1', '"expectedSequence":1.5')),
        frame(text.replace('"expectedSequence":1', '"expectedSequence":NaN')),
        frame(text.replace('admin-test', '\\ud800')),
        frame(Buffer.from([0xff])),
        frame('['.repeat(34) + '0' + ']'.repeat(34)),
        frame(Buffer.alloc(65537, 32)),
        frame({
          ...v,
          schemaVersion: `alica.cell-admin-request/v${version === 1 ? 2 : 1}`,
        }),
      ];
      const unicode = JSON.stringify({ ...v, requestId: 'é' });
      malformed.push(frame(unicode));
      const wrongByteLength = frame(unicode);
      wrongByteLength.writeUInt32BE(unicode.length);
      malformed.push(wrongByteLength);
      for (const bytes of malformed)
        assert.equal((await wire(f, version, bytes)).length, 0);
      const denied = await wire(
        f,
        version,
        frame(value(f, version, 'stop', { incarnation: 'wrong' })),
      );
      assert.equal(JSON.parse(denied.subarray(4)).code, 'DENIED');
      assert.equal(
        (await request(f, version, 'stop', { expectedSequence: 0 })).code,
        'CONFLICT',
      );
      const padded = JSON.stringify(value(f, version));
      const max = frame(padded + ' '.repeat(65536 - Buffer.byteLength(padded)));
      const response = await wire(f, version, max);
      assert.equal(JSON.parse(response.subarray(4)).code, 'OK');
      // Multibyte body is byte-counted (and rejected by the ASCII request schema).
      const numeric = frame(
        JSON.stringify(value(f, version)).replace(
          '"expectedSequence":1',
          '"expectedSequence":1e0',
        ),
      );
      assert.equal(
        JSON.parse((await wire(f, version, numeric)).subarray(4)).code,
        'OK',
      );
    }
    assert.deepEqual(children(f), child);
    assert.equal((await request(f)).status, 'RUNNING');
    excluded(f);
    assert.equal((await request(f, 2, 'stop')).status, 'STOPPED');
  },
);

test(
  'A1: delayed trailing byte/second frame and unsealed start/stop have no pre-EOF effects',
  { timeout: 20000 },
  async (t) => {
    const f = await setup(t);
    for (const operation of ['stop', 'start']) {
      if (operation === 'start')
        assert.equal((await request(f, 1, 'stop')).status, 'STOPPED');
      const before = children(f),
        accepted = readFileSync(join(f.root, 'accepted.json'));
      for (const version of [1, 2])
        for (const trailing of [
          Buffer.from('x'),
          frame(value(f, version, operation)),
        ]) {
          const c = await opened(f, version);
          c.socket.write(frame(value(f, version, operation)));
          await delay(150);
          assert.equal(c.bytes().length, 0);
          assert.deepEqual(children(f), before);
          assert.equal(
            (await request(f)).status,
            operation === 'stop' ? 'RUNNING' : 'STOPPED',
          );
          c.socket.end(trailing);
          assert.equal((await c.result).length, 0);
          assert.deepEqual(children(f), before);
          assert.deepEqual(
            readFileSync(join(f.root, 'accepted.json')),
            accepted,
          );
        }
    }
    assert.equal((await request(f, 2, 'start')).status, 'RUNNING');
    assert.equal((await request(f, 2, 'stop')).status, 'STOPPED');
  },
);

test(
  'A1: aggregate eight admitted sockets, actual 30000ms absolute unsealed mutation deadlines; bytes/EOF never reset',
  { timeout: 45000 },
  async (t) => {
    const f = await setup(t);
    const owner = children(f);
    const sockets = [];
    for (let i = 0; i < 8; i++) {
      const start = performance.now(),
        c = await opened(f, (i % 2) + 1);
      sockets.push({ ...c, start });
      // Alternate full unsealed stop and slow incomplete status.
      c.socket.write(
        i % 2 === 0
          ? frame(value(f, 1, 'stop'))
          : frame(value(f, 2)).subarray(0, 1),
      );
    }
    await delay(100);
    for (const v of [1, 2])
      assert.equal((await wire(f, v, frame(value(f, v, 'stop')))).length, 0);
    await delay(15000);
    for (let i = 1; i < 8; i += 2)
      sockets[i].socket.write(frame(value(f, 2)).subarray(1, 2));
    assert.deepEqual(children(f), owner);
    for (const c of sockets) assert.equal(c.bytes().length, 0);
    const elapsed = await Promise.all(
      sockets.map(async (c) => {
        const result = await c.result;
        assert.equal(result.length, 0);
        return performance.now() - c.start;
      }),
    );
    for (const ms of elapsed) {
      assert.ok(ms >= 30000, `closed prematurely ${ms}`);
      assert.ok(ms < 34000, `budget reset ${ms}`);
    }
    console.log('actual admission deadline observations ms:', elapsed);
    assert.deepEqual(children(f), owner);
    excluded(f);
    // Grant expiry is not owner termination. Clean stop still needs actual shutdown/reap.
    assert.equal((await request(f, 2, 'stop')).status, 'STOPPED');
    assert.deepEqual(children(f), []);
  },
);

test(
  'A1+B1: one mutation slot across endpoints; dispatched disconnect does not cancel; actual forced cleanup deadline retains custody',
  { timeout: 45000 },
  async (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'g7-admin-cleanup-')),
      fifo = join(directory, 'block');
    assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const f = await setup(t, {
      NODE_OPTIONS: '--import=' + resolve('tests/g7/supervision-block.mjs'),
      G7_TEST_FIFO: fifo,
    });
    const original = readFileSync(join(f.root, 'accepted.json'));
    preserve(f, 'original');
    const c = await opened(f, 1),
      started = performance.now();
    c.socket.end(frame(value(f, 1, 'stop')));
    await waitFor(() => existsSync(fifo + '.entered'));
    const owner = Number(readFileSync(fifo + '.entered'));
    assert.deepEqual(children(f), [owner]);
    assert.equal((await request(f, 2, 'start')).code, 'CONFLICT');
    assert.equal((await request(f, 2, 'stop')).code, 'CONFLICT');
    c.socket.destroy();
    await c.result;
    assert.equal((await request(f, 2, 'start')).code, 'CONFLICT');
    excluded(f);
    const holder = spawn(
      'python3',
      [
        '-u',
        '-c',
        'import os,select,sys\nf=os.pidfd_open(int(sys.argv[1]));print("HELD",flush=True)\nassert select.select([f],[],[],35)[0], "cleanup did not terminate owner"\nprint("EXIT",flush=True)\nos.close(f)',
        String(owner),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let receipts = '',
      errors = '';
    holder.stdout.on('data', (b) => {
      receipts += b;
    });
    holder.stderr.on('data', (b) => {
      errors += b;
    });
    t.after(() => {
      if (holder.exitCode === null) holder.kill('SIGKILL');
    });
    await waitFor(() => receipts.includes('HELD'));
    await delay(15000);
    assert.equal((await request(f, 2, 'start')).code, 'CONFLICT');
    assert.deepEqual(children(f), [owner]);
    const [code] = await once(holder, 'exit');
    assert.equal(code, 0, errors);
    assert.ok(receipts.includes('EXIT'));
    const elapsed = performance.now() - started;
    assert.ok(elapsed >= 30000, String(elapsed));
    assert.ok(elapsed < 34000, String(elapsed));
    console.log(
      'actual forced cleanup deadline ms:',
      elapsed,
      'pidfd:',
      receipts.trim(),
    );
    await waitFor(() => children(f).length === 0);
    const status = await request(f);
    assert.equal(status.status, 'NEEDS_OPERATOR');
    assert.equal(status.code, 'CLEANUP_UNCERTAIN');
    assert.equal(status.sequence, 1);
    assert.equal((await request(f, 2, 'start')).code, 'DENIED');
    assert.equal((await request(f, 1, 'start')).code, 'DENIED');
    assert.deepEqual(children(f), []);
    excluded(f);
    assert.deepEqual(readFileSync(join(f.root, 'accepted.json')), original);
  },
);

test(
  'A1: late EOF does not reset admission deadline or cancel an already dispatched stop',
  { timeout: 45000 },
  async (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'g7-admin-eof-')),
      fifo = join(directory, 'block');
    assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const f = await setup(t, {
      NODE_OPTIONS: '--import=' + resolve('tests/g7/supervision-block.mjs'),
      G7_TEST_FIFO: fifo,
    });
    const admitted = performance.now(),
      c = await opened(f, 2),
      owner = children(f);
    c.socket.write(frame(value(f, 2, 'stop')));
    await delay(5000);
    assert.equal(existsSync(fifo + '.entered'), false);
    assert.deepEqual(children(f), owner);
    assert.equal(c.bytes().length, 0);
    const dispatched = performance.now();
    c.socket.end();
    await waitFor(() => existsSync(fifo + '.entered'));
    assert.equal((await request(f, 1, 'start')).code, 'CONFLICT');
    assert.equal((await c.result).length, 0);
    const elapsed = performance.now() - admitted;
    assert.ok(elapsed >= 30000, String(elapsed));
    assert.ok(elapsed < 34000, `EOF reset admission: ${elapsed}`);
    assert.deepEqual(children(f), owner);
    excluded(f);
    assert.equal((await request(f, 1, 'start')).code, 'CONFLICT');
    const receipt = spawnSync(
      'python3',
      [
        '-c',
        'import os,select,sys\nf=os.pidfd_open(int(sys.argv[1]));assert select.select([f],[],[],8)[0];os.close(f)',
        String(owner[0]),
      ],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(receipt.status, 0, receipt.stderr);
    assert.ok(performance.now() - dispatched >= 30000);
    await waitFor(() => children(f).length === 0);
    assert.equal((await request(f)).code, 'CLEANUP_UNCERTAIN');
    assert.equal((await request(f, 2, 'start')).code, 'DENIED');
    excluded(f);
    console.log(
      'late EOF admission deadline ms:',
      elapsed,
      'cleanup ms:',
      performance.now() - dispatched,
    );
  },
);

for (const prior of [false, true])
  for (const boundary of [
    'after-file-fsync',
    'before-rename',
    'after-rename',
    'before-directory-fsync',
    'after-directory-fsync',
  ]) {
    test(
      `B1: held pidfd, stopped/killed actual accepted ${boundary}, ${prior ? 'prior bytes successor fault' : 'first publication'}`,
      { timeout: 25000 },
      async (t) => {
        const f = await setup(
          t,
          {
            NODE_OPTIONS: '--import=' + resolve('tests/g7/admin-boundary.mjs'),
            G7_ADMIN_BOUNDARY: boundary,
            G7_ADMIN_PRIOR: prior ? '1' : '0',
          },
          prior,
        );
        let pending, original;
        if (prior) {
          original = readFileSync(join(f.root, 'accepted.json'));
          preserve(f, 'original');
          assert.equal((await request(f, 1, 'stop')).status, 'STOPPED');
          pending = request(f, 2, 'start');
        }
        await waitFor(() => existsSync(f.marker));
        const marker = JSON.parse(readFileSync(f.marker));
        assert.equal(marker.boundary, boundary);
        const preRename = ['after-file-fsync', 'before-rename'].includes(
          boundary,
        );
        if (!prior)
          assert.equal(existsSync(join(f.root, 'accepted.json')), !preRename);
        if (preRename) {
          const temporary = readdirSync(f.root).filter((name) =>
            name.startsWith('next-'),
          );
          assert.equal(temporary.length, 1);
          cellSchema(
            'accepted',
            JSON.parse(readFileSync(join(f.root, temporary[0]))),
          );
          if (prior)
            assert.deepEqual(
              readFileSync(join(f.root, temporary[0])),
              original,
            );
        }
        await waitFor(() =>
          /^State:\s+T/m.test(
            readFileSync(`/proc/${marker.pid}/status`, 'utf8'),
          ),
        );
        const holder = spawn(
          'python3',
          [
            '-u',
            '-c',
            'import os,signal,select,sys\nf=os.pidfd_open(int(sys.argv[1]));print("HELD",flush=True)\nassert sys.stdin.readline().strip()=="KILL"\nsignal.pidfd_send_signal(f,signal.SIGKILL)\nassert select.select([f],[],[],5)[0], "no pidfd exit"\nprint("EXIT",flush=True)\nos.close(f)',
            String(marker.pid),
          ],
          { stdio: ['pipe', 'pipe', 'pipe'] },
        );
        t.after(() => {
          if (holder.exitCode === null) holder.kill('SIGKILL');
        });
        let receipts = '',
          errors = '';
        holder.stdout.on('data', (b) => {
          receipts += b;
        });
        holder.stderr.on('data', (b) => {
          errors += b;
        });
        await waitFor(() => receipts.includes('HELD'));
        assert.ok(
          readdirSync(`/proc/${f.supervisor.pid}/fd`).some((fd) => {
            try {
              return (
                readlinkSync(`/proc/${f.supervisor.pid}/fd/${fd}`) ===
                'anon_inode:[pidfd]'
              );
            } catch {
              return false;
            }
          }),
        );
        const start = performance.now();
        unknown(await request(f));
        assert.ok(
          performance.now() - start < 2000,
          'custodian blocked on storage',
        );
        unknown(await request(f, 2, 'start'));
        excluded(f);
        preserve(f, 'stopped-at-boundary');
        holder.stdin.end('KILL\n');
        await waitFor(() => receipts.includes('EXIT'));
        const exit =
          holder.exitCode === null
            ? await once(holder, 'exit')
            : [holder.exitCode];
        assert.equal(exit[0], 0, errors);
        await waitFor(() => children(f).length === 0);
        if (pending) unknown(await pending);
        unknown(await request(f));
        unknown(await request(f, 2, 'start'));
        assert.equal((await wire(f, 1, frame(value(f, 1)))).length, 0);
        if (prior)
          assert.deepEqual(
            readFileSync(join(f.root, 'accepted.json')),
            original,
          );
        const before = existsSync(join(f.root, 'accepted.json'))
          ? readFileSync(join(f.root, 'accepted.json'))
          : null;
        // Readable bytes and repeated requests do not revoke the sticky fence.
        for (let i = 0; i < 3; i++) unknown(await request(f, 2, 'start'));
        assert.deepEqual(children(f), []);
        excluded(f);
        assert.deepEqual(
          existsSync(join(f.root, 'accepted.json'))
            ? readFileSync(join(f.root, 'accepted.json'))
            : null,
          before,
        );
        console.log(
          'pidfd receipts:',
          receipts.trim(),
          'boundary:',
          marker,
          'prior:',
          prior,
        );
      },
    );
  }

test(
  'B1: owner death before readiness returns unknown on v2, close on v1, no publication or restart',
  { timeout: 15000 },
  async (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'g7-admin-early-')),
      fifo = join(directory, 'block');
    assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const f = await setup(
      t,
      {
        NODE_OPTIONS: '--import=' + resolve('tests/g7/supervision-block.mjs'),
        G7_TEST_FIFO: fifo,
        G7_TEST_PHASE: 'activation',
      },
      false,
    );
    await waitFor(() => existsSync(fifo + '.entered'));
    const owner = Number(readFileSync(fifo + '.entered'));
    assert.equal(existsSync(join(f.root, 'accepted.json')), false);
    unknown(await request(f));
    excluded(f);
    const killed = spawnSync(
      'python3',
      [
        '-c',
        'import os,signal,select,sys\nf=os.pidfd_open(int(sys.argv[1]));signal.pidfd_send_signal(f,signal.SIGKILL);assert select.select([f],[],[],5)[0];os.close(f)',
        String(owner),
      ],
      { encoding: 'utf8', timeout: 7000 },
    );
    assert.equal(killed.status, 0, killed.stderr);
    await waitFor(() => children(f).length === 0);
    unknown(await request(f));
    unknown(await request(f, 2, 'start'));
    assert.equal((await wire(f, 1, frame(value(f, 1)))).length, 0);
    assert.equal(existsSync(join(f.root, 'accepted.json')), false);
    excluded(f);
  },
);

for (const corrupt of [false, true])
  test(
    `B1: successor ${corrupt ? 'corrupt' : 'missing'} accepted data preserves original, no stale response/replay`,
    { timeout: 20000 },
    async (t) => {
      const f = await setup(t);
      const path = join(f.root, 'accepted.json'),
        original = readFileSync(path);
      preserve(f, 'original');
      assert.equal((await request(f, 2, 'stop')).status, 'STOPPED');
      if (corrupt) writeFileSync(path, '{}');
      else rmSync(path);
      unknown(await request(f, 2, 'start'));
      await waitFor(() => children(f).length === 0);
      excluded(f);
      preserve(f, 'failed-validation');
      writeFileSync(path, original, { mode: 0o600 }); // Readable original is not restart authority.
      unknown(await request(f, 2, 'start'));
      assert.deepEqual(children(f), []);
      assert.equal((await wire(f, 1, frame(value(f, 1, 'start')))).length, 0);
    },
  );

test(
  'B1 client: rejects wrong version/binding, duplicate/trailing response and never connects fallback/replays',
  { timeout: 10000 },
  async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'g7-client-'));
    mkdirSync(join(root, 'supervision'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const f = { root, incarnation: 'inc' };
    let connections = 0,
      fallback = 0,
      mode = 0;
    const response = {
      schemaVersion: 'alica.cell-admin-response/v2',
      requestId: 'admin-test',
      incarnation: 'inc',
      sequence: null,
      acceptedDigest: null,
      status: 'NEEDS_OPERATOR',
      code: 'CLEANUP_UNCERTAIN',
    };
    const server = createServer({ allowHalfOpen: true }, (s) => {
      connections++;
      let bytes = Buffer.alloc(0);
      s.on('data', (b) => {
        bytes = Buffer.concat([bytes, b]);
      });
      s.on('end', () => {
        assert.equal(bytes.readUInt32BE(), bytes.length - 4);
        if (mode === 0)
          s.end(
            frame({
              ...response,
              schemaVersion: 'alica.cell-admin-response/v1',
            }),
          );
        if (mode === 1) s.end(frame({ ...response, requestId: 'wrong' }));
        if (mode === 2)
          s.end(Buffer.concat([frame(response), frame(response)]));
        if (mode === 3)
          s.end(
            frame(
              JSON.stringify(response).replace(
                '"sequence":null',
                '"sequence":0,"sequence":null',
              ),
            ),
          );
        if (mode === 4) s.end();
        if (mode === 5) s.end(frame(response));
      });
    });
    const old = createServer({ allowHalfOpen: true }, (s) => {
      fallback++;
      s.resume();
      s.on('end', () => s.end(frame(response)));
    });
    server.listen(join(root, 'supervision/admin-v2.sock'));
    old.listen(join(root, 'supervision/admin.sock'));
    await Promise.all([once(server, 'listening'), once(old, 'listening')]);
    t.after(() => {
      server.close();
      old.close();
    });
    for (; mode < 5; mode++)
      await assert.rejects(request(f, 2, 'start'), {
        outcome: 'UNKNOWN_OUTCOME',
      });
    unknown(await request(f, 2, 'start'));
    assert.equal(connections, 6);
    assert.equal(fallback, 0);
    await assert.rejects(request(f, 1, 'start'), {
      outcome: 'UNKNOWN_OUTCOME',
    });
    assert.equal(fallback, 1);
    assert.equal(connections, 6);
  },
);
