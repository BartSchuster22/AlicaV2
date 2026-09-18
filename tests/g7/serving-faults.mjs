// Test-only faults/observation. No fabricated successful Kernel or custody report.
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { join } from 'node:path';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { rawDigest } from '@alica/acap-contracts';
import { OwnerChannel } from '../../tools/g7-owner-channel.mjs';
import { CellPreparation } from '../../tools/g7-cell.mjs';
import { setTimeout as delay } from 'node:timers/promises';
const dir = process.env.G7_SERVING_DIR,
  mode = process.env.G7_SERVING_MODE;
const native = createRequire(import.meta.url)(
  '../../native/g7/build/ownership.node',
);
const record = (event, data = {}) =>
  fs.appendFileSync(
    join(dir, 'events.jsonl'),
    JSON.stringify({
      event,
      pid: process.pid,
      monotonicNs: process.hrtime.bigint().toString(),
      ...data,
    }) + '\n',
  );
const block = (event) => {
  record(event);
  fs.openSync(join(dir, 'pause.fifo'), 'r');
};
if (
  dir &&
  (process.argv[1]?.endsWith('serving-driver.mjs') ||
    process.argv[1]?.endsWith('g7-owned-cli.mjs'))
) {
  if (mode.startsWith('fence-')) {
    const spawn = childProcess.spawn;
    childProcess.spawn = function (command, args, options) {
      if (command === 'python3' && args[0].endsWith('/g7-owned-coordinator.py'))
        args = ['tests/g7/serving-python.py', ...args];
      return spawn.call(this, command, args, options);
    };
  }
  const root = process.argv[1].endsWith('g7-owned-cli.mjs')
    ? process.argv[3]
    : process.argv[2];
  let cleans = 0,
    serves = 0;
  const send = native.packetSend,
    receive = native.packetReceive;
  native.packetSend = (fd, packet) => {
    record('send', { packet: packet.toString() });
    if (packet.toString().startsWith('SERVE ')) {
      serves++;
      if (mode === 'pause-serve') block('paused-serve');
      if (mode === 'forged-selection') {
        const p = JSON.parse(packet.subarray(6));
        p.selection.acceptedDigest = 'sha256:' + '0'.repeat(64);
        packet = Buffer.from('SERVE ' + JSON.stringify(p));
      }
      if (mode === 'crash-before-serve') process.kill(process.pid, 'SIGKILL');
    }
    const result = send(fd, packet);
    if (
      mode === 'block-maintenance' &&
      cleans === 2 &&
      packet.toString() === 'ACK'
    )
      block('blocked-maintenance');
    if (mode === 'crash-after-serve' && packet.toString().startsWith('SERVE '))
      process.kill(process.pid, 'SIGKILL');
    return result;
  };
  native.packetReceive = (fd, pid) => {
    const packet = receive(fd, pid);
    if (packet) record('packet', { child: pid, packet: packet.toString() });
    if (packet?.toString().startsWith('CLEAN ')) {
      cleans++;
      const files = Object.fromEntries(
        fs
          .readdirSync(root, { recursive: true })
          .sort()
          .flatMap((p) => {
            const s = fs.lstatSync(join(root, p));
            return s.isFile()
              ? [
                  [
                    p,
                    {
                      ino: s.ino,
                      digest: rawDigest(fs.readFileSync(join(root, p))),
                    },
                  ],
                ]
              : [];
          }),
      );
      fs.writeFileSync(
        join(dir, 'clean-' + cleans + '.json'),
        JSON.stringify(files),
      );
      if (cleans === 2 && mode === 'forged-clean')
        return Buffer.from(
          'CLEAN {"status":"STOPPED","sequence":999,"acceptedDigest":"sha256:' +
            '0'.repeat(64) +
            '"}',
        );
      if (cleans === 2 && mode === 'late-clean')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 31000);
      if (cleans === 2 && mode === 'crash-after-clean')
        process.kill(process.pid, 'SIGKILL');
    }
    if (packet?.toString() === 'SERVING' && mode === 'kill-coordinator')
      process.kill(pid, 'SIGKILL');
    return packet;
  };
  const rename = fs.renameSync,
    sync = fs.fsyncSync,
    link = fs.linkSync;
  let published = false;
  fs.renameSync = function (a, b) {
    const accepted = String(b).endsWith('/accepted.json');
    if (accepted && mode === 'crash-before-accepted')
      process.kill(process.pid, 'SIGKILL');
    const result = rename.call(this, a, b);
    if (accepted) {
      published = true;
      record('accepted-renamed');
      if (mode === 'crash-after-accepted') process.kill(process.pid, 'SIGKILL');
      if (mode === 'uncertain-rename')
        throw Object.assign(new Error('test actual rename uncertainty'), {
          code: 'EIO',
        });
    }
    return result;
  };
  fs.fsyncSync = function (fd) {
    const result = sync.call(this, fd);
    if (
      published &&
      fs.fstatSync(fd).isDirectory() &&
      mode === 'uncertain-fsync'
    )
      throw Object.assign(
        new Error('test actual directory fsync uncertainty'),
        { code: 'EIO' },
      );
    return result;
  };
  fs.linkSync = function (a, b) {
    const result = link.call(this, a, b);
    if (String(b).endsWith('/000004.json') && mode === 'crash-after-commit')
      process.kill(process.pid, 'SIGKILL');
    return result;
  };
  syncBuiltinESMExports();
}
if (
  dir &&
  process.argv[1]?.endsWith('g7-cell-owner.mjs') &&
  process.argv.length === 7
) {
  record('successor', { parent: process.ppid });
  if (mode === 'failed-runtime-before-ready') {
    const start = CellPreparation.prototype.startAccepted;
    CellPreparation.prototype.startAccepted = async function (...args) {
      const result = await start.apply(this, args);
      const children = fs
        .readFileSync('/proc/self/task/' + process.pid + '/children', 'utf8')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(Number);
      if (!children.length) throw new Error('missing actual runtime child');
      const fd = native.childPidfd(children[0]);
      try {
        const killed = childProcess.spawnSync(
          'python3',
          ['-c', 'import signal;signal.pidfd_send_signal(3,signal.SIGKILL)'],
          { stdio: ['ignore', 'ignore', 'pipe', fd] },
        );
        if (killed.status !== 0) throw new Error(killed.stderr.toString());
      } finally {
        fs.closeSync(fd);
      }
      const end = performance.now() + 3000;
      while (this.status().runtime !== 'FAILED' && performance.now() < end)
        await delay(10);
      record('real-failed-status', {
        runtime: this.status().runtime,
        child: children[0],
      });
      return result; // Caller reads a NEW real public-Kernel snapshot, not this prior return.
    };
  }
  const send = OwnerChannel.prototype.send;
  OwnerChannel.prototype.send = async function (message) {
    await send.call(this, message);
    if (message.phase === 'activation') {
      record('successor-activation');
      if (mode === 'block-activation') block('blocked-activation');
      if (mode === 'kill-owner') process.kill(process.pid, 'SIGKILL');
    }
    if (message.phase === 'cleanup' && mode === 'block-cleanup')
      block('blocked-cleanup');
    if (message.stopped && mode === 'block-normal-exit')
      block('blocked-normal-exit');
  };
}
