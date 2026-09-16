import fs from 'node:fs';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const native = require('../../native/g6/build/bridge.node');
const capsule = JSON.parse(fs.readFileSync(5, 'utf8'));
const challenge = fs.readFileSync(4, 'utf8');
fs.closeSync(4);
fs.closeSync(5);
const control = native.adopt(3, 1),
  carrier = native.adopt(6, 5);
const encode = (value) => {
  const b = Buffer.from(JSON.stringify(value));
  const h = Buffer.alloc(4);
  h.writeUInt32BE(b.length);
  return Buffer.concat([h, b]);
};
function send(handle, value) {
  const b = encode(value);
  let p = 0;
  while (p < b.length) {
    const n = native.write(handle, b.subarray(p));
    if (!n) throw Error('fixture backpressure');
    p += n;
  }
}
try {
  await Promise.all(
    [1, 2].map(
      () =>
        new Promise((resolve, reject) =>
          crypto.pbkdf2('fixture', 'fixture', 1, 16, 'sha256', (error) =>
            error ? reject(error) : resolve(),
          ),
        ),
    ),
  );
  const abi = native.seal(capsule.readPaths, 6, Number(process.argv[2]));
  const result = {
    kind: 'native-ready',
    pid: process.pid,
    challenge,
    abi,
    inheritedSentinel: 'G6_PARENT_ONLY' in process.env,
  };
  if (capsule.mode === 'confinement') {
    const blocked = (fn) => {
      try {
        fn();
        return false;
      } catch {
        return true;
      }
    };
    result.allowedRead =
      fs.readFileSync(capsule.allowed, 'utf8') === 'public fixture';
    result.outsideRead = blocked(() => fs.readFileSync(capsule.outside));
    result.writeDenied = blocked(() =>
      fs.writeFileSync(capsule.allowed, 'bad'),
    );
    result.symlinkDenied = blocked(() => fs.readFileSync(capsule.symlink));
    result.networkSocketDenied = blocked(() => native.pair(1));
    result.processInspectionDenied = blocked(() =>
      native.pidfdOpen(process.ppid),
    );
    result.crossProcessSignalDenied = blocked(() =>
      process.kill(process.ppid, 0),
    );
    result.execDenied = !!childProcess.spawnSync('/bin/true').error;
  }
  send(control, result);
  if (capsule.mode === 'spin') {
    while (true) {}
  }
  if (capsule.mode === 'confinement') {
    native.close(control);
    native.close(carrier);
    process.exit(0);
  }
  const contexts = [];
  let counter = 0;
  const timer = setInterval(() => {
    try {
      const offer = native.receiveOffer(carrier);
      if (offer) {
        const meta = JSON.parse(offer.data.subarray(4).toString());
        contexts.push({
          handle: offer.handle,
          id: meta.contextId,
          buf: Buffer.alloc(0),
        });
      }
      for (const c of contexts) {
        const b = native.read(c.handle, 4096);
        if (b?.length) c.buf = Buffer.concat([c.buf, b]);
      }
      if (
        contexts.length === 2 &&
        contexts.every(
          (c) => c.buf.length >= 4 && c.buf.length === c.buf.readUInt32BE() + 4,
        )
      ) {
        for (const c of contexts) {
          const req = JSON.parse(c.buf.subarray(4));
          if (req.contextId !== c.id) throw Error('fixture context mismatch');
          send(c.handle, { contextId: c.id, count: ++counter });
          native.close(c.handle);
        }
        clearInterval(timer);
        native.close(carrier);
        native.close(control);
        process.exit(0);
      }
    } catch {
      process.exit(91);
    }
  }, 1);
} catch (error) {
  try {
    fs.writeSync(2, String(error?.stack ?? error).slice(0, 4096));
  } catch {}
  try {
    send(control, { kind: 'native-failed' });
  } catch {}
  process.exit(90);
}
