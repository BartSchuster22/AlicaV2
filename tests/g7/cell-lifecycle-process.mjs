// TEST harness only: real filesystem syscall interception, never production flags.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
const [root, input, fault] = process.argv.slice(2);
const original = {
  fsyncSync: fs.fsyncSync,
  renameSync: fs.renameSync,
  linkSync: fs.linkSync,
  writeSync: fs.writeSync,
};
let acceptedRenamed = false,
  hit = false;
const fail = () => {
  hit = true;
  throw Object.assign(new Error('TEST syscall failure'), { code: 'EIO' });
};
fs.renameSync = (a, b) => {
  original.renameSync(a, b);
  if (b.endsWith('/accepted.json')) {
    acceptedRenamed = true;
    if (fault === 'accepted-rename') fail();
  }
};
fs.linkSync = (a, b) => {
  original.linkSync(a, b);
  if (fault === 'journal-link' && b.endsWith('/000004.json')) fail();
};
fs.fsyncSync = (fd) => {
  const path = fs.readlinkSync('/proc/self/fd/' + fd);
  if (
    fault === 'accepted-directory' &&
    acceptedRenamed &&
    fs.fstatSync(fd).isDirectory()
  )
    fail();
  original.fsyncSync(fd);
  if (fault === 'accepted-file-delay' && fs.fstatSync(fd).isFile()) {
    const data = fs.readFileSync('/proc/self/fd/' + fd, 'utf8');
    if (data.includes('alica.cell-accepted/v1')) {
      hit = true;
      // Actual elapsed time and blocked syscall return, not a substituted clock.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 31000);
    }
  }
};
fs.writeSync = (fd, ...args) => {
  if (
    fault === 'enospc' &&
    fs.readlinkSync('/proc/self/fd/' + fd).includes('/transactions/')
  ) {
    hit = true;
    throw Object.assign(new Error('TEST ENOSPC'), { code: 'ENOSPC' });
  }
  return original.writeSync(fd, ...args);
};
syncBuiltinESMExports();
const { CellPreparation } = await import('../../tools/g7-cell.mjs');
const f = JSON.parse(fs.readFileSync(input));
const c = new CellPreparation(root);
const start = process.hrtime.bigint();
let failure;
try {
  await c.install(f.archive, f.trust, f.authorization);
  if (fault !== 'shutdown') assert.fail('unexpected accepted install');
  await c.shutdown();
  assert.fail('unexpected clean shutdown');
} catch (e) {
  failure = { code: e.code, runtime: e.runtime, outcome: e.outcome };
  assert.equal(e.runtime, 'NEEDS_OPERATOR');
}
const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
if (fault !== 'shutdown' && fault !== 'provider') assert.equal(hit, true);
const selected = () =>
  fs.existsSync(root + '/accepted.json')
    ? fs.readFileSync(root + '/accepted.json', 'utf8')
    : null;
const before = selected();
assert.throws(() => c.status(), { runtime: 'NEEDS_OPERATOR' });
await assert.rejects(c.install(f.archive, f.trust, f.authorization), {
  runtime: 'NEEDS_OPERATOR',
});
// Give real late IPC completions a chance to arrive after the failed operation.
await new Promise((resolve) => setTimeout(resolve, 2200));
assert.equal(selected(), before);
if (['provider', 'accepted-file-delay', 'enospc'].includes(fault))
  assert.equal(before, null);
let closeBlocked = false;
try {
  c.close();
} catch (e) {
  assert.equal(e.code, 'CONFLICT');
  closeBlocked = true;
}
console.log(
  JSON.stringify({
    failure,
    elapsedMs,
    accepted: before !== null,
    closeBlocked,
    hit,
  }),
);
// Uncertain cleanup deliberately retains the owner/host until process exit.
// This exit is NOT a Cell STOPPED/reap/restart qualification.
process.exit(0);
