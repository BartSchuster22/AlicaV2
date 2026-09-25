// SOURCE-ONLY candidate: UNEXECUTED. Synthetic stream ordering, not native proof.
// Future separately authorized run: node --experimental-vm-modules --test THIS_FILE
// Loads each real module verbatim; mocks never spawn, perform crypto or publish files.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

// Public all-zero bytes encoded as Bech32; no secret key or cryptography.
function recipientFixture() {
  const values = Array(52).fill(0);
  let p = 1;
  for (const v of [3, 3, 3, 0, 1, 7, 5, ...values, 0, 0, 0, 0, 0, 0]) {
    const top = p >>> 25;
    p = ((p & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++)
      if ((top >>> i) & 1)
        p ^= [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3][i];
  }
  p ^= 1;
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  return 'age1' + 'q'.repeat(52) + Array.from({ length: 6 }, (_, i) =>
    alphabet[(p >>> (5 * (5 - i))) & 31]).join('');
}
const turn = () => new Promise((resolve) => setImmediate(resolve));
const AGE = 'sha256:eb7dd1b518f0a307c99cd97782623c5321da049154b04acd2d98d21aa7bc9b2c';

for (const transport of ['backup', 'restore']) {
  for (const first of ['stdout', 'stdin']) {
    for (const order of ['feed-before-close', 'close-before-feed']) {
      test(`${transport}: ${first} first, ${order}`, { timeout: 2000 }, async () => {
        const child = new EventEmitter();
        child.stdin = new EventEmitter();
        child.stdout = new EventEmitter();
        const kills = [], links = [], unlinks = [], synced = [], closed = [];
        let callback, spawned = 0, certified = 0, inspected = 0, output;
        let fd = 10;
        const files = new Map();
        child.kill = function (signal) {
          assert.equal(this, child);
          kills.push(signal);
          return true; // Deliberately NOT a close event or a reap claim.
        };
        child.stdin.write = (_bytes, done) => {
          assert.equal(callback, undefined);
          callback = done; // Hold feeder settlement independently of close.
          return true;
        };
        child.stdin.end = () => {};
        const fs = {
          constants: { O_RDONLY: 0, O_NOFOLLOW: 1, O_NONBLOCK: 2,
            O_WRONLY: 4, O_CREAT: 8, O_EXCL: 16 },
          openSync(name) {
            const n = fd++;
            files.set(n, name);
            if (name.endsWith('.partial')) output = n;
            return n;
          },
          closeSync: (n) => closed.push(n),
          fstatSync: () => ({ isFile: () => true, size: 1, mode: 0o600,
            uid: 123, nlink: 1, mtimeMs: 0, ctimeMs: 0 }),
          readFileSync: (n) => files.get(n).endsWith('/identity')
            ? 'AGE-SECRET-KEY-1TEST\n' : Buffer.from('mock executable'),
          readSync: (_n, buffer, offset, length) => {
            buffer.fill(1, offset, offset + length);
            return length;
          },
          writeSync: (_n, _b, _o, length) => length,
          fsyncSync: (n) => synced.push(n),
          linkSync: (...args) => links.push(args),
          unlinkSync: (name) => unlinks.push(name),
          statfsSync: () => ({ bavail: 2 ** 32, bsize: 1 }),
        };
        const timer = {};
        let cleared = false;
        const context = createContext({ Buffer, process: { getuid: () => 123 },
          setTimeout: () => timer,
          clearTimeout: (t) => { assert.equal(t, timer); cleared = true; } });
        const mocks = {
          'node:child_process': { spawn: () => { spawned++; return child; } },
          'node:fs': fs,
          'node:path': { dirname: path.dirname, basename: path.basename, resolve: path.resolve },
          'node:crypto': { createHash: () => ({ update() { return this; }, digest: () => 'fixture' }) },
          '@alica/acap-contracts': {
            check: (ok, code) => { if (!ok) throw new Error(code); },
            rawDigest: () => AGE,
          },
          './g7-durable.mjs': { openPrivateRoot: () => fd++, listPrivate: () => [] },
          './g7-archive.mjs': {
            LIMITS: { fileBytes: 2 ** 28, entries: 4096, tarBytes: 2 ** 30, timeoutMs: 300000 },
            safePath: () => {}, tarHeader: () => Buffer.alloc(512),
            openArchive: () => { inspected++; throw new Error('Unexpected archive parsing'); },
          },
        };
        const url = new URL(`../../tools/g7-${transport}.mjs`, import.meta.url);
        const module = new SourceTextModule(readFileSync(url, 'utf8'), { context, identifier: url.href });
        await module.link((specifier) => {
          assert.ok(Object.hasOwn(mocks, specifier), `Unexpected import ${specifier}`);
          const exports = mocks[specifier];
          return new SyntheticModule(Object.keys(exports), function () {
            for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
          }, { context });
        });
        await module.evaluate();
        const certify = () => { certified++; };
        const pending = transport === 'backup'
          ? module.namespace.encryptBackup([['fixture', Buffer.from('x')]],
            { age: '/age', recipient: recipientFixture(), destination: '/destination' }, certify)
          : module.namespace.stageBackupTransport(
            { age: '/age', cipher: '/cipher', identity: '/identity', destination: '/destination' },
            'sha256:fixture', certify, () => { inspected++; });
        let settled = false, rejection, succeeded = false;
        const observed = pending.then(() => { settled = true; succeeded = true; },
          (error) => { settled = true; rejection = error; });
        assert.equal(spawned, 1);
        assert.equal(typeof callback, 'function');
        assert.notEqual(output, undefined);
        child.stdout.emit('data', Buffer.from('unpublished partial'));
        const original = new Error(`${first} original`);
        assert.doesNotThrow(() => child[first].emit('error', original));
        assert.doesNotThrow(() => child.stdout.emit('error', new Error('later stdout')));
        assert.doesNotThrow(() => child.emit('error', new Error('later child')));
        assert.ok(kills.length >= 1);
        assert.ok(kills.every((signal) => signal === 'SIGKILL'));
        const unpublished = () => {
          assert.deepEqual(links, []);
          assert.deepEqual(unlinks, []); // Existing retained-partial policy.
          assert.deepEqual(synced, []);
          assert.equal(certified, 1);
          assert.equal(inspected, 0);
        };
        child.emit('exit', 0, null); // Exit alone must not settle the transport.
        await turn();
        assert.equal(settled, false);
        assert.equal(closed.includes(output), false);
        unpublished();
        const finishFeed = () => callback(new Error('later feeder callback'));
        const finishClose = () => child.emit('close', 0, null); // Even successful close cannot erase failure.
        (order === 'feed-before-close' ? finishFeed : finishClose)();
        await turn();
        assert.equal(settled, false);
        assert.equal(closed.includes(output), false);
        unpublished();
        (order === 'feed-before-close' ? finishClose : finishFeed)();
        await observed;
        assert.equal(succeeded, false);
        assert.equal(rejection, original);
        assert.equal(closed.includes(output), true);
        assert.equal(cleared, true);
        unpublished();
      });
    }
  }
}
