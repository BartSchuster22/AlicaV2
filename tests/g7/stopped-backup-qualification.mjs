// Standalone dev fixture: never qualifies same-Cell restore or production key use.
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  lstatSync,
  chmodSync,
  unlinkSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { canonical, parse, rawDigest, digest } from '@alica/acap-contracts';
import { CellPreparation, cellSchema } from '../../tools/g7-cell.mjs';
import { recoveryRecipientId } from '../../tools/g7-backup.mjs';
import { openArchive, writeArchive } from '../../tools/g7-archive.mjs';
import { cellFixture } from './cell-fixture.mjs';
import { trustMaterial } from '../../tools/g3-fixtures.mjs';
const native = createRequire(import.meta.url)(
  '../../native/g7/build/ownership.node',
);
native.guardLauncher();
const [parent, age, keygen] = process.argv.slice(2, 5).map((p) => resolve(p));
const scenario = process.argv[5] || 'capture';
assert.ok(
  [
    'capture',
    'extras',
    'symlink',
    'unfinished',
    'custody-loss',
    'source-change',
    'late-extra',
  ].includes(scenario),
);
const dir = mkdtempSync(join(parent, 'fixture-'));
const keyroot = join(dir, 'recovery-private');
mkdirSync(keyroot, { mode: 0o700 });
assert.equal(
  rawDigest(readFileSync(keygen)),
  'sha256:0a0009db842259d6717f7eeb30acb6b90d2a2eb924c6acd0a0db0ca1f1537899',
);
function key(name) {
  const path = join(keyroot, name);
  const r = spawnSync(keygen, ['-o', path], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  chmodSync(path, 0o600);
  const pub = spawnSync(keygen, ['-y', path], { encoding: 'utf8' });
  assert.equal(pub.status, 0);
  return { path, recipient: pub.stdout.trim() };
}
const right = key('right.txt'),
  wrong = key('wrong.txt');
// Disposable keys are removed on assertion failure too; never print key bytes.
process.on('exit', () => {
  for (const p of [right.path, wrong.path]) if (existsSync(p)) unlinkSync(p);
});
assert.notEqual(
  recoveryRecipientId(right.recipient),
  recoveryRecipientId(wrong.recipient),
);
assert.throws(() =>
  recoveryRecipientId(
    right.recipient.slice(0, -1) + (right.recipient.endsWith('q') ? 'p' : 'q'),
  ),
);
assert.throws(() => recoveryRecipientId('age-plugin-test'));
const f = await cellFixture(dir),
  root = join(dir, 'cell');
mkdirSync(root, { mode: 0o700 });
const input = join(dir, 'operator.json');
const operator = {
  archive: f.archive,
  trust: f.trust,
  authorization: f.authorization,
};
writeFileSync(input, canonical(operator), { mode: 0o600 });
const cell = new CellPreparation(root);
await cell.initialize(f.trust, f.floor);
const snapshot = () =>
  Object.fromEntries(
    readdirSync(root, { recursive: true })
      .sort()
      .flatMap((p) => {
        const s = lstatSync(join(root, p));
        return s.isFile()
          ? [
              [
                p,
                {
                  digest: rawDigest(readFileSync(join(root, p))),
                  ino: s.ino,
                  mode: s.mode,
                  mtime: s.mtimeMs,
                },
              ],
            ]
          : [];
      }),
  );
function destination(name) {
  const p = join(dir, name);
  mkdirSync(p, { mode: 0o700 });
  return p;
}
const options = {
  age,
  recipient: right.recipient,
  destination: destination('backup'),
};
let before = snapshot();
await assert.rejects(cell.ownedBackup(input, options)); // no inception / exact reaps
assert.deepEqual(snapshot(), before);
await cell.ownedBegin(input);
await cell.ownedServe(input);
await assert.rejects(cell.ownedBackup(input, options)); // actively serving; no auto-stop
assert.deepEqual(readdirSync(options.destination), []);
await cell.ownedMaintain(input); // authenticated sealing + exact normally reaped children
before = snapshot();
if (scenario !== 'capture') {
  const acceptedBefore = readFileSync(join(root, 'accepted.json'));
  const release = join(
    root,
    'releases',
    readdirSync(join(root, 'releases'))[0],
  );
  let changed = false;
  const inject = () => {
    if (scenario === 'extras' || scenario === 'late-extra')
      writeFileSync(join(release, 'unexpected.txt'), 'not inventoried', {
        mode: 0o600,
        flag: 'wx',
      });
    if (scenario === 'symlink')
      symlinkSync(input, join(release, 'unexpected-link'));
    if (scenario === 'source-change')
      writeFileSync(
        join(release, 'docs/fixture.txt'),
        'changed during encryption',
        { mode: 0o600 },
      );
    if (scenario === 'unfinished') {
      const txn = join(
        root,
        'transactions',
        readdirSync(join(root, 'transactions'))[0],
      );
      const last = join(txn, readdirSync(txn).sort().at(-1));
      writeFileSync(
        join(dir, 'removed-terminal-record.json'),
        readFileSync(last),
        { mode: 0o600, flag: 'wx' },
      );
      unlinkSync(last); // Deliberate fault in THIS new disposable Cell only.
    }
    changed = true;
  };
  if (scenario === 'custody-loss') {
    const children = readFileSync(
      `/proc/self/task/${process.pid}/children`,
      'utf8',
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const owned = children.filter((pid) => {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
      return (
        cmd.includes(root) &&
        cmd.some((v) => v.endsWith('/g7-owned-coordinator.py'))
      );
    });
    assert.equal(owned.length, 1);
    process.kill(Number(owned[0]), 'SIGKILL'); // Exact live child, never historical Cell.
    await new Promise((resolve) => setTimeout(resolve, 50));
    changed = true;
  }
  const late = ['source-change', 'late-extra'].includes(scenario);
  if (!late && scenario !== 'custody-loss') inject();
  let afterFault = snapshot();
  // The helper yields only after cipher.partial is opened. Inject at that real
  // async boundary, not through a production test hook or fake age executable.
  const pending = cell.ownedBackup(input, options);
  if (late) {
    assert.ok(existsSync(join(options.destination, 'cipher.partial')));
    inject();
    afterFault = snapshot();
  }
  let denial;
  await assert.rejects(pending, (error) => {
    denial = { code: error.code, outcome: error.outcome };
    return true;
  });
  assert.ok(changed);
  assert.deepEqual(readFileSync(join(root, 'accepted.json')), acceptedBefore);
  assert.deepEqual(snapshot(), afterFault);
  assert.ok(!existsSync(join(options.destination, 'backup.age')));
  for (const p of [right.path, wrong.path]) unlinkSync(p);
  const report = {
    scope: 'actual stopped Cell backup denial ONLY',
    scenario,
    fixture: dir,
    denial,
    acceptedUnchanged: true,
    noAdditionalSourceMutation: true,
    noPublishedBackup: true,
    privateFixtureKeysRemoved: true,
    disposition:
      'faulted Cell/fence retained; NO clean teardown or reusable custody claim',
  };
  writeFileSync(
    join(dir, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report));
  process.exit(0); // EOF contains faulted fixture; never reported as exact clean reap.
}
const stale = join(dir, 'stale.json');
writeFileSync(
  stale,
  canonical({
    ...operator,
    authorization: { ...f.authorization, capabilities: [] },
  }),
  { mode: 0o600 },
);
await assert.rejects(cell.ownedBackup(stale, options));
assert.deepEqual(snapshot(), before);
const staleTrust = join(dir, 'stale-trust.json');
writeFileSync(
  staleTrust,
  canonical({
    ...operator,
    trust: trustMaterial(f.root, f.publisher, Date.now() - 120000, {
      policy: { publishers: f.trust.policy.publishers },
    }),
  }),
  { mode: 0o600 },
);
await assert.rejects(cell.ownedBackup(staleTrust, options));
assert.deepEqual(snapshot(), before);
await assert.rejects(
  cell.ownedBackup(input, { ...options, destination: root }),
);
assert.deepEqual(snapshot(), before);
await assert.rejects(cell.ownedBackup(input, { ...options, age: input })); // wrong executable pin
assert.deepEqual(snapshot(), before);
assert.deepEqual(readdirSync(options.destination), []);
const result = await cell.ownedBackup(input, options);
assert.deepEqual(snapshot(), before);
assert.deepEqual(readdirSync(options.destination), ['backup.age']);
const cipherPath = join(options.destination, 'backup.age'),
  cipher = readFileSync(cipherPath);
assert.equal(result.backupCipherDigest, rawDigest(cipher));
await assert.rejects(cell.ownedBackup(input, options)); // no overwrite
assert.deepEqual(snapshot(), before);
assert.equal(rawDigest(readFileSync(cipherPath)), result.backupCipherDigest);
await cell.ownedFinish();
cell.close();
// Owner-fixture decryption is TEST ONLY and outside Cell; authenticate before parsing.
function decrypt(data, identity) {
  return spawnSync(age, ['--decrypt', '--identity', identity], {
    input: data,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30000,
  });
}
const good = decrypt(cipher, right.path);
assert.equal(good.status, 0);
const plain = join(keyroot, 'authenticated.tar');
writeFileSync(plain, good.stdout, { mode: 0o600 });
const archive = openArchive(plain);
const manifest = cellSchema('backup', parse(archive.read('backup.json')));
assert.equal(manifest.cellId, result.cellId);
assert.equal(digest(manifest.accepted), result.acceptedDigest);
assert.equal(manifest.recoveryKeyId, recoveryRecipientId(right.recipient));
assert.deepEqual(
  archive.entries
    .filter((e) => e.path !== 'backup.json')
    .map(({ path, bytes, digest }) => ({ path, bytes, digest })),
  manifest.files.map(({ path, bytes, digest }) => ({ path, bytes, digest })),
);
for (const item of manifest.files) {
  assert.equal(rawDigest(archive.read(item.path)), item.digest);
  assert.equal(rawDigest(readFileSync(join(root, item.path))), item.digest);
  assert.ok(
    !/(supervision|g6-|recovery-private|cipher.partial)/.test(item.path),
  );
}
archive.close();
const failures = [];
for (const [name, data, identity] of [
  ['wrong-key', cipher, wrong.path],
  ['truncated', cipher.subarray(0, -1), right.path],
  ['tampered', Buffer.from(cipher), right.path],
  [
    'extra-ciphertext',
    Buffer.concat([cipher, Buffer.from('extra')]),
    right.path,
  ],
]) {
  if (name === 'tampered') data[Math.floor(data.length / 2)] ^= 1;
  const r = decrypt(data, identity);
  assert.notEqual(r.status, 0);
  // Partial plaintext is deliberately not parsed/extracted/published.
  failures.push({
    name,
    exit: r.status,
    partialPlaintextBytes: r.stdout.length,
  });
}
assert.deepEqual(snapshot(), before);
assert.equal(rawDigest(readFileSync(cipherPath)), result.backupCipherDigest);
// Authenticated AEAD alone does not permit extra archive content.
const extra = join(keyroot, 'extra.tar');
writeArchive(extra, [['unexpected.txt', Buffer.from('extra')]]);
const extraArchive = openArchive(extra);
assert.throws(() => extraArchive.read('backup.json'));
extraArchive.close();
// Remove only disposable fixture private material, never Cell/fence or diagnostics.
unlinkSync(right.path);
unlinkSync(wrong.path);
unlinkSync(plain);
unlinkSync(extra);
const report = {
  scope:
    'actual owned stopped encrypted capture; TEST decryption, NOT restore acceptance',
  fixture: dir,
  result,
  manifestDigest: rawDigest(Buffer.from(canonical(manifest))),
  exclusions:
    'no local-secret store exists in current empty-secret IPC profile; no production key; no restore publication',
  negative: [
    'unowned',
    'active-source',
    'stale-authorization',
    'expired-root-signed-trust',
    'source-destination-overlap',
    'wrong-age-pin',
    'overwrite',
    'bad-recipient',
    ...failures,
  ],
  sourceUnchanged: true,
  backupUnchanged: true,
  privateFixtureKeysRemoved: true,
};
writeFileSync(
  join(dir, 'report.json'),
  JSON.stringify(report, null, 2) + '\n',
  { mode: 0o600 },
);
console.log(JSON.stringify(report));
