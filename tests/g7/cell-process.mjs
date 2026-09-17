// Test-only syscall observer; no production crash flags or injected activation callbacks.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const [mode, root, inputs, boundary] = process.argv.slice(2);
const original = {
  fsyncSync: fs.fsyncSync,
  linkSync: fs.linkSync,
  renameSync: fs.renameSync,
  writeSync: fs.writeSync,
};
function pause() {
  original.writeSync(1, 'BOUNDARY\n');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}
if (boundary) {
  fs.fsyncSync = (fd) => {
    original.fsyncSync(fd);
    const path = fs.readlinkSync('/proc/self/fd/' + fd);
    if (path.includes('/transactions/') && fs.fstatSync(fd).isDirectory()) {
      const count = fs
        .readdirSync('/proc/self/fd/' + fd)
        .filter((n) => /^\d{6}\.json$/.test(n)).length;
      if (
        (boundary === 'staging-durable' && count === 1) ||
        (boundary === 'verified-durable' && count === 2)
      )
        pause();
    }
    if (boundary === 'floor-durable' && path.endsWith('/floor.json')) pause();
  };
  fs.linkSync = (a, b) => {
    original.linkSync(a, b);
    if (boundary === 'journal-link' && b.endsWith('/000001.json')) pause();
  };
  fs.renameSync = (a, b) => {
    original.renameSync(a, b);
    if (boundary === 'floor-rename' && b.endsWith('/floor.json')) pause();
  };
  syncBuiltinESMExports();
}
const { CellPreparation } = await import('../../tools/g7-cell.mjs');
const cell = new CellPreparation(root);
try {
  if (mode === 'hold') pause();
  const f = JSON.parse(fs.readFileSync(inputs));
  const result =
    mode === 'stage'
      ? await cell.stage(f.archive, f.trust, f.authorization)
      : mode === 'recover'
        ? await cell.recover(f.trust)
        : cell.status();
  console.log(JSON.stringify(result));
} catch (e) {
  console.error(e.code ?? e.message);
  process.exitCode = 1;
} finally {
  cell.close();
}
