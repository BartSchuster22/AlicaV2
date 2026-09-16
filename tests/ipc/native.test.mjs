import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url),
  n = require('../../native/g6/build/bridge.node');
const root = path.resolve(import.meta.dirname, '../..');
const encode = (value) => {
  const b = Buffer.from(JSON.stringify(value)),
    h = Buffer.alloc(4);
  h.writeUInt32BE(b.length);
  return Buffer.concat([h, b]);
};
async function until(fn, ms = 3000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    const v = fn();
    if (v) return v;
    await delay(2);
  }
  throw Error('native fixture timeout');
}
async function receive(fd) {
  let b = Buffer.alloc(0);
  return until(() => {
    const x = n.read(fd, 65536);
    if (x?.length) b = Buffer.concat([b, x]);
    if (b.length >= 4 && b.length === b.readUInt32BE() + 4)
      return JSON.parse(b.subarray(4));
    return null;
  });
}

test('owned descriptors close exactly once and do not follow FD reuse', () => {
  const before = n.managed();
  const [a, b] = n.pair(1);
  n.close(a);
  n.close(a);
  const [c, d] = n.pair(1);
  assert.throws(() => n.write(a, Buffer.from('stale')), /closed/);
  n.write(c, Buffer.from('live'));
  assert.equal(n.read(d, 16).toString(), 'live');
  for (const f of [b, c, d]) n.close(f);
  assert.equal(n.managed(), before);
  assert.throws(() => n.close({}));
});
test('sealed capsule resists write and close leaves no owned FD', () => {
  const before = n.managed(),
    f = n.memfd(Buffer.from('sealed'));
  assert.equal(fs.readFileSync(n.fileno(f), 'utf8'), 'sealed');
  assert.throws(() => fs.writeSync(n.fileno(f), Buffer.from('x'), 0, 1, 0));
  n.close(f);
  assert.equal(n.managed(), before);
});
test('native atomic carrier preserves payload and unique endpoint; closure releases all handles', () => {
  const before = n.managed(),
    [a, b] = n.pair(5),
    [c, d] = n.pair(1);
  const body = encode({ contextId: 'fixture' });
  assert.equal(n.sendOffer(a, body, d), body.length);
  n.close(d);
  const received = n.receiveOffer(b);
  assert.deepEqual(received.data, body);
  n.write(c, Buffer.from('bound'));
  assert.equal(n.read(received.handle, 20).toString(), 'bound');
  for (const f of [a, b, c, received.handle]) n.close(f);
  assert.equal(n.managed(), before);
});
test('native receive rejects a packet without ancillary rights', () => {
  const before = n.managed(),
    [a, b] = n.pair(5);
  n.write(a, Buffer.from('bad'));
  assert.throws(() => n.receiveOffer(b), /rejected ancillary/);
  n.close(a);
  n.close(b);
  assert.equal(n.managed(), before);
});

for (const mode of ['file', 'extra', 'truncated', 'oversize']) {
  test('native rejection closes received kernel FDs: ' + mode, async () => {
    const before = n.managed();
    const [a, b] = n.pair(5);
    const child = spawn(
      '/usr/bin/python3',
      [path.join(root, 'tests/ipc/native-malformed.py'), mode],
      { stdio: ['ignore', 'ignore', 'ignore', n.fileno(a)] },
    );
    const done = once(child, 'close');
    let seen = false;
    try {
      const code = await done;
      assert.equal(code[0], 0);
      const rawBefore = fs.readdirSync('/proc/self/fd').length;
      await until(() => {
        try {
          const v = n.receiveOffer(b);
          if (v) {
            n.close(v.handle);
            assert.fail('accepted malformed ancillary');
          }
        } catch (error) {
          assert.match(error.message, /rejected ancillary/);
          seen = true;
          return true;
        }
        return false;
      });
      assert.equal(fs.readdirSync('/proc/self/fd').length, rawBefore);
      assert.equal(seen, true);
    } finally {
      n.close(a);
      n.close(b);
      assert.equal(n.managed(), before);
    }
  });
}
test('disconnected socket write fails without SIGPIPE termination', () => {
  const [a, b] = n.pair(1);
  n.close(b);
  assert.throws(() => n.write(a, Buffer.from('closed')));
  n.close(a);
});

async function launched(mode, action) {
  const before = n.managed(),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g6-native-')),
    pub = path.join(dir, 'public');
  fs.mkdirSync(pub, { mode: 0o700 });
  fs.writeFileSync(path.join(pub, 'allowed'), 'public fixture');
  fs.writeFileSync(path.join(dir, 'outside'), 'synthetic outside');
  fs.symlinkSync(path.join(dir, 'outside'), path.join(pub, 'escape'));
  const socketPath = path.join(dir, 'control'),
    listener = n.listen(socketPath),
    [carrier, childCarrier] = n.pair(5),
    challenge = n.memfd(Buffer.from('synthetic-launch-challenge'));
  const payload = n.memfd(
    Buffer.from(
      JSON.stringify({
        mode,
        readPaths: [pub],
        allowed: path.join(pub, 'allowed'),
        outside: path.join(dir, 'outside'),
        symlink: path.join(pub, 'escape'),
      }),
    ),
  );
  const child = spawn(
    path.join(root, 'native/g6/build/launcher'),
    [
      process.execPath,
      path.join(root, 'tests/ipc/native-worker.mjs'),
      socketPath,
      ...new Set(
        [
          path.dirname(process.execPath),
          path.join(root, 'native/g6/build'),
          path.join(root, 'tests/ipc'),
          path.join(root, 'package.json'),
          '/usr/lib',
          '/lib',
          '/lib64',
          '/dev/null',
          pub,
        ].map((p) => fs.realpathSync(p)),
      ),
    ],
    {
      env: { G6_PARENT_ONLY: 'synthetic-not-a-secret' },
      stdio: [
        'ignore',
        'ignore',
        'pipe',
        'ignore',
        n.fileno(challenge),
        n.fileno(payload),
        n.fileno(childCarrier),
      ],
    },
  );
  let peer, pidfd;
  let diagnostic = '';
  child.stderr.on('data', (b) => {
    diagnostic = (diagnostic + b.toString()).slice(-4096);
  });
  const exited = once(child, 'exit');
  try {
    pidfd = n.pidfdOpen(child.pid);
    peer = await until(() => n.accept(listener));
    const cred = n.credentials(peer);
    assert.equal(cred.pid, child.pid);
    assert.equal(cred.uid, process.getuid());
    assert.equal(cred.gid, process.getgid());
    assert.notEqual(cred.pid, process.pid);
    const ready = await Promise.race([
      receive(peer),
      exited.then(([code, signal]) => {
        throw Error(
          'fixture exited ' + JSON.stringify({ code, signal, diagnostic }),
        );
      }),
    ]);
    assert.equal(ready.kind, 'native-ready', JSON.stringify(ready));
    assert.equal(ready.pid, child.pid);
    assert.equal(ready.challenge, 'synthetic-launch-challenge');
    assert.equal(ready.inheritedSentinel, false);
    assert.ok(ready.abi >= 3);
    await action({ child, ready, carrier, pidfd, exited });
    assert.equal(
      fs.readFileSync(path.join(dir, 'outside'), 'utf8'),
      'synthetic outside',
    );
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      if (pidfd) n.signal(pidfd, 9);
      else child.kill('SIGKILL');
    }
    await exited;
    for (const f of [
      peer,
      pidfd,
      listener,
      carrier,
      childCarrier,
      challenge,
      payload,
    ])
      if (f) n.close(f);
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(n.managed(), before);
  }
}
test(
  'actual launched PID plus final Node sandbox: reads, writes, symlinks, socket/exec/inspection/signal denial',
  { timeout: 15000 },
  async () => {
    await launched('confinement', async ({ ready, exited }) => {
      for (const key of [
        'allowedRead',
        'outsideRead',
        'outsideAsyncRead',
        'outsideAsyncWrite',
        'writeDenied',
        'symlinkDenied',
        'networkSocketDenied',
        'processInspectionDenied',
        'crossProcessSignalDenied',
        'execDenied',
      ])
        assert.equal(ready[key], true, key);
      const [code, signal] = await exited;
      assert.equal(code, 0);
      assert.equal(signal, null);
    });
  },
);
test(
  'post-seal FD handover supports two overlapping contexts with one shared state',
  { timeout: 15000 },
  async () => {
    await launched('contexts', async ({ carrier, exited }) => {
      const own = [];
      try {
        for (const contextId of ['a', 'b']) {
          const [local, remote] = n.pair(1);
          own.push(local);
          n.sendOffer(carrier, encode({ contextId }), remote);
          n.close(remote);
        }
        n.write(own[0], encode({ contextId: 'a' }));
        n.write(own[1], encode({ contextId: 'b' }));
        const replies = await Promise.all(own.map(receive));
        assert.deepEqual(replies, [
          { contextId: 'a', count: 1 },
          { contextId: 'b', count: 2 },
        ]);
        assert.equal((await exited)[0], 0);
      } finally {
        own.forEach((f) => n.close(f));
      }
    });
  },
);
test(
  'pidfd terminates and observes an uncooperative sealed Node process',
  { timeout: 15000 },
  async () => {
    await launched('spin', async ({ pidfd, exited }) => {
      const start = performance.now();
      n.signal(pidfd, 9);
      const [code, signal] = await exited;
      assert.equal(code, null);
      assert.equal(signal, 'SIGKILL');
      assert.ok(n.poll([pidfd], 0)[0]);
      assert.ok(performance.now() - start < 1000);
    });
  },
);
