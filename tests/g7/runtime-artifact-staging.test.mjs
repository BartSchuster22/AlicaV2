import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, rawDigest } from '@alica/acap-contracts';
import { cellFixture } from './cell-fixture.mjs';
import { signature } from '../../tools/g3-fixtures.mjs';
import { assembleRelease, artifactKind } from '../../tools/g7-release.mjs';
import { openArchive } from '../../tools/g7-archive.mjs';
import { CellPreparation } from '../../tools/g7-cell.mjs';

test('Cell stages actual signed artifact above JSON limit without widening metadata bounds', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'g7-large-artifact-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const f = await cellFixture(dir);
  const payload = Buffer.alloc(1048577, 0x5a);
  f.files.set('runtime/large.bin', payload);
  f.bundle.artifacts = [...f.files].map(([path, bytes]) => ({
    path,
    bytes: bytes.length,
    digest: rawDigest(bytes),
    kind: artifactKind(path),
  }));
  const archivePath = join(dir, 'large.tar');
  assembleRelease(
    archivePath,
    Buffer.from(canonical(f.bundle)),
    Buffer.from(canonical(signature(f.bundle, 'ALICA-BUNDLE-v1', f.publisher))),
    f.files,
  );
  const archive = openArchive(archivePath);
  try {
    assert.throws(() => archive.read('runtime/large.bin'), {
      code: 'RESOURCE_EXHAUSTED',
    });
    assert.deepEqual(archive.read('runtime/large.bin', 268435456), payload);
  } finally {
    archive.close();
  }
  const root = join(dir, 'cell');
  mkdirSync(root, { mode: 0o700 });
  const cell = new CellPreparation(root);
  try {
    await cell.initialize(f.trust, f.floor);
    const result = await cell.stage(archivePath, f.trust, f.authorization);
    assert.equal(result.state, 'VERIFIED');
    const status = cell.status();
    assert.equal(status.accepted, null);
    const transaction = status.transactions[0];
    const { readdirSync } = await import('node:fs');
    const release = readdirSync(join(root, 'releases'));
    assert.equal(release.length, 1);
    assert.deepEqual(
      readFileSync(join(root, 'releases', release[0], 'runtime/large.bin')),
      payload,
    );
    assert.equal(transaction.state, 'VERIFIED');
  } finally {
    cell.close();
  }
});
