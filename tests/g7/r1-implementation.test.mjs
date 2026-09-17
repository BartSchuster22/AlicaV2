// Synthetic archives and disposable in-memory signing keys only. Not release evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  statSync,
  symlinkSync,
  chmodSync,
  closeSync,
  readdirSync,
  truncateSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { canonical, digest, rawDigest, parse, bootstrap } from '@alica/kernel';
import {
  keyPair,
  signature,
  trustMaterial,
  config,
} from '../../tools/g3-fixtures.mjs';
import {
  openArchive,
  tarHeader,
  writeArchive,
  safePath,
} from '../../tools/g7-archive.mjs';
import {
  artifactKind,
  assembleRelease,
  inspectRelease,
  verifyCurrentTrust,
} from '../../tools/g7-release.mjs';
import {
  openPrivateRoot,
  durableWrite,
  readPrivate,
} from '../../tools/g7-durable.mjs';
function temp(t) {
  const p = mkdtempSync(join(tmpdir(), 'alica-g7-r1-'));
  t.after(() => rmSync(p, { recursive: true, force: true }));
  return p;
}
function fixture(t) {
  const dir = temp(t),
    root = keyPair(),
    publisher = keyPair();
  const trust = trustMaterial(root, publisher, Date.now(), {
    policy: {
      publishers: [
        {
          id: 'org.aquiero.alica',
          keyIds: [publisher.id],
          executionModes: ['ipc'],
        },
      ],
    },
  });
  const floor = {
    rootKeyId: root.id,
    policyVersion: 1,
    revocationVersion: 1,
    lastWallMs: Date.now(),
  };
  const manifest = {
    schemaVersion: 'alica.plugin/v1',
    id: 'org.aquiero.test',
    version: '1.0.0',
    publisher: 'org.aquiero.alica',
    execution: 'ipc',
    entrypoint: 'code/index.js',
    provides: [],
    requires: [],
    optionalRequires: [],
    secretReferences: [],
    publishedEvents: [],
    subscribedEvents: [],
  };
  const source = Buffer.from('export async function activate(){}');
  const members = new Map([
    ['manifest.json', Buffer.from(canonical(manifest))],
    ['code/index.js', source],
  ]);
  const index = {
    schemaVersion: 'alica.package-index/v1',
    pluginId: manifest.id,
    version: manifest.version,
    manifestPath: 'manifest.json',
    files: [...members]
      .map(([path, b]) => ({ path, bytes: b.length, digest: rawDigest(b) }))
      .sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
  const profile = {
    schemaVersion: 'alica.profile/v1',
    profileId: 'org.aquiero.test',
    version: '1.0.0',
    plugins: [
      {
        id: manifest.id,
        version: manifest.version,
        packageDigest: digest(index),
      },
    ],
    providerPins: [],
    scopes: [{ id: 'root', parent: null }],
  };
  const lock = {
    schemaVersion: 'alica.resolution-lock/v1',
    profileDigest: digest(profile),
    policyDigest: digest(trust.policy),
    plugins: profile.plugins,
    bindings: [],
  };
  const files = new Map(
    [...members].map(([p, b]) => ['plugins/' + manifest.id + '/' + p, b]),
  );
  for (const [p, value] of [
    ['plugins/' + manifest.id + '/index.json', index],
    ['profile/profile.json', profile],
    ['profile/lock.json', lock],
    ['trust/policy.json', trust.policy],
    ['trust/policy-signature.json', trust.policySignature],
    ['trust/revocation.json', trust.revocation],
    ['trust/revocation-signature.json', trust.revocationSignature],
    ['sbom/sbom.json', { testFixture: true, qualification: 'NONE' }],
    ['provenance/build.json', { testFixture: true, qualification: 'NONE' }],
  ])
    files.set(p, Buffer.from(canonical(value)));
  files.set('runtime/fixture.txt', Buffer.from('Not an application runtime'));
  files.set('schemas/fixture.json', Buffer.from('{}'));
  files.set('docs/fixture.txt', Buffer.from('Disposable parser fixture only'));
  function pack(name = 'candidate.tar') {
    const bundle = {
      schemaVersion: 'alica.bundle/v1',
      bundleId: 'disposable-test',
      profileDigest: digest(profile),
      artifacts: [...files].map(([path, b]) => ({
        path,
        bytes: b.length,
        digest: rawDigest(b),
        kind: artifactKind(path),
      })),
    };
    const sig = signature(bundle, 'ALICA-BUNDLE-v1', publisher),
      file = join(dir, name);
    assembleRelease(
      file,
      Buffer.from(canonical(bundle)),
      Buffer.from(canonical(sig)),
      files,
    );
    return { file, bundle, sig };
  }
  return {
    dir,
    root,
    publisher,
    trust,
    floor,
    files,
    pack,
    index,
    profile,
    members,
  };
}
test('R1 actual deterministic USTAR assembly, signature and graph inspection is read-only', (t) => {
  const f = fixture(t),
    a = f.pack(),
    b = f.pack('repeat.tar');
  assert.deepEqual(readFileSync(a.file), readFileSync(b.file));
  const before = statSync(a.file),
    listing = readdirSync(f.dir);
  const result = inspectRelease(a.file, f.trust, f.floor);
  assert.equal(result.bundleDigest, digest(a.bundle));
  assert.equal(result.qualification, 'NOT_QUALIFIED');
  assert.deepEqual(readdirSync(f.dir), listing);
  assert.equal(statSync(a.file).mtimeMs, before.mtimeMs);
});
for (const [name, mutate] of [
  [
    'wrong-domain',
    (f) => {
      f.trust.policySignature = signature(
        f.trust.policy,
        'ALICA-BUNDLE-v1',
        f.root,
      );
    },
  ],
  [
    'expired',
    (f) => {
      f.trust.policy.expiresAtMs = Date.now() - 1;
      f.trust.policySignature = signature(
        f.trust.policy,
        'ALICA-TRUST-POLICY-v1',
        f.root,
      );
    },
  ],
  [
    'revoked-signer',
    (f) => {
      f.trust.revocation.revokedKeyIds = [f.publisher.id];
      f.trust.revocationSignature = signature(
        f.trust.revocation,
        'ALICA-REVOCATION-v1',
        f.root,
      );
    },
  ],
  [
    'future-floor',
    (f) => {
      f.floor.lastWallMs = Date.now() + 100000;
    },
  ],
  [
    'old-policy',
    (f) => {
      f.floor.policyVersion = 2;
    },
  ],
  [
    'wrong-root',
    (f) => {
      f.floor.rootKeyId = f.publisher.id;
    },
  ],
  [
    'inproc-authority',
    (f) => {
      f.trust.policy.publishers[0].executionModes.push('inproc');
      f.trust.policySignature = signature(
        f.trust.policy,
        'ALICA-TRUST-POLICY-v1',
        f.root,
      );
    },
  ],
])
  test('R1 denies ' + name, (t) => {
    const f = fixture(t),
      a = f.pack();
    mutate(f);
    assert.throws(() => inspectRelease(a.file, f.trust, f.floor));
  });
for (const [name, bytes] of [
  ['duplicate-key', Buffer.from('{"a":1,"a":2}')],
  ['unsafe-integer', Buffer.from('{"a":9007199254740992}')],
  ['bad-unicode', Buffer.from('{"a":"\\ud800"}')],
  ['depth', Buffer.from('['.repeat(34) + '0' + ']'.repeat(34))],
  ['utf8', Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125])],
  ['size', Buffer.alloc(1048577, 32)],
])
  test('R1 rejects ' + name + ' through real archive decoding', (t) => {
    const f = fixture(t);
    f.files.set('profile/lock.json', bytes);
    const a = f.pack();
    assert.throws(() => inspectRelease(a.file, f.trust, f.floor));
  });
test('R1 rejects unknown closed lock fields and wrong policy binding', (t) => {
  const f = fixture(t);
  const l = parse(f.files.get('profile/lock.json'));
  l.extra = true;
  f.files.set('profile/lock.json', Buffer.from(canonical(l)));
  assert.throws(() => inspectRelease(f.pack().file, f.trust, f.floor));
  delete l.extra;
  l.policyDigest = rawDigest('different');
  f.files.set('profile/lock.json', Buffer.from(canonical(l)));
  assert.throws(() =>
    inspectRelease(f.pack('other.tar').file, f.trust, f.floor),
  );
});
function checksum(h) {
  h.fill(32, 148, 156);
  h.write(
    h
      .reduce((a, b) => a + b, 0)
      .toString(8)
      .padStart(7, '0') + '\0',
    148,
    'ascii',
  );
}
for (const [name, change] of [
  [
    'checksum',
    (b) => {
      b[148] ^= 1;
    },
  ],
  [
    'symlink',
    (b) => {
      b[156] = 50;
      checksum(b.subarray(0, 512));
    },
  ],
  [
    'hardlink',
    (b) => {
      b[156] = 49;
      checksum(b.subarray(0, 512));
    },
  ],
  [
    'directory',
    (b) => {
      b[156] = 53;
      checksum(b.subarray(0, 512));
    },
  ],
  [
    'pax',
    (b) => {
      b[156] = 120;
      checksum(b.subarray(0, 512));
    },
  ],
  [
    'gnu',
    (b) => {
      b[263] = 32;
      checksum(b.subarray(0, 512));
    },
  ],
  [
    'base256',
    (b) => {
      b[124] = 128;
      checksum(b.subarray(0, 512));
    },
  ],
  [
    'nul-alias',
    (b) => {
      b[0] = 97;
      b[1] = 0;
      b[2] = 98;
      checksum(b.subarray(0, 512));
    },
  ],
  [
    'traversal',
    (b) => {
      b.fill(0, 0, 100);
      b.write('../x');
      checksum(b.subarray(0, 512));
    },
  ],
  [
    'padding',
    (b) => {
      b[513] = 1;
    },
  ],
  [
    'tail',
    (b) => {
      b[b.length - 1] = 1;
    },
  ],
  [
    'link-target',
    (b) => {
      b[157] = 97;
      checksum(b.subarray(0, 512));
    },
  ],
])
  test('USTAR rejects ' + name, (t) => {
    const d = temp(t),
      p = join(d, 'bad.tar');
    writeArchive(p, [['a', Buffer.from('x')]]);
    const b = readFileSync(p);
    change(b);
    writeFileSync(p, b);
    assert.throws(() => openArchive(p));
  });
test('USTAR exact EOF, duplicate/case aliases, path bounds and symlink input', (t) => {
  const d = temp(t),
    p = join(d, 'a.tar');
  writeArchive(p, [['a', Buffer.from('x')]]);
  const b = readFileSync(p);
  for (const [n, v] of [
    ['extra', Buffer.concat([b, Buffer.alloc(512)])],
    ['truncated', b.subarray(0, b.length - 1)],
    ['duplicate', Buffer.concat([b.subarray(0, 1024), b])],
  ]) {
    const q = join(d, n);
    writeFileSync(q, v);
    assert.throws(() => openArchive(q));
  }
  assert.throws(() =>
    writeArchive(join(d, 'case'), [
      ['A', Buffer.alloc(0)],
      ['a', Buffer.alloc(0)],
    ]),
  );
  assert.throws(() => safePath('a/'.repeat(16) + 'b'));
  assert.throws(() => safePath('x'.repeat(241)));
  assert.throws(() => safePath('runtime/@alica/x'));
  symlinkSync(p, join(d, 'link'));
  assert.throws(() => openArchive(join(d, 'link')));
  assert.throws(() => tarHeader('a', 268435457));
});
test('USTAR rechecks descriptor bytes after source modification', (t) => {
  const d = temp(t),
    p = join(d, 'a');
  writeArchive(p, [['a', Buffer.from('x')]]);
  const a = openArchive(p);
  try {
    const b = readFileSync(p);
    b[512] = 121;
    writeFileSync(p, b);
    assert.throws(() => a.read('a'));
  } finally {
    a.close();
  }
});
test('durable owner-only no-follow writes and exclusive publication', (t) => {
  const d = temp(t),
    fd = openPrivateRoot(d);
  t.after(() => closeSync(fd));
  durableWrite(fd, 'journal/1.json', Buffer.from('{}'));
  assert.equal(readPrivate(fd, 'journal/1.json').toString(), '{}');
  assert.throws(() =>
    durableWrite(fd, 'journal/1.json', Buffer.from('changed')),
  );
  assert.equal(readPrivate(fd, 'journal/1.json').toString(), '{}');
  symlinkSync('/tmp', join(d, 'escape'));
  assert.throws(() => durableWrite(fd, 'escape/x', Buffer.from('x')));
  chmodSync(join(d, 'journal'), 0o755);
  assert.throws(() => readPrivate(fd, 'journal/1.json'));
});
for (const boundary of [
  'open',
  'write',
  'file-fsync',
  'rename',
  'directory-fsync',
])
  test('real SIGKILL at durable replacement ' + boundary, async (t) => {
    const d = temp(t),
      fd = openPrivateRoot(d);
    try {
      durableWrite(fd, 'accepted.json', Buffer.from('prior'));
    } finally {
      closeSync(fd);
    }
    const child = spawn(
      process.execPath,
      ['tests/g7/durable-worker.mjs', d, boundary],
      { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
    );
    t.after(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    });
    const exit = once(child, 'exit');
    const reached = await Promise.race([
      once(child, 'message'),
      exit.then(() => {
        throw new Error('worker exited before boundary');
      }),
    ]);
    assert.equal(reached[0], boundary);
    child.kill('SIGKILL');
    const [, signal] = await exit;
    assert.equal(signal, 'SIGKILL');
    // A fresh process reads the surviving bytes, not the killed writer's memory.
    const reader = spawn(
      process.execPath,
      ['tests/g7/durable-worker.mjs', d, 'read'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    reader.stdout.on('data', (b) => (output += b));
    const [code] = await once(reader, 'exit');
    assert.equal(code, 0);
    assert.ok(['prior', 'target'].includes(output));
    assert.equal(
      output,
      ['rename', 'directory-fsync'].includes(boundary) ? 'target' : 'prior',
    );
  });
test('public Kernel admission boundary: release-wide signature is not a per-package signature', async (t) => {
  const f = fixture(t),
    a = f.pack();
  assert.equal(
    inspectRelease(a.file, f.trust, f.floor).qualification,
    'NOT_QUALIFIED',
  );
  const host = bootstrap(canonical(config), {
    trust: f.trust,
    statePath: join(f.dir, 'kernel-water.json'),
    initialize: true,
  });
  try {
    assert.throws(
      () =>
        host.discover({
          indexText: canonical(f.index),
          bundleText: canonical(a.bundle),
          profileText: canonical(f.profile),
          signature: a.sig,
          files: Object.fromEntries(f.members),
        }),
      { code: 'CONTRACT_MISMATCH' },
    );
  } finally {
    await host.shutdown();
  }
});
test('read-only inspection CLI actually runs and redacts failure paths', (t) => {
  const f = fixture(t),
    a = f.pack(),
    trustPath = join(f.dir, 'trust.json'),
    floorPath = join(f.dir, 'floor.json');
  writeFileSync(trustPath, canonical(f.trust));
  writeFileSync(floorPath, canonical(f.floor));
  const before = readdirSync(f.dir);
  const run = spawnSync(
    process.execPath,
    ['tools/g7-inspect.mjs', a.file, trustPath, floorPath],
    { encoding: 'utf8', timeout: 10000 },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).bundleDigest, digest(a.bundle));
  assert.deepEqual(readdirSync(f.dir), before);
  const bad = spawnSync(
    process.execPath,
    ['tools/g7-inspect.mjs', join(f.dir, 'private-path'), trustPath, floorPath],
    { encoding: 'utf8', timeout: 10000 },
  );
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, '');
  assert.ok(!bad.stderr.includes(f.dir));
  assert.equal(JSON.parse(bad.stderr).qualification, 'NOT_QUALIFIED');
});
test('trust verifier does not write floors', (t) => {
  const f = fixture(t),
    before = canonical(f.floor);
  verifyCurrentTrust(f.trust, f.floor);
  assert.equal(canonical(f.floor), before);
});
test('USTAR enforces real input size, entry count and parent aliases', (t) => {
  const d = temp(t),
    large = join(d, 'large');
  writeFileSync(large, '');
  truncateSync(large, 1073741825);
  assert.throws(() => openArchive(large), { code: 'RESOURCE_EXHAUSTED' });
  const count = join(d, 'count');
  writeFileSync(
    count,
    Buffer.concat([
      ...Array.from({ length: 4099 }, (_, i) => tarHeader('f' + i, 0)),
      Buffer.alloc(1024),
    ]),
  );
  assert.throws(() => openArchive(count), { code: 'RESOURCE_EXHAUSTED' });
  for (const paths of [
    ['A/x', 'a/y'],
    ['a', 'a/b'],
    ['a/b', 'a'],
  ]) {
    assert.throws(
      () =>
        writeArchive(
          join(d, 'collision'),
          paths.map((p) => [p, Buffer.alloc(0)]),
        ),
      { code: 'CONFLICT' },
    );
  }
});
test('USTAR supports canonical long paths without prefix aliases', (t) => {
  const d = temp(t),
    p = join(d, 'long'),
    name = 'a'.repeat(80) + '/' + 'b'.repeat(30);
  writeArchive(p, [[name, Buffer.from('long')]]);
  const a = openArchive(p);
  try {
    assert.equal(a.read(name).toString(), 'long');
  } finally {
    a.close();
  }
  const b = readFileSync(p);
  b.fill(0, 0, 100);
  b.write('short', 0);
  b.fill(0, 345, 500);
  b.write('prefix', 345);
  checksum(b.subarray(0, 512));
  writeFileSync(p, b);
  assert.throws(() => openArchive(p));
});
test('release inventory rejects corrupt payloads, extra files and missing inventory members', (t) => {
  const f = fixture(t),
    a = f.pack();
  const archive = openArchive(a.file);
  const offset = archive.entries.find(
    (e) => e.path === 'runtime/fixture.txt',
  ).position;
  archive.close();
  const b = readFileSync(a.file);
  b[offset] ^= 1;
  writeFileSync(a.file, b);
  assert.throws(() => inspectRelease(a.file, f.trust, f.floor), {
    code: 'CONTRACT_MISMATCH',
  });
  const original = f.pack('original.tar');
  const bytes = readFileSync(original.file);
  const extra = join(f.dir, 'extra.tar');
  writeFileSync(
    extra,
    Buffer.concat([
      bytes.subarray(0, bytes.length - 1024),
      tarHeader('docs/extra', 0),
      Buffer.alloc(1024),
    ]),
  );
  assert.throws(() => inspectRelease(extra, f.trust, f.floor));
  f.files.delete('runtime/fixture.txt');
  assert.throws(() =>
    assembleRelease(
      join(f.dir, 'missing'),
      Buffer.from(canonical(original.bundle)),
      Buffer.from(canonical(original.sig)),
      f.files,
    ),
  );
});
