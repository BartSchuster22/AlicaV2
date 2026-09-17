import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, closeSync, rmSync, fchmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPrivateRoot } from '../../tools/g7-durable.mjs';
const require = createRequire(import.meta.url);
const { lockRoot, adoptRoot } = require('../../native/g7/build/ownership.node');

test('native custody requires matching private inode and the actual held flock description', () => {
  const root = mkdtempSync(join(tmpdir(), 'g7-custody-'));
  mkdirSync(join(root, 'other'), { mode: 0o700 });
  const held = openPrivateRoot(root),
    checked = openPrivateRoot(root),
    other = openPrivateRoot(join(root, 'other'));
  let adopted;
  try {
    assert.throws(() => adoptRoot(held, checked), {
      code: 'PERMISSION_DENIED',
    });
    lockRoot(held);
    assert.throws(() => adoptRoot(checked, held), {
      code: 'PERMISSION_DENIED',
    });
    assert.throws(() => adoptRoot(held, other), { code: 'PERMISSION_DENIED' });
    fchmodSync(held, 0o750);
    assert.throws(() => adoptRoot(held, checked), {
      code: 'PERMISSION_DENIED',
    });
    fchmodSync(held, 0o700);
    adopted = adoptRoot(held, checked);
    assert.throws(() => lockRoot(checked), { code: 'CONFLICT' });
    closeSync(adopted);
    adopted = undefined;
    assert.throws(() => lockRoot(checked), { code: 'CONFLICT' });
  } finally {
    if (adopted !== undefined) closeSync(adopted);
    for (const fd of [held, checked, other]) closeSync(fd);
    rmSync(root, { recursive: true, force: true });
  }
});
