// Actual pinned age transport/parser tests; NO source-custody or Cell qualification.
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  existsSync,
  unlinkSync,
  readdirSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { rawDigest } from '@alica/acap-contracts';
import { stageBackupTransport } from '../../tools/g7-restore.mjs';
import { tarHeader } from '../../tools/g7-archive.mjs';
const [parent, age, keygen] = process.argv.slice(2).map((p) => resolve(p));
const root = mkdtempSync(join(parent, 'transport-'));
function dir(name) {
  const p = join(root, name);
  mkdirSync(p, { mode: 0o700 });
  return p;
}
const keys = dir('private-keys'),
  keyPaths = [];
process.on('exit', () => {
  for (const p of keyPaths) if (existsSync(p)) unlinkSync(p);
});
assert.equal(
  rawDigest(readFileSync(keygen)),
  'sha256:0a0009db842259d6717f7eeb30acb6b90d2a2eb924c6acd0a0db0ca1f1537899',
);
function key(name) {
  const path = join(keys, name);
  keyPaths.push(path);
  assert.equal(spawnSync(keygen, ['-o', path]).status, 0);
  chmodSync(path, 0o600);
  const pub = spawnSync(keygen, ['-y', path], { encoding: 'utf8' });
  assert.equal(pub.status, 0);
  return { path, recipient: pub.stdout.trim() };
}
const right = key('right.txt'),
  wrong = key('wrong.txt');
const data = Buffer.alloc(262144, 42);
function tar(entries) {
  return Buffer.concat([
    ...entries.flatMap(([p, b]) => [
      tarHeader(p, b.length),
      b,
      Buffer.alloc((512 - (b.length % 512)) % 512),
    ]),
    Buffer.alloc(1024),
  ]);
}
const plain = tar([['payload.bin', data]]);
function encrypt(b) {
  const r = spawnSync(age, ['-r', right.recipient], {
    input: b,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(r.status, 0);
  return r.stdout;
}
const original = encrypt(plain),
  input = join(root, 'backup.age');
writeFileSync(input, original, { flag: 'wx', mode: 0o600 });
const destination = dir('valid');
let inspections = 0,
  certifications = 0;
const inspect = (a) => {
  inspections++;
  assert.equal(a.entries.length, 1);
  assert.deepEqual(a.read('payload.bin', data.length), data);
  return { files: 1 };
};
const certify = () => {
  certifications++;
};
const options = { age, cipher: input, identity: right.path, destination };
const success = await stageBackupTransport(
  options,
  rawDigest(original),
  certify,
  inspect,
);
assert.equal(success.accepted, false);
assert.equal(certifications, 2);
assert.equal(inspections, 1);
assert.deepEqual(readFileSync(join(destination, 'validated.tar')), plain);
const denials = [];
async function deny(
  name,
  cipherBytes,
  changes = {},
  validate = inspect,
  cert = certify,
  existing,
) {
  const cipher = join(root, name + '.age');
  writeFileSync(cipher, cipherBytes, { mode: 0o600, flag: 'wx' });
  const dest = existing || dir(name);
  const before = inspections;
  let code;
  await assert.rejects(
    stageBackupTransport(
      { ...options, cipher, ...changes, destination: dest },
      rawDigest(cipherBytes),
      cert,
      validate,
    ),
    (e) => {
      code = e.code;
      return true;
    },
  );
  if (!existing) assert.ok(!existsSync(join(dest, 'validated.tar')));
  assert.ok(!existsSync(join(dest, 'accepted.json')));
  const partial = join(dest, 'plaintext.partial');
  denials.push({
    name,
    code,
    partialPlaintextBytes: existsSync(partial) ? statSync(partial).size : 0,
    inspections: inspections - before,
    destinationUnaccepted: true,
  });
  assert.deepEqual(readFileSync(input), original);
}
await deny('wrong-key', original, { identity: wrong.path });
await deny('truncated', original.subarray(0, -1));
assert.ok(denials.at(-1).partialPlaintextBytes > 0);
const tamper = Buffer.from(original);
tamper[tamper.length - 20] ^= 1;
await deny('tampered', tamper);
await deny('appended', Buffer.concat([original, Buffer.from('extra')]));
assert.ok(denials.every((d) => d.inspections === 0));
await deny('wrong-pin', original, { age: input });
await deny('overwrite', original, {}, inspect, certify, destination);
await deny('malformed-authenticated', encrypt(Buffer.alloc(131072, 65)));
await deny(
  'duplicate',
  encrypt(
    tar([
      ['payload.bin', data],
      ['payload.bin', data],
    ]),
  ),
);
await deny(
  'case-collision',
  encrypt(
    tar([
      ['payload.bin', data],
      ['Payload.bin', data],
    ]),
  ),
);
await deny(
  'trailing-tar',
  encrypt(Buffer.concat([plain, Buffer.from('extra')])),
);
await deny(
  'inventory-extra',
  encrypt(
    tar([
      ['payload.bin', data],
      ['extra.bin', Buffer.from('bad')],
    ]),
  ),
);
for (const [name, change] of [
  ['traversal', (b) => b.write('../escape', 0)],
  [
    'symlink',
    (b) => {
      b[156] = 50;
    },
  ],
]) {
  const b = Buffer.from(plain);
  change(b);
  b.fill(32, 148, 156);
  b.write(
    b
      .subarray(0, 512)
      .reduce((x, y) => x + y, 0)
      .toString(8)
      .padStart(7, '0') + '\0',
    148,
  );
  await deny(name, encrypt(b));
}
const link = join(root, 'link.age');
symlinkSync(input, link);
await deny('input-symlink', original, { cipher: link });
let certs = 0;
await deny('authority-withdrawn', original, {}, inspect, () => {
  if (++certs === 2) throw new Error('withdrawn');
});
for (const p of keyPaths) unlinkSync(p);
assert.deepEqual(readdirSync(keys), []);
const report = {
  scope:
    'PASS transport and parser only; guarded Cell integration NOT exercised',
  fixture: root,
  success,
  denials,
  backupUnchanged: true,
  keyDirectoryEmpty: true,
  privateFixtureKeysRemoved: true,
};
writeFileSync(
  join(root, 'report.json'),
  JSON.stringify(report, null, 2) + '\n',
  { mode: 0o600 },
);
console.log(JSON.stringify(report));
