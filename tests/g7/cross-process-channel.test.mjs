import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { closeSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
const native = createRequire(import.meta.url)(
  '../../native/g7/build/ownership.node',
);
async function packet(t, code) {
  const [a, b] = native.packetPair();
  const child = spawn(
    'python3',
    [
      '-c',
      `import os,socket,time,array\ns=socket.socket(fileno=3)\n${code}\ntime.sleep(2)`,
    ],
    { stdio: ['ignore', 'ignore', 'pipe', b] },
  );
  closeSync(b);
  const pidfd = native.childPidfd(child.pid);
  t.after(async () => {
    child.kill('SIGKILL');
    if (child.exitCode === null && child.signalCode === null)
      await once(child, 'exit');
    closeSync(a);
    closeSync(pidfd);
  });
  // Wait for a real child signal, not a sleep-as-readiness guess.
  await once(child.stderr, 'data');
  return { a, child, pidfd };
}
test('anonymous packet channel authenticates exact real child credentials; pidfd pins lifetime', async (t) => {
  const { a, child, pidfd } = await packet(
    t,
    "s.send(b'CLEAN')\nos.write(2,b'ready')",
  );
  assert.equal(native.pidfdDead(pidfd), false);
  assert.equal(native.packetReceive(a, child.pid).toString(), 'CLEAN');
  assert.equal(native.packetReceive(a, child.pid), null);
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
  assert.equal(native.pidfdDead(pidfd), true);
  assert.throws(() => native.packetReceive(a, child.pid));
});
test('same-uid grandchild cannot forge exact coordinator credentials on inherited channel', async (t) => {
  const { a, child } = await packet(
    t,
    "p=os.fork()\nif p==0:\n s.send(b'CLEAN')\n os._exit(0)\nos.waitpid(p,0)\nos.write(2,b'ready')",
  );
  assert.throws(() => native.packetReceive(a, child.pid), /Unowned sender/);
});
for (const kind of ['rights', 'oversize', 'empty'])
  test(
    'rejects unauthenticated ancillary/truncated/empty packet: ' + kind,
    async (t) => {
      const source = {
        rights:
          "s.sendmsg([b'CLEAN'],[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',[1]))])",
        oversize: "s.send(b'x'*65537)",
        empty: "s.send(b'')",
      }[kind];
      const { a, child } = await packet(t, source + "\nos.write(2,b'ready')");
      const before = readdirSync('/proc/self/fd').length;
      assert.throws(() => native.packetReceive(a, child.pid));
      assert.equal(
        readdirSync('/proc/self/fd').length,
        before,
        'rights must not leak descriptor',
      );
    },
  );
