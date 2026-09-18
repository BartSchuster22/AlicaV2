// Test-only syscall stalls. Does not substitute Kernel reports, grants or time.
import fs from 'node:fs';
import { OwnerChannel } from '../../tools/g7-owner-channel.mjs';
import { syncBuiltinESMExports } from 'node:module';
const rename = fs.renameSync;
fs.renameSync = function (...args) {
  const result = rename.apply(this, args);
  const mode = process.env.G7_TEST_START_BLOCK;
  if (
    (mode === 'publication' && String(args[1]).endsWith('/accepted.json')) ||
    (mode === 'floor-publication' &&
      process.argv.length === 7 &&
      String(args[1]).endsWith('/floor.json'))
  ) {
    fs.writeFileSync(
      process.env.G7_TEST_FIFO + '.entered',
      String(process.pid),
    );
    throw Object.assign(new Error('test-only fault after actual rename'), {
      code: 'EIO',
    });
  }
  return result;
};
syncBuiltinESMExports();
const original = OwnerChannel.prototype.send;
OwnerChannel.prototype.send = async function (message) {
  await original.call(this, message);
  const mode = process.env.G7_TEST_START_BLOCK;
  const successor = process.argv.length === 7;
  if (
    (mode === 'successor' && successor && message.phase === 'activation') ||
    (mode === 'stop-exit' && message.stopped) ||
    (mode === 'successor-cleanup' && successor && message.phase === 'cleanup')
  ) {
    fs.writeFileSync(
      process.env.G7_TEST_FIFO + '.entered',
      String(process.pid),
    );
    fs.openSync(process.env.G7_TEST_FIFO, fs.constants.O_RDONLY);
  }
};
