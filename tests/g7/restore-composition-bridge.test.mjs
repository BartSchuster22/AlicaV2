// UNEXECUTED. Ordinary bridge control flow with synthetic native/protocol returns.
// NOT authentication, lock custody, containment, exact reap, Kernel or Cell proof.
// Adapted from restore-input-binding.test.mjs / transport-stream-errors.mjs:
// evaluate the WHOLE shipped module verbatim using a closed VM import map.
// Future authorized command:
// node --experimental-vm-modules --test tests/g7/restore-composition-bridge.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import test from 'node:test';

const A = 'sha256:' + 'a'.repeat(64), I = 'sha256:' + 'c'.repeat(64);
const stopped = { status: 'STOPPED', sequence: 1, acceptedDigest: A };
const selection = { sequence: 1, acceptedDigest: A, inputDigest: I };
const check = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
async function fixture({ names = [], sameRoot = false } = {}) {
  const events = [], queues = new Map(), channels = new Map();
  let next = 20, pending, uncertain = false;
  const closed = [], ended = [];
  const native = {
    packetPair() {
      const pair = [next++, next++]; pending = pair[0];
      queues.set(pair[0], []); return pair;
    },
    childPidfd: pid => pid + 1000,
    pidfdDead: () => false, // Synthetic live return, never native evidence.
    packetSend(fd, bytes) {
      const text = bytes.toString(); events.push(['send', fd, text]);
      const queue = queues.get(fd);
      if (uncertain) { uncertain = false; queue.push(Buffer.from('UNCERTAIN')); return; }
      if (text === 'GO' || text.startsWith('RESTORE ')) queue.push(Buffer.from('SEALING'));
      else if (text === 'SEAL') queue.push(Buffer.from('CLEAN ' + JSON.stringify(stopped)));
      else if (text.startsWith('SERVE ')) queue.push(Buffer.from('SERVING'));
      else if (text === 'DONE') channels.get(fd).emit('exit', 0, null);
      else if (text !== 'ACK') queue.push(Buffer.from('ACK'));
    },
    packetReceive(fd, pid) {
      assert.equal(channels.get(fd).pid, pid); // Expected-identity argument only.
      assert.ok(queues.get(fd).length, 'unexpected receive; no polling fallback');
      return queues.get(fd).shift();
    },
    lockRoot(fd) { events.push(['lock', fd]); },
    armChildContainment(fd) { events.push(['arm', fd]); return 500; },
    endChildContainment(guard) { ended.push(guard); },
  };
  const modules = {
    'node:child_process': { spawn(executable, argv, options) {
      events.push(['spawn', executable, Array.from(argv)]);
      assert.equal(options.stdio[4], pending + 1);
      const child = new EventEmitter(); child.pid = pending + 100;
      channels.set(pending, child); return child;
    } },
    'node:fs': { closeSync: fd => closed.push(fd),
      readFileSync: () => JSON.stringify({ verifyTimeoutMs: 300000, cleanupTimeoutMs: 30000 }),
      fstatSync: fd => ({ dev: 1, ino: fd === 10 || sameRoot ? 1 : 2 }) },
    './g7-durable.mjs': { openPrivateRoot(root) {
      events.push(['open', root]); return 11;
    }, listPrivate(fd) { events.push(['list', fd]); return names; } },
    'node:module': { createRequire: () => name => {
      assert.equal(name, '../native/g7/build/ownership.node'); return native;
    } },
    'node:url': { fileURLToPath },
    'node:timers/promises': { setTimeout() { throw new Error('unexpected polling'); } },
    '@alica/acap-contracts': { parse: JSON.parse, check },
  };
  const context = createContext({ Buffer, URL, performance: { now: () => 1 },
    process: { execPath: '/fixture/node' } });
  const url = new URL('../../tools/g7-owned-bridge.mjs', import.meta.url);
  const module = new SourceTextModule(readFileSync(url, 'utf8'), { context,
    initializeImportMeta(meta) { meta.url = url.href; } });
  await module.link(name => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected import ${name}`);
    return new SyntheticModule(Object.keys(modules[name]), function () {
      for (const [key, value] of Object.entries(modules[name])) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const watch = await module.namespace.ownedStop('/source', '/source-inputs', 10);
  return { watch, events, closed, ended, channels, uncertain() { uncertain = true; } };
}

test('ordinary bridge: missing preparation is rejected before opening destination', async () => {
  const f = await fixture(); let operated = false;
  await assert.rejects(f.watch.destinationScope('/destination', '/ignored',
    () => { operated = true; }), { code: 'FAILED_PRECONDITION' });
  assert.equal(operated, false);
  assert.equal(f.events.some(e => e[0] === 'open'), false);
  assert.equal(f.channels.size, 1);
});
for (const names of [['accepted.json'], ['unrelated']])
  test(`ordinary bridge: nonempty destination ${names[0]} has no preparation/fallback launch`, async () => {
    const f = await fixture({ names }); let prepared = false;
    await assert.rejects(f.watch.destinationScope('/destination', '/ignored',
      () => assert.fail('operation'), () => { prepared = true; }),
    { code: 'FAILED_PRECONDITION' });
    assert.equal(prepared, false);
    assert.deepEqual(f.events.filter(e => ['open', 'lock', 'list', 'arm'].includes(e[0])),
      [['open', '/destination'], ['lock', 11], ['list', 11]]);
    assert.ok(f.closed.includes(11));
    assert.equal(f.channels.size, 1);
  });
test('ordinary bridge: source inode cannot be the destination', async () => {
  const f = await fixture({ sameRoot: true });
  await assert.rejects(f.watch.destinationScope('/source', '/ignored',
    () => assert.fail('operation'), () => assert.fail('preparation')), { code: 'PERMISSION_DENIED' });
  assert.equal(f.events.some(e => e[0] === 'lock'), false);
  assert.ok(f.closed.includes(11));
});

test('ordinary bridge: empty destination prepares before RESTORE; operation failure stays sticky', async () => {
  const f = await fixture(); const failure = new Error('operation failure');
  let retainedScope;
  await assert.rejects(f.watch.destinationScope('/destination', '/ignored', scope => {
    retainedScope = scope; scope.assert();
    assert.equal(Object.keys(scope).join(','), 'assert');
    throw failure;
  }, fd => {
    assert.equal(fd, 11); f.events.push(['prepare', fd]);
    return { inputs: '/prepared-inputs', selection };
  }), error => error === failure);
  await assert.rejects(f.watch.lost, error => error === failure);
  const restore = f.events.findIndex(e => e[0] === 'send' && e[2].startsWith('RESTORE '));
  const prepared = f.events.findIndex(e => e[0] === 'prepare');
  assert.ok(prepared > f.events.findIndex(e => e[0] === 'list'));
  assert.ok(restore > prepared);
  assert.deepEqual(JSON.parse(f.events[restore][2].slice(8)), selection);
  const serve = f.events.find(e => e[0] === 'send' && e[2].startsWith('SERVE '));
  assert.deepEqual(JSON.parse(serve[2].slice(6)), { inputs: '/prepared-inputs', selection: stopped });
  assert.equal(f.channels.size, 2);
  assert.equal(f.closed.includes(11), false); // Retained by ordinary failure branch only.
  assert.deepEqual(f.ended, []);
  assert.throws(() => retainedScope.assert(), { code: 'FAILED_PRECONDITION' });
  await assert.rejects(f.watch.serve('/retry', stopped));
  await assert.rejects(f.watch.send({ phase: 'resume' }));
  await assert.rejects(f.watch.finish());
  assert.equal(f.events.some(e => e[0] === 'send' && e[2] === 'DONE'), false);
});

test('ordinary bridge: preparation failure never launches destination and retains negative state', async () => {
  const f = await fixture(), failure = new Error('preparation failure');
  await assert.rejects(f.watch.destinationScope('/destination', '/ignored',
    () => assert.fail('operation'), () => { throw failure; }), error => error === failure);
  await assert.rejects(f.watch.lost, error => error === failure);
  assert.equal(f.channels.size, 1);
  assert.equal(f.closed.includes(11), false);
  assert.deepEqual(f.ended, []);
  assert.throws(() => f.watch.assert());
  await assert.rejects(f.watch.finish());
});

test('ordinary bridge: authenticated-boundary UNCERTAIN is sticky even after later zero exit', async () => {
  const f = await fixture(); f.uncertain();
  await assert.rejects(f.watch.send({ phase: 'cleanup' }), { code: 'FAILED_PRECONDITION' });
  await assert.rejects(f.watch.lost, { code: 'FAILED_PRECONDITION' });
  const count = f.events.length;
  for (const child of f.channels.values()) child.emit('exit', 0, null);
  assert.throws(() => f.watch.assert());
  await assert.rejects(f.watch.send({ phase: 'resume' }));
  await assert.rejects(f.watch.serve('/retry', stopped));
  await assert.rejects(f.watch.finish());
  assert.equal(f.events.length, count); // No later outbound protocol traffic.
  assert.deepEqual(f.ended, []);
});
