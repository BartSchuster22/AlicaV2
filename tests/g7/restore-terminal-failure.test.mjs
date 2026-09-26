// Real restore source; synthetic producer, filesystem, crypto and authority.
// No age execution, native addon, Cell lifecycle or cryptographic qualification.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

const turn = () => new Promise((resolve) => setImmediate(resolve));
const AGE = 'sha256:eb7dd1b518f0a307c99cd97782623c5321da049154b04acd2d98d21aa7bc9b2c';
for (const fault of ['success', 'monitor', 'write', 'stdout', 'stdin', 'child', 'timeout']) {
  test(`restore buffered output after ${fault}`, { timeout: 2000 }, async () => {
    const child = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdout = new EventEmitter();
    const writes = [], kills = [], links = [], unlinks = [], synced = [], closed = [];
    const original = new Error(fault);
    const files = new Map();
    let next = 10, feed, timerCallback, output, monitorCalls = 0;
    let certified = 0, parsed = 0, inspected = 0, archiveClosed = 0, cleared = false;
    let failMonitor = false, failWrite = false;
    child.kill = (signal) => { kills.push(signal); return true; };
    child.stdin.write = (_bytes, done) => { feed = done; return true; };
    child.stdin.end = () => {};
    const fs = {
      constants: { O_RDONLY: 0, O_NOFOLLOW: 1, O_NONBLOCK: 2,
        O_WRONLY: 4, O_CREAT: 8, O_EXCL: 16 },
      openSync(name) { const fd = next++; files.set(fd, name);
        if (name.endsWith('.partial')) output = fd; return fd; },
      closeSync: (fd) => closed.push(fd),
      fstatSync: () => ({ isFile: () => true, size: 1, mode: 0o600,
        uid: 123, nlink: 1, mtimeMs: 0, ctimeMs: 0 }),
      readFileSync: (fd) => files.get(fd).endsWith('/identity')
        ? 'AGE-SECRET-KEY-1TEST\n' : Buffer.from('mock executable'),
      readSync: (_fd, buffer, offset, length) => { buffer.fill(1, offset, offset + length); return length; },
      writeSync: (_fd, buffer, offset, length) => {
        if (failWrite) { failWrite = false; throw original; }
        // Exercise the real short-write loop rather than pretending one write always suffices.
        const n = Math.min(2, length);
        writes.push(Buffer.from(buffer.subarray(offset, offset + n))); return n;
      },
      fsyncSync: (fd) => synced.push(fd),
      linkSync: (...args) => links.push(args),
      unlinkSync: (name) => unlinks.push(name),
      statfsSync: () => ({ bavail: 2 ** 32, bsize: 1 }),
    };
    const timer = {};
    const context = createContext({ Buffer, process: { getuid: () => 123 },
      setTimeout: (fn) => { timerCallback = fn; return timer; },
      clearTimeout: (t) => { assert.equal(t, timer); cleared = true; } });
    const mocks = {
      'node:child_process': { spawn: () => child },
      'node:fs': fs,
      'node:path': { dirname: path.dirname, basename: path.basename, resolve: path.resolve },
      'node:crypto': { createHash: () => ({ update() { return this; }, digest: () => 'fixture' }) },
      '@alica/acap-contracts': {
        check: (ok, code) => { if (!ok) throw new Error(code); }, rawDigest: () => AGE,
      },
      './g7-durable.mjs': { openPrivateRoot: () => next++, listPrivate: () => [] },
      './g7-archive.mjs': {
        LIMITS: { fileBytes: 2 ** 28, tarBytes: 2 ** 30, timeoutMs: 300000 },
        openArchive: () => { parsed++; return { close: () => { archiveClosed++; } }; },
      },
    };
    const url = new URL('../../tools/g7-restore.mjs', import.meta.url);
    const module = new SourceTextModule(readFileSync(url, 'utf8'), { context, identifier: url.href });
    await module.link((specifier) => {
      assert.ok(Object.hasOwn(mocks, specifier), `Unexpected import ${specifier}`);
      const exports = mocks[specifier];
      return new SyntheticModule(Object.keys(exports), function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      }, { context });
    });
    await module.evaluate();
    const pending = module.namespace.stageBackupTransport(
      { age: '/age', cipher: '/cipher', identity: '/identity', destination: '/destination' },
      'sha256:fixture', () => { certified++; },
      () => { inspected++; return { files: 1 }; },
      () => { monitorCalls++; if (failMonitor) { failMonitor = false; throw original; } },
    );
    let settled = false, result, rejection;
    const observed = pending.then((v) => { settled = true; result = v; },
      (e) => { settled = true; rejection = e; });
    assert.equal(typeof feed, 'function');
    child.stdout.emit('data', Buffer.from('prefix'));
    assert.equal(Buffer.concat(writes).toString(), 'prefix');
    if (fault === 'monitor' || fault === 'write') {
      failMonitor = fault === 'monitor'; failWrite = fault === 'write';
      child.stdout.emit('data', Buffer.from('denied'));
    } else if (['stdout', 'stdin'].includes(fault)) child[fault].emit('error', original);
    else if (fault === 'child') child.emit('error', original);
    else if (fault === 'timeout') timerCallback();
    const callsAtFailure = monitorCalls;
    // kill() is NOT synchronous pipe closure: queued data may follow every failure.
    child.stdout.emit('data', Buffer.from('late'));
    child.stdout.emit('data', Buffer.from('later'));
    const bytesAfterLateData = Buffer.concat(writes).toString();
    const callsAfterLateData = monitorCalls;
    if (fault !== 'success') child.stdout.emit('error', new Error('secondary'));
    child.emit('exit', 0, null);
    await turn();
    assert.equal(settled, false);
    assert.equal(closed.includes(output), false);
    assert.equal(links.length, 0);
    // Close alone is insufficient: outstanding feeder callback must settle too.
    child.emit('close', 0, null);
    await turn();
    assert.equal(settled, false);
    assert.equal(closed.includes(output), false);
    feed(fault === 'success' ? undefined : new Error('later feeder'));
    await observed;
    assert.equal(cleared, true);
    assert.equal(closed.filter((fd) => fd === output).length, 1);
    assert.equal(new Set(closed).size, closed.length);
    if (fault === 'success') {
      assert.equal(rejection, undefined);
      assert.equal(result.stage, 'AUTHENTICATED_VALIDATED_QUARANTINE');
      assert.equal(result.accepted, false);
      assert.equal(result.plainBytes, Buffer.byteLength('prefixlatelater'));
      assert.equal(bytesAfterLateData, 'prefixlatelater');
      assert.equal(monitorCalls, 3);
      assert.equal(certified, 2);
      assert.equal(parsed, 1); assert.equal(inspected, 1); assert.equal(archiveClosed, 1);
      assert.equal(links.length, 1); assert.equal(unlinks.length, 1);
      assert.equal(synced.length, 2); assert.deepEqual(kills, []);
    } else {
      assert.equal(result, undefined);
      if (fault === 'timeout') assert.equal(rejection.code, 'TIMEOUT');
      else assert.equal(rejection, original);
      assert.equal(bytesAfterLateData, 'prefix', 'terminal failure must freeze retained plaintext prefix');
      assert.equal(callsAfterLateData, callsAtFailure, 'terminal failure must not re-enter authority callback');
      assert.equal(certified, 1); assert.equal(parsed, 0); assert.equal(inspected, 0);
      assert.equal(archiveClosed, 0);
      assert.deepEqual(links, []); assert.deepEqual(unlinks, []); assert.deepEqual(synced, []);
      assert.ok(kills.length >= 1); assert.ok(kills.every((s) => s === 'SIGKILL'));
    }
  });
}
