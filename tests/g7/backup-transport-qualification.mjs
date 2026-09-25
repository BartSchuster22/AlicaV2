// Standalone real age transport test. NOT Cell custody or restore qualification.
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  chmodSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { rawDigest } from '@alica/acap-contracts';
import { encryptBackup, recoveryRecipientId } from '../../tools/g7-backup.mjs';
import { openArchive } from '../../tools/g7-archive.mjs';
const [parent, age, keygen] = process.argv.slice(2);
const dir = mkdtempSync(join(parent, 'transport-'));
assert.equal(
  rawDigest(readFileSync(keygen)),
  'sha256:0a0009db842259d6717f7eeb30acb6b90d2a2eb924c6acd0a0db0ca1f1537899',
);
const keys = [];
function key(name) {
  const path = join(dir, name);
  assert.equal(spawnSync(keygen, ['-o', path]).status, 0);
  chmodSync(path, 0o600);
  keys.push(path);
  const r = spawnSync(keygen, ['-y', path], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  return { path, recipient: r.stdout.trim() };
}
const right = key('right.txt'),
  wrong = key('wrong.txt');
const output = (name) => {
  const path = join(dir, name);
  mkdirSync(path, { mode: 0o700 });
  return path;
};
let certified = 0;
const entries = [
  ['backup.json', Buffer.from('{"transportFixture":true}')],
  ['opaque.bin', Buffer.alloc(131073, 42)],
];
const destination = output('good');
const result = await encryptBackup(
  entries,
  { age, recipient: right.recipient, destination },
  () => {
    certified++;
  },
);
assert.equal(certified, 2);
assert.deepEqual(readdirSync(destination), ['backup.age']);
const cipher = readFileSync(join(destination, 'backup.age'));
assert.equal(rawDigest(cipher), result.backupCipherDigest);
const decrypt = (bytes, identity) =>
  spawnSync(age, ['-d', '-i', identity], {
    input: bytes,
    maxBuffer: 1048576,
    timeout: 30000,
  });
const plain = decrypt(cipher, right.path);
assert.equal(plain.status, 0);
const tar = join(dir, 'authenticated.tar');
writeFileSync(tar, plain.stdout, { mode: 0o600 });
const archive = openArchive(tar);
assert.equal(archive.entries.length, entries.length);
for (const [name, bytes] of entries)
  assert.deepEqual(archive.read(name), bytes);
archive.close();
unlinkSync(tar);
assert.notEqual(
  recoveryRecipientId(right.recipient),
  recoveryRecipientId(wrong.recipient),
);
assert.throws(() => recoveryRecipientId(right.recipient.toUpperCase()));
assert.throws(() =>
  recoveryRecipientId(
    right.recipient.slice(0, -1) + (right.recipient.endsWith('q') ? 'p' : 'q'),
  ),
);
const denials = [];
for (const [name, bytes, identity] of [
  ['wrong-key', cipher, wrong.path],
  ['truncated', cipher.subarray(0, -1), right.path],
  ['tampered', Buffer.from(cipher), right.path],
  [
    'extra-ciphertext',
    Buffer.concat([cipher, Buffer.from('extra')]),
    right.path,
  ],
]) {
  if (name === 'tampered') bytes[Math.floor(bytes.length / 2)] ^= 1;
  const r = decrypt(bytes, identity);
  assert.notEqual(r.status, 0);
  denials.push({
    name,
    exit: r.status,
    discardedPartialBytes: r.stdout.length,
  });
}
for (const [name, bad] of [
  [
    'duplicate',
    [
      ['a', Buffer.alloc(0)],
      ['a', Buffer.alloc(0)],
    ],
  ],
  [
    'prefix',
    [
      ['a', Buffer.alloc(0)],
      ['a/b', Buffer.alloc(0)],
    ],
  ],
  [
    'case-directory',
    [
      ['A/b', Buffer.alloc(0)],
      ['a/c', Buffer.alloc(0)],
    ],
  ],
  ['traversal', [['../escape', Buffer.alloc(0)]]],
  ['depth', [[Array(17).fill('x').join('/'), Buffer.alloc(0)]]],
  ['path-bytes', [['x'.repeat(241), Buffer.alloc(0)]]],
  ['count', Array.from({ length: 4099 }, (_, i) => ['f' + i, Buffer.alloc(0)])],
]) {
  const dest = output(name);
  await assert.rejects(
    encryptBackup(
      bad,
      { age, recipient: right.recipient, destination: dest },
      () => {},
    ),
  );
  assert.deepEqual(readdirSync(dest), []);
  denials.push({ name });
}
await assert.rejects(
  encryptBackup(
    entries,
    { age, recipient: right.recipient, destination },
    () => {},
  ),
);
const wrongBinary = output('wrong-binary');
await assert.rejects(
  encryptBackup(
    entries,
    { age: keygen, recipient: right.recipient, destination: wrongBinary },
    () => {},
  ),
);
assert.deepEqual(readdirSync(wrongBinary), []);
const revoked = output('final-certification-denied');
let calls = 0;
await assert.rejects(
  encryptBackup(
    entries,
    { age, recipient: right.recipient, destination: revoked },
    () => {
      if (++calls === 2) throw new Error('fixture certification withdrawn');
    },
  ),
);
assert.deepEqual(readdirSync(revoked), ['cipher.partial']);
assert.equal(
  rawDigest(readFileSync(join(destination, 'backup.age'))),
  result.backupCipherDigest,
);
for (const path of keys) unlinkSync(path);
console.log(
  JSON.stringify({
    scope: 'age transport ONLY, no stopped-Cell or restore claim',
    fixture: dir,
    result,
    denials,
    strictUSTAR: true,
    finalCertificationDenied: true,
    privateFixtureKeysRemoved: true,
  }),
);
