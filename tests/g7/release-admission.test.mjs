// Disposable release keys and actual compiled fixture bytes; not Cell qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrap, canonical, digest, rawDigest, parse } from '@alica/kernel';
import {
  keyPair,
  signature,
  trustMaterial,
  config,
  fixture,
  echo,
  consumerDescriptor,
  requirement,
  consumerRequirement,
  consumerSuite,
} from '../../tools/g3-fixtures.mjs';
import {
  artifactKind,
  assembleRelease,
  inspectRelease,
} from '../../tools/g7-release.mjs';

function release(t) {
  const dir = mkdtempSync(join(tmpdir(), 'alica-release-admission-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = keyPair(),
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
  const packages = [
    fixture(publisher),
    fixture(publisher, {
      id: 'org.alica.consumer',
      provides: [consumerDescriptor],
      requires: [requirement],
      code: readFileSync('packages/echo-consumer/dist/index.js', 'utf8'),
    }),
    fixture(publisher, {
      id: 'org.alica.client',
      provides: [],
      requires: [consumerRequirement],
      code: 'export async function activate() {}',
    }),
  ].map((flat) => {
    const m = parse(flat.files['plugin.json']);
    m.entrypoint = 'code/index.js';
    m.execution = 'ipc';
    m.publisher = 'org.aquiero.alica';
    const files = { ...flat.files };
    delete files['plugin.json'];
    delete files['dist/index.js'];
    files['manifest.json'] = Buffer.from(canonical(m));
    // Relocate, do not rewrite executable bytes.
    files['code/index.js'] = Buffer.from(flat.files['dist/index.js']);
    const index = {
      schemaVersion: 'alica.package-index/v1',
      pluginId: m.id,
      version: m.version,
      manifestPath: 'manifest.json',
      files: Object.entries(files).map(([path, b]) => ({
        path,
        bytes: b.length,
        digest: rawDigest(b),
      })),
    };
    return {
      indexText: canonical(index),
      files,
      packagePrefix: 'plugins/' + m.id + '/',
    };
  });
  const profile = {
    schemaVersion: 'alica.profile/v1',
    profileId: 'org.alica.release',
    version: '1.0.0',
    plugins: packages.map((p) => {
      const i = parse(p.indexText);
      return { id: i.pluginId, version: i.version, packageDigest: digest(i) };
    }),
    providerPins: [],
    scopes: [{ id: 'root', parent: null }],
  };
  const files = new Map();
  for (const p of packages) {
    files.set(p.packagePrefix + 'index.json', Buffer.from(p.indexText));
    for (const [path, b] of Object.entries(p.files))
      files.set(p.packagePrefix + path, b);
  }
  files.set('profile/profile.json', Buffer.from(canonical(profile)));
  files.set('runtime/fixture.txt', Buffer.from('Not a shipped runtime'));
  files.set('schemas/fixture.json', Buffer.from('{}'));
  files.set('docs/fixture.txt', Buffer.from('Not qualified'));
  files.set('sbom/sbom.json', Buffer.from('{"fixture":true}'));
  files.set('provenance/build.json', Buffer.from('{"fixture":true}'));
  for (const [n, v] of [
    ['policy', trust.policy],
    ['policy-signature', trust.policySignature],
    ['revocation', trust.revocation],
    ['revocation-signature', trust.revocationSignature],
  ])
    files.set('trust/' + n + '.json', Buffer.from(canonical(v)));
  const bundle = {
    schemaVersion: 'alica.bundle/v1',
    bundleId: 'test-release',
    profileDigest: digest(profile),
    artifacts: [],
  };
  const f = { dir, root, publisher, trust, packages, profile, files, bundle };
  f.refresh = () => {
    bundle.profileDigest = digest(profile);
    files.set('profile/profile.json', Buffer.from(canonical(profile)));
    bundle.artifacts = [...files].map(([path, b]) => ({
      path,
      bytes: b.length,
      digest: rawDigest(b),
      kind: artifactKind(path),
    }));
  };
  f.envelope = (n = 0) => ({
    ...packages[n],
    files: Object.fromEntries(
      Object.entries(packages[n].files).map(([p, b]) => [p, Buffer.from(b)]),
    ),
    bundleText: canonical(bundle),
    profileText: files.get('profile/profile.json').toString(),
    signature: signature(bundle, 'ALICA-BUNDLE-v1', publisher),
  });
  f.host = (options = {}) => {
    const h = bootstrap(
      canonical({
        ...config,
        activationMs: 5000,
        maxCallMs: 5000,
        cleanupMs: 1000,
      }),
      {
        trust,
        statePath: join(dir, randomUUID()),
        initialize: true,
        ...options,
      },
    );
    t.after(() => h.shutdown());
    return h;
  };
  f.refresh();
  return f;
}

test('public release admission: authentic archive inspection, exact resolution and unchanged IPC consumer', async (t) => {
  const f = release(t),
    h = f.host();
  const inputs = f.packages.map((_, n) => f.envelope(n));
  const ids = inputs.map((p) => h.discoverReleasePackage(p));
  assert.deepEqual(
    inputs[1].files['code/index.js'],
    readFileSync('packages/echo-consumer/dist/index.js'),
  );
  const authorize = (host, instanceIds) => {
    for (const [n, capabilityId] of [
      [1, echo.id],
      [2, consumerDescriptor.id],
    ])
      host.issueGrant({
        schemaVersion: 'acap.grant/v1',
        grantId: randomUUID(),
        ...host.identity(instanceIds[n]),
        capabilityId,
        operations: ['echo'],
        issuedAtMs: Date.now() - 1,
        expiresAtMs: Date.now() + 30000,
        revision: 0,
      });
  };
  authorize(h, ids);
  const plan = h.plan(canonical(f.profile));
  f.files.set('profile/lock.json', Buffer.from(canonical(plan.lock)));
  f.refresh();
  const archive = join(f.dir, 'release.tar');
  assembleRelease(
    archive,
    Buffer.from(canonical(f.bundle)),
    Buffer.from(canonical(f.envelope().signature)),
    f.files,
  );
  const inspected = inspectRelease(archive, f.trust, {
    rootKeyId: f.root.id,
    policyVersion: 1,
    revocationVersion: 1,
    lastWallMs: Date.now(),
  });
  assert.deepEqual(inspected.lock, plan.lock);
  // Discover the final inspected release through a separate Host; no inspector bypass.
  const finalHost = f.host();
  const finalInputs = f.packages.map((_, n) => f.envelope(n));
  const finalIds = finalInputs.map((p) => finalHost.discoverReleasePackage(p));
  authorize(finalHost, finalIds);
  assert.deepEqual(finalHost.plan(canonical(f.profile)).lock, inspected.lock);
  assert.throws(() => finalHost.discoverReleasePackage(finalInputs[0]), {
    code: 'CONFLICT',
  });
  for (const p of finalInputs)
    for (const b of Object.values(p.files)) b.fill(0); // admitted copies must survive mutation
  await finalHost.activate(finalIds[0]);
  await finalHost.activate(finalIds[2]);
  const handle = await finalHost
    .context(finalIds[2])
    .require(consumerRequirement);
  assert.equal((await consumerSuite(handle)).length, 5);
  for (const id of finalIds.toReversed()) await finalHost.dispose(id);
  assert.equal(ids.length, 3);
  t.diagnostic(
    'Real IPC provider -> unchanged compiled consumer -> client: five consumerSuite cases; selected copies survived input mutation. Not Cell activation.',
  );
});

test('admission callback helper is runtime-private, not a public verification bypass', (t) => {
  const f = release(t),
    h = f.host();
  assert.equal(Reflect.get(h, 'discoverVerified'), undefined);
  assert.equal(Reflect.get(h, '#discoverVerified'), undefined);
  assert.throws(() => h.discoverVerified(() => ({}), 'root'), TypeError);
  h.discoverVerified = () => {
    throw new Error('public shadow must never run');
  };
  assert.equal(typeof h.discoverReleasePackage(f.envelope()), 'string');
});

const mutations = [
  [
    'prefix-other-package',
    (e) => {
      e.packagePrefix = 'plugins/org.alica.consumer/';
    },
  ],
  [
    'prefix-traversal',
    (e) => {
      e.packagePrefix += '../';
    },
  ],
  [
    'prefix-case',
    (e) => {
      e.packagePrefix = e.packagePrefix.toUpperCase();
    },
  ],
  [
    'prefix-missing',
    (e) => {
      delete e.packagePrefix;
    },
  ],
  [
    'prefix-empty',
    (e) => {
      e.packagePrefix = '';
    },
  ],
  [
    'raw-index-whitespace',
    (e) => {
      e.indexText += '\n';
    },
  ],
  [
    'raw-profile-whitespace',
    (e) => {
      e.profileText += '\n';
    },
  ],
  [
    'wrong-profile',
    (e) => {
      const p = parse(e.profileText);
      p.profileId = 'org.alica.other';
      e.profileText = canonical(p);
    },
  ],
  [
    'code-byte',
    (e) => {
      e.files['code/index.js'][0] ^= 1;
    },
  ],
  [
    'missing-file',
    (e) => {
      delete e.files['manifest.json'];
    },
  ],
  [
    'extra-file',
    (e) => {
      e.files['code/extra.js'] = Buffer.from('export const x=1');
    },
  ],
  [
    'file-alias',
    (e) => {
      e.files['code/INDEX.js'] = e.files['code/index.js'];
      delete e.files['code/index.js'];
    },
  ],
  [
    'package-transplant',
    (e, f) => {
      Object.assign(e, { ...f.packages[1], files: f.envelope(1).files });
      e.packagePrefix = f.packages[0].packagePrefix;
    },
  ],
  [
    'signature-substitution',
    (e) => {
      e.signature.signature = Buffer.alloc(64).toString('base64');
    },
  ],
  [
    'wrong-signer',
    (e, f) => {
      e.signature = signature(f.bundle, 'ALICA-BUNDLE-v1', f.root);
    },
  ],
  [
    'wrong-domain',
    (e, f) => {
      e.signature = signature(f.bundle, 'ALICA-PROFILE-v1', f.publisher);
    },
  ],
  [
    'release-substitution',
    (e) => {
      const b = parse(e.bundleText);
      b.bundleId = 'another';
      e.bundleText = canonical(b);
    },
  ],
  [
    'one-file-resource-limit',
    (e) => {
      e.files['code/index.js'] = Buffer.alloc(1048577);
    },
  ],
  [
    'flat-envelope-on-release-api',
    (e, f) => {
      Object.assign(e, fixture(f.publisher));
    },
  ],
];
for (const [name, mutate] of mutations)
  test('public release admission rejects ' + name, (t) => {
    const f = release(t),
      e = f.envelope(),
      h = f.host();
    mutate(e, f);
    assert.throws(() => h.discoverReleasePackage(e));
  });

// Re-sign deliberately malformed inventories with the authorized disposable signer:
// signature validity alone must not bypass membership/shape checks.
for (const name of [
  'extra-selected-artifact',
  'wrong-kind',
  'duplicate-path',
  'case-alias',
  'parent-alias',
  'missing-index',
  'index-length',
  'index-digest',
  'profile-kind',
  'profile-length',
  'profile-digest',
  'duplicate-selection',
  'wrong-canonical-package',
  'wrong-canonical-profile',
  'duplicate-index-file',
])
  test('signed release rejects ' + name, (t) => {
    const f = release(t),
      prefix = f.packages[0].packagePrefix;
    if (name === 'duplicate-selection') {
      f.profile.plugins.push(f.profile.plugins[0]);
      f.refresh();
    }
    if (name === 'wrong-canonical-package') {
      f.profile.plugins[0].packageDigest = rawDigest('wrong');
      f.refresh();
    }
    if (name === 'wrong-canonical-profile')
      f.bundle.profileDigest = rawDigest('wrong');
    if (name === 'duplicate-index-file') {
      const i = parse(f.packages[0].indexText);
      i.files.push(i.files[0]);
      f.packages[0].indexText = canonical(i);
      f.files.set(prefix + 'index.json', Buffer.from(canonical(i)));
      f.profile.plugins[0].packageDigest = digest(i);
      f.refresh();
    }
    const a = f.bundle.artifacts.find((a) => a.path === prefix + 'index.json');
    const p = f.bundle.artifacts.find((a) => a.path === 'profile/profile.json');
    if (name === 'extra-selected-artifact')
      f.bundle.artifacts.push({
        ...a,
        path: prefix + 'code/extra.js',
        kind: 'plugin',
      });
    if (name === 'wrong-kind') a.kind = 'plugin';
    if (name === 'duplicate-path') f.bundle.artifacts.push({ ...a });
    if (name === 'case-alias')
      f.bundle.artifacts.push({
        ...a,
        path: 'Plugins/org.alica.echoa/code/extra.js',
      });
    if (name === 'parent-alias')
      f.bundle.artifacts.push({ ...a, path: 'plugins' });
    if (name === 'missing-index')
      f.bundle.artifacts = f.bundle.artifacts.filter((x) => x !== a);
    if (name === 'index-length') a.bytes++;
    if (name === 'index-digest') a.digest = rawDigest('wrong');
    if (name === 'profile-kind') p.kind = 'manifest';
    if (name === 'profile-length') p.bytes++;
    if (name === 'profile-digest') p.digest = rawDigest('wrong');
    assert.throws(() => f.host().discoverReleasePackage(f.envelope()));
  });

for (const target of [
  'signer',
  'release',
  'package',
  'profile',
  'index-raw',
  'code-raw',
])
  test(
    'current revocation denies release ' +
      target +
      ' at discovery and after admission',
    async (t) => {
      const f = release(t),
        e = f.envelope(),
        h = f.host();
      const id = h.discoverReleasePackage(e);
      const r = structuredClone(f.trust.revocation);
      r.version++;
      if (target === 'signer') r.revokedKeyIds.push(f.publisher.id);
      else
        r.revokedArtifactDigests.push(
          {
            release: digest(f.bundle),
            package: digest(parse(e.indexText)),
            profile: digest(f.profile),
            'index-raw': rawDigest(e.indexText),
            'code-raw': rawDigest(e.files['code/index.js']),
          }[target],
        );
      h.updateTrust({
        ...f.trust,
        revocation: r,
        revocationSignature: signature(r, 'ALICA-REVOCATION-v1', f.root),
      });
      assert.throws(() => h.discoverReleasePackage(e), {
        code: 'PERMISSION_DENIED',
      });
      await assert.rejects(h.activate(id));
    },
  );

test('expiry and backward clock deny new release admission without resetting floors', (t) => {
  const f = release(t);
  let now = Date.now();
  const h = f.host({ now: () => now });
  h.discoverReleasePackage(f.envelope());
  now = f.trust.policy.expiresAtMs;
  assert.throws(() => h.discoverReleasePackage(f.envelope()), {
    code: 'PERMISSION_DENIED',
  });
  const g = release(t);
  let clock = Date.now();
  const k = g.host({ now: () => clock });
  k.discoverReleasePackage(g.envelope());
  clock -= 1000;
  assert.throws(() => k.discoverReleasePackage(g.envelope()), {
    code: 'FAILED_PRECONDITION',
  });
});

test('mixed authentic releases cannot transplant signatures, profiles or changed package bytes', (t) => {
  const f = release(t),
    original = f.envelope();
  f.profile.version = '1.0.1';
  f.bundle.bundleId = 'second-release';
  f.refresh();
  const second = f.envelope();
  for (const input of [
    { ...original, signature: second.signature },
    { ...second, signature: original.signature },
    { ...original, profileText: second.profileText },
    { ...second, profileText: original.profileText },
  ])
    assert.throws(() => f.host().discoverReleasePackage(input));
  const other = release(t).envelope();
  assert.throws(() =>
    f
      .host()
      .discoverReleasePackage({ ...original, signature: other.signature }),
  );
  const i = parse(f.packages[0].indexText);
  f.packages[0].files['code/index.js'] = Buffer.from(
    'export async function activate(){}',
  );
  const b = f.packages[0].files['code/index.js'];
  Object.assign(
    i.files.find((a) => a.path === 'code/index.js'),
    { bytes: b.length, digest: rawDigest(b) },
  );
  f.packages[0].indexText = canonical(i);
  f.profile.plugins[0].packageDigest = digest(i);
  f.files.set(
    f.packages[0].packagePrefix + 'index.json',
    Buffer.from(canonical(i)),
  );
  f.files.set(f.packages[0].packagePrefix + 'code/index.js', b);
  f.refresh();
  const changed = f.envelope();
  assert.throws(() =>
    f.host().discoverReleasePackage({
      ...original,
      indexText: changed.indexText,
      files: changed.files,
    }),
  );
  assert.throws(() =>
    f.host().discoverReleasePackage({
      ...changed,
      indexText: original.indexText,
      files: original.files,
    }),
  );
});

test('legacy flat discovery retains positive behavior and stable release-wide rejection', (t) => {
  const f = release(t),
    e = f.envelope();
  assert.throws(() => f.host().discover(e), { code: 'CONTRACT_MISMATCH' });
  const flat = fixture(f.publisher, {
    manifest: { execution: 'ipc', publisher: 'org.aquiero.alica' },
  });
  assert.equal(typeof f.host().discover(flat), 'string');
  assert.throws(() =>
    f
      .host()
      .discoverReleasePackage({ ...flat, packagePrefix: e.packagePrefix }),
  );
});

test('unrelated runtime bytes remain inspector responsibility, not selected-package verification', (t) => {
  const f = release(t);
  // Signed metadata references bytes intentionally not transferred to Kernel.
  const a = f.bundle.artifacts.find((a) => a.path === 'runtime/fixture.txt');
  a.bytes = 268435456;
  a.digest = rawDigest('not supplied');
  assert.equal(typeof f.host().discoverReleasePackage(f.envelope()), 'string');
  assert.throws(() =>
    assembleRelease(
      join(f.dir, 'bad.tar'),
      Buffer.from(canonical(f.bundle)),
      Buffer.from(canonical(f.envelope().signature)),
      f.files,
    ),
  );
});

test('selected package aggregate bound remains 16 MiB with individually bounded files', (t) => {
  const f = release(t),
    p = f.packages[0],
    i = parse(p.indexText);
  for (let n = 0; n < 17; n++) {
    const path = 'code/data' + n,
      b = Buffer.alloc(1048576);
    p.files[path] = b;
    i.files.push({ path, bytes: b.length, digest: rawDigest(b) });
    f.files.set(p.packagePrefix + path, b);
  }
  p.indexText = canonical(i);
  f.files.set(p.packagePrefix + 'index.json', Buffer.from(p.indexText));
  f.profile.plugins[0].packageDigest = digest(i);
  f.refresh();
  assert.throws(() => f.host().discoverReleasePackage(f.envelope()), {
    code: 'RESOURCE_EXHAUSTED',
  });
});
