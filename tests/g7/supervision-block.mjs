// Test-only real synchronous FIFO open. No Kernel result or clock substitution.
import fs from 'node:fs';
import { Socket } from 'node:net';
const original = Socket.prototype.write;
let cleanups = 0;
Socket.prototype.write = function (chunk, ...args) {
  const result = original.call(this, chunk, ...args);
  if (typeof chunk === 'string') {
    if (chunk === '{"phase":"cleanup"}\n') cleanups++;
    if (
      (process.env.G7_TEST_PHASE === 'activation' &&
        chunk === '{"phase":"activation"}\n') ||
      (process.env.G7_TEST_PHASE !== 'activation' &&
        chunk === '{"phase":"cleanup"}\n' &&
        cleanups === 2)
    ) {
      fs.writeFileSync(
        process.env.G7_TEST_FIFO + '.entered',
        String(process.pid),
      );
      // Opening a FIFO without a writer blocks in the actual kernel syscall.
      fs.openSync(process.env.G7_TEST_FIFO, fs.constants.O_RDONLY);
    }
  }
  return result;
};
