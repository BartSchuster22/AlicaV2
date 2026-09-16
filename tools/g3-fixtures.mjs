// Ephemeral synthetic qualification material. Never production signing custody.
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bootstrap, canonical, digest, rawDigest } from '@alica/kernel';
export const echo = JSON.parse(
  readFileSync('specs/examples/capability.valid.json', 'utf8'),
);
export const consumerDescriptor = {
  ...structuredClone(echo),
  id: 'org.alica.consumer',
};
export const requirement = {
  capabilityId: echo.id,
  major: 1,
  minMinor: 0,
  operations: ['echo'],
  features: [],
};
export const consumerRequirement = {
  ...requirement,
  capabilityId: consumerDescriptor.id,
};
export const eventDescriptor = {
  schemaVersion: 'acap.event-descriptor/v1',
  id: 'org.alica.observation',
  version: '1.0.0',
  payload: { type: 'string', maxLength: 128 },
};
export const config = {
  cellId: 'synthetic-cell',
  rootScope: 'root',
  timeTrusted: true,
  maxCallMs: 1000,
  cleanupMs: 50,
  activationMs: 1000,
  eventQueue: 4,
  auditCapacity: 4096,
  maxInstances: 64,
  maxScopes: 64,
  maxGrants: 512,
  maxEffects: 128,
  maxCalls: 64,
};
export function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  return { privateKey, raw, id: rawDigest(raw) };
}
export function signature(data, domain, key) {
  return {
    algorithm: 'ed25519',
    keyId: key.id,
    signature: sign(
      null,
      Buffer.from(domain + '\n' + canonical(data)),
      key.privateKey,
    ).toString('base64'),
  };
}
export function trustMaterial(root, publisher, now, changes = {}) {
  const policy = {
    schemaVersion: 'alica.trust-policy/v1',
    version: 1,
    rootKeyIds: [root.id],
    publishers: [
      {
        id: 'org.alica.synthetic',
        keyIds: [publisher.id],
        executionModes: ['inproc'],
      },
    ],
    issuedAtMs: now - 100,
    expiresAtMs: now + 60000,
    maxOfflineAgeMs: 60000,
    ...changes.policy,
  };
  const revocation = {
    schemaVersion: 'alica.revocation/v1',
    version: 1,
    issuedAtMs: now - 100,
    expiresAtMs: now + 60000,
    revokedKeyIds: [],
    revokedArtifactDigests: [],
    ...changes.revocation,
  };
  return {
    rootKeyId: root.id,
    keys: {
      [root.id]: root.raw.toString('base64'),
      [publisher.id]: publisher.raw.toString('base64'),
    },
    policy,
    policySignature: signature(policy, 'ALICA-TRUST-POLICY-v1', root),
    revocation,
    revocationSignature: signature(revocation, 'ALICA-REVOCATION-v1', root),
  };
}
export function fixture(publisher, options = {}) {
  const id = options.id ?? 'org.alica.echoa';
  const descs = options.provides ?? [structuredClone(echo)];
  const events = options.events ?? [];
  const code =
    options.code ?? readFileSync('packages/echo-a/dist/index.js', 'utf8');
  const files = {};
  const binds = descs.map((d, n) => {
    const p = `contracts/c${n}.json`;
    files[p] = Buffer.from(canonical(d));
    return {
      capabilityId: d.id,
      version: d.version,
      descriptorDigest: digest(d),
      descriptorPath: p,
    };
  });
  const eventBinds = events.map((d, n) => {
    const p = `contracts/e${n}.json`;
    files[p] = Buffer.from(canonical(d));
    return {
      eventType: d.id,
      version: d.version,
      descriptorDigest: digest(d),
      descriptorPath: p,
    };
  });
  const manifest = {
    schemaVersion: 'alica.plugin/v1',
    id,
    version: '1.0.0',
    publisher: 'org.alica.synthetic',
    execution: 'inproc',
    entrypoint: 'dist/index.js',
    provides: binds,
    requires: options.requires ?? [],
    optionalRequires: options.optionalRequires ?? [],
    secretReferences: options.secretReferences ?? [],
    publishedEvents: options.publish ? eventBinds : [],
    subscribedEvents: options.subscribe ? eventBinds : [],
    ...options.manifest,
  };
  files['plugin.json'] = Buffer.from(
    options.manifestText ?? canonical(manifest),
  );
  files['dist/index.js'] = Buffer.from(code);
  for (const [path, bytes] of Object.entries(options.extraFiles ?? {})) {
    if (Object.hasOwn(files, path)) throw new Error('duplicate fixture path');
    files[path] = Buffer.from(bytes);
  }
  const index = {
    schemaVersion: 'alica.package-index/v1',
    pluginId: id,
    version: '1.0.0',
    manifestPath: 'plugin.json',
    files: Object.entries(files)
      .map(([path, bytes]) => ({
        path,
        bytes: bytes.length,
        digest: rawDigest(bytes),
      }))
      .sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
  const indexText = canonical(index);
  const profile = {
    schemaVersion: 'alica.profile/v1',
    profileId: 'org.alica.synthetic',
    version: '1.0.0',
    plugins: [{ id, version: '1.0.0', packageDigest: digest(index) }],
    providerPins: [],
    scopes: [{ id: 'root', parent: null }],
  };
  const bundle = {
    schemaVersion: 'alica.bundle/v1',
    bundleId: 'synthetic',
    profileDigest: digest(profile),
    artifacts: [
      ...index.files.map((x) => ({
        ...x,
        kind: x.path.endsWith('.js')
          ? 'plugin'
          : x.path === 'plugin.json'
            ? 'manifest'
            : 'descriptor',
      })),
      {
        path: 'package-index.json',
        bytes: Buffer.byteLength(indexText),
        digest: rawDigest(indexText),
        kind: 'manifest',
      },
    ],
  };
  return {
    indexText,
    bundleText: canonical(bundle),
    profileText: canonical(profile),
    signature: signature(bundle, 'ALICA-BUNDLE-v1', publisher),
    files,
  };
}
export function environment(t, overrides = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'alica-g3-'));
  const root = keyPair(),
    publisher = keyPair(),
    clock = { offset: 0 };
  const now = () => Date.now() + clock.offset;
  const trust = trustMaterial(root, publisher, now());
  const options = {
    trust,
    statePath: path.join(dir, 'trust-state.json'),
    initialize: true,
    syntheticSecret: 'synthetic-local-value',
    now,
  };
  const settings = { ...config, ...overrides };
  const host = bootstrap(canonical(settings), options);
  const stop = async () => {
    await host.shutdown();
    rmSync(dir, { recursive: true, force: true });
  };
  if (t) t.after(stop);
  const load = (opts, scope) => host.discover(fixture(publisher, opts), scope);
  const grant = (id, resource = echo.id, operations = ['echo'], extra = {}) => {
    const identity = host.identity(id);
    const g = {
      schemaVersion: 'acap.grant/v1',
      grantId: randomUUID(),
      ...identity,
      capabilityId: resource,
      operations,
      issuedAtMs: now() - 1,
      expiresAtMs: now() + 30000,
      revision: 0,
      ...extra,
    };
    if (g.schemaVersion !== 'acap.grant/v1') delete g.capabilityId;
    host.issueGrant(g);
    return g;
  };
  return {
    host,
    root,
    publisher,
    clock,
    now,
    dir,
    options,
    settings,
    load,
    grant,
    stop,
  };
}
export async function stack(t, providers = ['a'], overrides = {}) {
  const e = environment(t, overrides);
  const pids = providers.map((letter) =>
    e.load({
      id: 'org.alica.echo' + letter,
      code: readFileSync(`packages/echo-${letter}/dist/index.js`, 'utf8'),
    }),
  );
  const consumer = e.load({
    id: 'org.alica.consumer',
    provides: [consumerDescriptor],
    requires: [requirement],
    code: readFileSync('packages/echo-consumer/dist/index.js', 'utf8'),
  });
  const client = e.load({
    id: 'org.alica.client',
    provides: [],
    requires: [consumerRequirement],
    code: 'export async function activate() {}',
  });
  e.grant(consumer);
  e.grant(client, consumerDescriptor.id);
  for (const p of pids) await e.host.activate(p);
  await e.host.activate(client);
  const handle = await e.host.context(client).require(consumerRequirement);
  return { ...e, pids, consumer, client, handle };
}
export async function consumerSuite(handle) {
  const results = [];
  for (const text of ['', 'hello', '¡Hola!', '😀', 'x'.repeat(4096)]) {
    const result = await handle.call(
      'echo',
      { text },
      { deadlineMs: Date.now() + 5000 },
    );
    if (result.text !== text || Object.keys(result).length !== 1)
      throw new Error('consumer contract failure');
    results.push({ inputLength: [...text].length, passed: true });
  }
  return results;
}
