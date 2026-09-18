import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { canonical, digest, rawDigest } from '@alica/acap-contracts';
import { CellPreparation } from '../../tools/g7-cell.mjs';
import { assembleRelease, artifactKind } from '../../tools/g7-release.mjs';
import { cellFixture } from './cell-fixture.mjs';
import { signature } from '../../tools/g3-fixtures.mjs';

function snapshot(root) {
  const result = {};
  function visit(path = '') {
    const file = join(root, path),
      s = lstatSync(file);
    result[path] = { mode: s.mode, ino: s.ino, mtimeMs: s.mtimeMs };
    if (s.isDirectory()) {
      for (const name of readdirSync(file).sort())
        visit(path ? path + '/' + name : name);
    } else if (s.isFile()) {
      const bytes = readFileSync(file);
      result[path].bytes = bytes.length;
      result[path].sha256 = createHash('sha256').update(bytes).digest('hex');
    } else assert.fail('unexpected non-regular Cell residue');
  }
  visit();
  return result;
}
function receipt(name, before, after) {
  if (!process.env.G7_LIFECYCLE_EVIDENCE) return;
  mkdirSync(process.env.G7_LIFECYCLE_EVIDENCE, {
    recursive: true,
    mode: 0o700,
  });
  writeFileSync(
    join(process.env.G7_LIFECYCLE_EVIDENCE, name + '.json'),
    JSON.stringify({ before, after }, null, 2),
    { mode: 0o600, flag: 'wx' },
  );
}
async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'g7-reinstall-'));
  const f = await cellFixture(dir),
    root = join(dir, 'cell');
  // The signed release retains revocation v1; public Kernel persists current v2.
  // This lets the same-version-equivocation test reach Kernel-owned continuity.
  f.trust.revocation.version = 2;
  f.trust.revocationSignature = signature(
    f.trust.revocation,
    'ALICA-REVOCATION-v1',
    f.root,
  );
  mkdirSync(root, { mode: 0o700 });
  const cell = new CellPreparation(root);
  t.after(async () => {
    await cell.shutdown();
    cell.close();
    rmSync(dir, { recursive: true });
  });
  await cell.initialize(f.trust, f.floor);
  const installed = await cell.install(f.archive, f.trust, f.authorization);
  assert.equal(installed.runtime, 'RUNNING');
  const report = await cell.shutdown();
  assert.equal(report.unsettledWork, 0);
  assert(report.instances.every((i) => i.state === 'DISPOSED'));
  assert.equal(cell.status().runtime, 'STOPPED');
  return { ...f, dir, rootPath: root, cell };
}

test('exact reinstall under continuous same-owner clean custody is a byte/inode/mtime preserving no-op, repeatedly', async (t) => {
  const f = await setup(t),
    before = snapshot(f.rootPath),
    accepted = f.cell.status().accepted;
  for (let i = 0; i < 2; i++) {
    const result = await f.cell.install(f.archive, f.trust, f.authorization);
    assert.equal(result.runtime, 'STOPPED');
    assert.equal(canonical(result.accepted), canonical(accepted));
    assert.deepEqual(
      result.transactions.map((v) => v.state),
      ['COMMITTED'],
    );
    assert.deepEqual(snapshot(f.rootPath), before);
  }
  // Separate process, not a same-process flock shortcut.
  const contender = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { CellPreparation } from './tools/g7-cell.mjs'; new CellPreparation(process.argv[1]);`,
      f.rootPath,
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(contender.status, 0);
  receipt('exact-noop', before, snapshot(f.rootPath));
});

for (const kind of [
  'retained-artifact',
  'retained-extra',
  'retained-missing',
  'authorization',
  'accepted',
  'journal',
  'kernel-malformed',
  'kernel-backward-clock',
  'floor-backward-clock',
  'expired',
  'revoked-bundle',
  'revoked-publisher',
  'revoked-package',
  'same-version-equivocation',
  'missing-trust',
  'candidate-tamper',
  'different-valid-candidate',
]) {
  test('exact reinstall fails closed without writes: ' + kind, async (t) => {
    const f = await setup(t),
      prefix = join(f.rootPath, 'releases', digest(f.bundle).slice(7));
    const json = (path) => JSON.parse(readFileSync(path));
    const write = (path, v) => writeFileSync(path, canonical(v));
    if (kind === 'retained-artifact')
      writeFileSync(join(prefix, 'docs/fixture.txt'), 'tampered');
    if (kind === 'retained-extra')
      writeFileSync(join(prefix, 'docs/extra.txt'), 'extra', { mode: 0o600 });
    if (kind === 'retained-missing')
      rmSync(join(prefix, 'runtime/fixture.txt'));
    if (kind === 'authorization') f.authorization.capabilities[0].lifetimeMs--;
    if (kind === 'accepted') {
      const path = join(f.rootPath, 'accepted.json'),
        a = json(path);
      a.sequence++;
      write(path, a);
    }
    if (kind === 'journal') {
      const tx = readdirSync(join(f.rootPath, 'transactions'))[0];
      writeFileSync(join(f.rootPath, 'transactions', tx, '000004.json'), '{}');
    }
    if (kind === 'kernel-malformed')
      writeFileSync(join(f.rootPath, 'kernel.json'), '{}');
    if (kind === 'kernel-backward-clock' || kind === 'floor-backward-clock') {
      const path = join(
          f.rootPath,
          kind.startsWith('kernel') ? 'kernel.json' : 'floor.json',
        ),
        v = json(path);
      // Test-only corruption, never production interpretation/rewriting of opaque state.
      v[kind.startsWith('kernel') ? 'timeMs' : 'lastWallMs'] =
        Date.now() + 60000;
      write(path, v);
    }
    if (
      [
        'expired',
        'revoked-bundle',
        'revoked-publisher',
        'revoked-package',
        'same-version-equivocation',
      ].includes(kind)
    ) {
      const r = f.trust.revocation;
      if (kind !== 'same-version-equivocation') r.version++;
      if (kind === 'expired') r.expiresAtMs = Date.now() - 1;
      if (kind === 'revoked-bundle')
        r.revokedArtifactDigests.push(digest(f.bundle));
      if (kind === 'revoked-publisher') r.revokedKeyIds.push(f.publisher.id);
      if (kind === 'revoked-package')
        r.revokedArtifactDigests.push(
          JSON.parse(f.files.get('profile/profile.json')).plugins[0]
            .packageDigest,
        );
      if (kind === 'same-version-equivocation') r.expiresAtMs++;
      f.trust.revocationSignature = signature(r, 'ALICA-REVOCATION-v1', f.root);
    }
    if (kind === 'missing-trust') delete f.trust.revocationSignature;
    if (kind === 'candidate-tamper') {
      const b = readFileSync(f.archive);
      b[b.length - 1] = 1;
      writeFileSync(f.archive, b);
    }
    if (kind === 'different-valid-candidate') {
      f.files.set(
        'docs/fixture.txt',
        Buffer.from('a distinct signed candidate'),
      );
      f.bundle.artifacts = [...f.files].map(([path, b]) => ({
        path,
        bytes: b.length,
        digest: rawDigest(b),
        kind: artifactKind(path),
      }));
      f.archive = join(f.dir, 'different.tar');
      assembleRelease(
        f.archive,
        Buffer.from(canonical(f.bundle)),
        Buffer.from(
          canonical(signature(f.bundle, 'ALICA-BUNDLE-v1', f.publisher)),
        ),
        f.files,
      );
    }
    const before = snapshot(f.rootPath);
    await assert.rejects(f.cell.install(f.archive, f.trust, f.authorization));
    const after = snapshot(f.rootPath);
    assert.deepEqual(after, before);
    receipt(kind, before, after);
  });
}

test('normal owner close/reopen cannot reconstruct clean custody from accepted bytes or journal', async (t) => {
  const f = await setup(t);
  f.cell.close();
  const next = new CellPreparation(f.rootPath),
    before = snapshot(f.rootPath);
  try {
    assert.equal(next.status().runtime, 'NEEDS_OPERATOR');
    await next.shutdown(); // no host is not a clean shutdown certificate
    await assert.rejects(next.install(f.archive, f.trust, f.authorization), {
      code: 'FAILED_PRECONDITION',
    });
    assert.deepEqual(snapshot(f.rootPath), before);
  } finally {
    next.close();
  }
});
