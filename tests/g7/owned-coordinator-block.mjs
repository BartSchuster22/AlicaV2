// Test-only blocking syscalls AFTER production parent guard and custody adoption.
// No changed clocks/budgets, synthetic Kernel results, or production test flags.
import fs from 'node:fs';
import { CellPreparation } from '../../tools/g7-cell.mjs';
const mode = process.env.G7_OWNED_BLOCK;
const method =
  mode === 'verification'
    ? 'install'
    : mode === 'cleanup'
      ? 'shutdown'
      : mode === 'maintenance'
        ? 'status'
        : undefined;
const target =
  mode === 'maintenance' ? '/g7-stopped-verify.mjs' : '/g7-cell-owner.mjs';
if (method && process.argv[1].endsWith(target)) {
  const original = CellPreparation.prototype[method];
  CellPreparation.prototype[method] = function (...args) {
    fs.writeFileSync(
      process.env.G7_OWNED_FIFO + '.entered',
      String(process.pid),
    );
    const fd = fs.openSync(process.env.G7_OWNED_FIFO, fs.constants.O_RDONLY);
    fs.closeSync(fd);
    return original.apply(this, args);
  };
}
