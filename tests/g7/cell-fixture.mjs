// Disposable signed archives, real compiled consumer; fixture SBOM/runtime NOT distributable.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { bootstrap, canonical, digest, rawDigest, parse } from '@alica/kernel';
import {
  keyPair,
  signature,
  trustMaterial,
  fixture,
  config,
  echo,
  consumerDescriptor,
  requirement,
  consumerRequirement,
} from '../../tools/g3-fixtures.mjs';
import { assembleRelease, artifactKind } from '../../tools/g7-release.mjs';
export async function cellFixture(
  dir,
  { providerCode, grantLifetimeMs = 30000 } = {},
) {
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
  const floor = {
    rootKeyId: root.id,
    policyVersion: 1,
    revocationVersion: 1,
    lastWallMs: Date.now(),
  };
  const packages = [
    fixture(
      publisher,
      providerCode === undefined ? {} : { code: providerCode },
    ),
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
    files['code/index.js'] = flat.files['dist/index.js'];
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
    profileId: 'org.alica.celltest',
    version: '1.0.0',
    plugins: packages.map((p) => {
      const i = parse(p.indexText);
      return { id: i.pluginId, version: i.version, packageDigest: digest(i) };
    }),
    providerPins: [],
    scopes: [{ id: 'root', parent: null }],
  };
  const authorization = {
    schemaVersion: 'alica.cell-authorization/v1',
    profileDigest: digest(profile),
    capabilities: [
      [1, echo.id],
      [2, consumerDescriptor.id],
    ].map(([i, capabilityId]) => ({
      principal: profile.plugins[i].id,
      scope: 'root',
      capabilityId,
      operations: ['echo'],
      lifetimeMs: grantLifetimeMs,
    })),
    secrets: [],
    events: [],
  };
  const files = new Map();
  for (const p of packages) {
    files.set(p.packagePrefix + 'index.json', Buffer.from(p.indexText));
    for (const [path, b] of Object.entries(p.files))
      files.set(p.packagePrefix + path, b);
  }
  files.set('profile/profile.json', Buffer.from(canonical(profile)));
  for (const [path, text] of [
    ['runtime/fixture.txt', 'Not shipped'],
    ['schemas/fixture.json', '{}'],
    ['docs/fixture.txt', 'Not qualified'],
    ['sbom/sbom.json', '{"fixture":true}'],
    ['provenance/build.json', '{"fixture":true}'],
  ])
    files.set(path, Buffer.from(text));
  for (const [n, v] of [
    ['policy', trust.policy],
    ['policy-signature', trust.policySignature],
    ['revocation', trust.revocation],
    ['revocation-signature', trust.revocationSignature],
  ])
    files.set('trust/' + n + '.json', Buffer.from(canonical(v)));
  const bundle = {
    schemaVersion: 'alica.bundle/v1',
    bundleId: 'cell-test',
    profileDigest: digest(profile),
    artifacts: [],
  };
  const refresh = () => {
    bundle.artifacts = [...files].map(([path, b]) => ({
      path,
      bytes: b.length,
      digest: rawDigest(b),
      kind: artifactKind(path),
    }));
  };
  refresh();
  const h = bootstrap(canonical(config), {
    trust,
    statePath: join(dir, 'fixture-kernel.json'),
    initialize: true,
  });
  try {
    const ids = new Map();
    for (const p of packages)
      ids.set(
        parse(p.indexText).pluginId,
        h.discoverReleasePackage({
          ...p,
          bundleText: canonical(bundle),
          profileText: canonical(profile),
          signature: signature(bundle, 'ALICA-BUNDLE-v1', publisher),
        }),
      );
    for (const c of authorization.capabilities)
      h.issueGrant({
        schemaVersion: 'acap.grant/v1',
        grantId: randomUUID(),
        ...h.identity(ids.get(c.principal)),
        capabilityId: c.capabilityId,
        operations: c.operations,
        issuedAtMs: Date.now() - 1,
        expiresAtMs: Date.now() + c.lifetimeMs,
        revision: 0,
      });
    files.set(
      'profile/lock.json',
      Buffer.from(canonical(h.plan(canonical(profile)).lock)),
    );
  } finally {
    await h.shutdown();
  }
  refresh();
  const archive = join(dir, 'candidate.tar');
  assembleRelease(
    archive,
    Buffer.from(canonical(bundle)),
    Buffer.from(canonical(signature(bundle, 'ALICA-BUNDLE-v1', publisher))),
    files,
  );
  return {
    archive,
    trust,
    floor,
    authorization,
    root,
    publisher,
    files,
    bundle,
  };
}
