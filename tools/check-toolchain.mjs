import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const lock = JSON.parse(readFileSync('toolchain.lock.json', 'utf8'));
if (
  process.version !== lock.node.version ||
  execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim() !== lock.npm
) {
  throw new Error('Pinned Node/npm toolchain mismatch');
}
console.log('Pinned Node/npm verified');
