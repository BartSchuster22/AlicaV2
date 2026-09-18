// Test-only boundary observation/fault injection, loaded only in maintenance Node.
import { createRequire, syncBuiltinESMExports } from 'node:module';
import fs from 'node:fs';
import { join } from 'node:path';
import { rawDigest } from '@alica/acap-contracts';
import { CellPreparation } from '../../tools/g7-cell.mjs';
const ownedReinstall = CellPreparation.prototype.ownedReinstall;
CellPreparation.prototype.ownedReinstall = async function (...args) {
  try {
    return await ownedReinstall.apply(this, args);
  } catch (e) {
    console.error('TEST-ONLY', e.stack);
    throw e;
  }
};
const native = createRequire(import.meta.url)(
  '../../native/g7/build/ownership.node',
);
const directory = process.env.G7_CROSS_DIRECTORY;
if (directory && process.argv[1]?.endsWith('g7-owned-cli.mjs')) {
  const root = process.argv[3],
    mode = process.env.G7_CROSS_MODE;
  const snapshot = () =>
    Object.fromEntries(
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
                    mode: s.mode,
                    mtimeMs: s.mtimeMs,
                    digest: rawDigest(fs.readFileSync(join(root, p))),
                  },
                ],
              ]
            : [];
        }),
    );
  const record = (event, data = {}) =>
    fs.appendFileSync(
      join(directory, 'events.jsonl'),
      JSON.stringify({ event, pid: process.pid, ...data }) + '\n',
    );
  const block = (event) => {
    record(event);
    const f = fs.openSync(join(directory, 'pause.fifo'), 'r');
    fs.readSync(f, Buffer.alloc(1), 0, 1, null);
    fs.closeSync(f);
  };
  let cleanup = false,
    activation = false;
  const receive = native.packetReceive;
  native.packetReceive = (fd, pid) => {
    const packet = receive(fd, pid);
    if (packet) record('packet', { child: pid, packet: packet.toString() });
    if (packet?.toString() === 'ACK' && cleanup && mode === 'block-cleanup')
      block('blocked-cleanup');
    if (
      packet?.toString() === 'ACK' &&
      activation &&
      mode === 'block-activation'
    )
      block('blocked-activation');
    if (packet?.subarray(0, 6).toString() === 'CLEAN ') {
      fs.writeFileSync(
        join(directory, 'before.json'),
        JSON.stringify(snapshot()),
      );
      record('clean-boundary');
      if (mode === 'late-clean')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 31000);
      if (mode === 'pause-clean') {
        const f = fs.openSync(join(directory, 'pause.fifo'), 'r');
        fs.readSync(f, Buffer.alloc(1), 0, 1, null);
        fs.closeSync(f);
      }
      if (mode === 'kill-coordinator') process.kill(pid, 'SIGKILL');
      if (mode === 'forged-clean')
        return Buffer.from(
          'CLEAN {"status":"STOPPED","sequence":2,"acceptedDigest":"sha256:' +
            '0'.repeat(64) +
            '"}',
        );
    }
    return packet;
  };
  const send = native.packetSend;
  native.packetSend = (fd, packet) => {
    record('send', { packet: packet.toString() });
    if (packet.toString() === 'CLEANUP') cleanup = true;
    if (packet.toString() === 'ACTIVATION') activation = true;
    if (packet.toString() === 'RESUME') cleanup = false;
    if (packet.toString() === 'DONE')
      fs.writeFileSync(
        join(directory, 'after.json'),
        JSON.stringify(snapshot()),
      );
    const result = send(fd, packet);
    if (packet.toString() === 'ACK' && mode === 'block-maintenance')
      block('blocked-maintenance');
    return result;
  };
  const rename = fs.renameSync,
    sync = fs.fsyncSync,
    link = fs.linkSync;
  let published = false,
    commitPublished = false;
  fs.linkSync = function (a, b) {
    const commit = String(b).endsWith('/000004.json');
    if (commit && mode === 'crash-before-commit')
      process.kill(process.pid, 'SIGKILL');
    const result = link.call(this, a, b);
    if (commit) {
      commitPublished = true;
      record('commit-linked');
    }
    if (commit && mode === 'crash-after-commit')
      process.kill(process.pid, 'SIGKILL');
    return result;
  };
  fs.renameSync = function (a, b) {
    const accepted = String(b).endsWith('/accepted.json');
    if (accepted && mode === 'crash-before-accepted')
      process.kill(process.pid, 'SIGKILL');
    const result = rename.call(this, a, b);
    if (accepted) {
      published = true;
      record('accepted-renamed');
    }
    if (accepted && mode === 'crash-after-accepted')
      process.kill(process.pid, 'SIGKILL');
    if (accepted && mode === 'uncertain-rename')
      throw Object.assign(new Error('test actual rename outcome uncertainty'), {
        code: 'EIO',
      });
    return result;
  };
  fs.fsyncSync = function (fd) {
    const result = sync.call(this, fd);
    if (
      commitPublished &&
      fs.fstatSync(fd).isDirectory() &&
      mode === 'uncertain-commit-fsync'
    )
      throw Object.assign(new Error('test commit durability uncertainty'), {
        code: 'EIO',
      });
    if (published && fs.fstatSync(fd).isDirectory()) {
      record('accepted-directory-fsync');
      if (mode === 'crash-after-accepted-fsync')
        process.kill(process.pid, 'SIGKILL');
      if (mode === 'uncertain-directory-fsync')
        throw Object.assign(
          new Error('test actual fsync outcome uncertainty'),
          { code: 'EIO' },
        );
    }
    return result;
  };
  syncBuiltinESMExports();
}
