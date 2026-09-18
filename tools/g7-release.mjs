// Independent, read-only R1 release inspection using only public contracts.
// This is not Kernel admission and does not claim SBOM completeness/qualification.
import { createPublicKey, verify } from 'node:crypto';
import {
  check,
  parse,
  schema,
  canonical,
  digest,
  rawDigest,
  validateProfile,
  validatePlugin,
  descriptor,
  version,
  freeze,
} from '@alica/acap-contracts';
import { openArchive, safePath, writeArchive } from './g7-archive.mjs';
import { readPrivate, listPrivate } from './g7-durable.mjs';
import { readFileSync } from 'node:fs';
const limits = JSON.parse(
  readFileSync(new URL('../docs/g7/draft/limits.json', import.meta.url)),
);

// Reinspect the actual retained release, not a reconstructed archive or caller report.
export function inspectStoredRelease(fd, prefix, material, floor) {
  const read = (p) => readPrivate(fd, prefix + '/' + p, limits.fileBytes);
  const bundle = schema('bundle', parse(read('bundle.json')));
  const paths = [
    'bundle.json',
    'bundle-signature.json',
    ...bundle.artifacts.map((a) => a.path),
    'authorization.json',
  ];
  check(new Set(paths).size === paths.length, 'CONFLICT');
  const directories = new Map([['', new Set()]]);
  for (const path of paths) {
    const parts = safePath(path).split('/');
    let parent = '';
    for (let i = 0; i < parts.length; i++) {
      if (!directories.has(parent)) directories.set(parent, new Set());
      directories.get(parent).add(parts[i]);
      parent += (parent ? '/' : '') + parts[i];
    }
  }
  for (const [directory, children] of directories)
    check(
      canonical(
        listPrivate(fd, prefix + (directory ? '/' + directory : '')).sort(),
      ) === canonical([...children].sort()),
      'CONTRACT_MISMATCH',
    );
  let total = 0;
  const entries = paths.slice(0, -1).map((path) => {
    const b = read(path);
    total += b.length;
    check(total <= limits.expandedBytes, 'RESOURCE_EXHAUSTED');
    return { path, bytes: b.length, digest: rawDigest(b) };
  });
  return inspectSource({ entries, read }, material, floor);
}
const ascii = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export function verifySignature(data, signature, domain, keys, expected) {
  schema('signature', signature);
  check(signature.keyId === expected, 'PERMISSION_DENIED');
  const encoded = keys[expected];
  check(typeof encoded === 'string', 'PERMISSION_DENIED');
  const raw = Buffer.from(encoded, 'base64'),
    sig = Buffer.from(signature.signature, 'base64');
  check(
    raw.length === 32 &&
      raw.toString('base64') === encoded &&
      rawDigest(raw) === expected,
    'PERMISSION_DENIED',
  );
  check(
    sig.length === 64 && sig.toString('base64') === signature.signature,
    'PERMISSION_DENIED',
  );
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
    type: 'spki',
    format: 'der',
  });
  check(
    verify(null, Buffer.from(domain + '\n' + canonical(data)), key, sig),
    'PERMISSION_DENIED',
  );
}
// Input is operator material, NOT archive trust snapshots. No writes or clock override.
export function verifyCurrentTrust(material, floor) {
  const m = parse(canonical(material));
  check(
    canonical(Object.keys(m).sort()) ===
      canonical([
        'keys',
        'policy',
        'policySignature',
        'revocation',
        'revocationSignature',
        'rootKeyId',
      ]),
  );
  schema('trust-policy', m.policy);
  schema('revocation', m.revocation);
  check(m.policy.rootKeyIds[0] === m.rootKeyId, 'PERMISSION_DENIED');
  check(
    new Set(m.policy.publishers.map((p) => p.id)).size ===
      m.policy.publishers.length,
  );
  const now = Date.now();
  check(
    floor &&
      canonical(Object.keys(floor).sort()) ===
        canonical([
          'lastWallMs',
          'policyVersion',
          'revocationVersion',
          'rootKeyId',
        ]),
  );
  check(
    floor.rootKeyId === m.rootKeyId &&
      Number.isSafeInteger(floor.lastWallMs) &&
      floor.lastWallMs >= 0 &&
      now >= floor.lastWallMs,
    'PERMISSION_DENIED',
  );
  for (const [field, value] of [
    ['policyVersion', m.policy.version],
    ['revocationVersion', m.revocation.version],
  ])
    check(
      Number.isSafeInteger(floor[field]) &&
        floor[field] >= 1 &&
        value >= floor[field],
      'PERMISSION_DENIED',
    );
  for (const [record, sig, domain] of [
    [m.policy, m.policySignature, 'ALICA-TRUST-POLICY-v1'],
    [m.revocation, m.revocationSignature, 'ALICA-REVOCATION-v1'],
  ]) {
    verifySignature(record, sig, domain, m.keys, m.rootKeyId);
    check(
      record.issuedAtMs < record.expiresAtMs &&
        record.issuedAtMs <= now &&
        now < record.expiresAtMs &&
        now - record.issuedAtMs <= m.policy.maxOfflineAgeMs,
      'PERMISSION_DENIED',
    );
  }
  const publisher = m.policy.publishers.find(
    (p) => p.id === 'org.aquiero.alica',
  );
  check(
    publisher && canonical(publisher.executionModes) === canonical(['ipc']),
    'PERMISSION_DENIED',
  );
  return freeze(m);
}
export function artifactKind(path) {
  safePath(path);
  if (/^(runtime|schemas)\//.test(path)) return 'runtime';
  if (path === 'profile/profile.json') return 'profile';
  if (
    path === 'profile/lock.json' ||
    /^trust\/(policy|revocation)(-signature)?\.json$/.test(path)
  )
    return 'manifest';
  if (path === 'sbom/sbom.json') return 'sbom';
  if (path === 'provenance/build.json') return 'provenance';
  if (path.startsWith('docs/')) return 'documentation';
  const match = /^plugins\/([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+)\/(.+)$/.exec(
    path,
  );
  check(match);
  const rest = match[2];
  if (rest === 'manifest.json' || rest === 'index.json') return 'manifest';
  if (rest.startsWith('code/')) return 'plugin';
  if (rest.startsWith('contracts/')) return 'descriptor';
  check(false);
}
function resolveLock(profile, packages, policyDigest) {
  const scope = profile.scopes.find((s) => s.parent === null).id;
  const bindings = [],
    visiting = new Set(),
    visited = new Set(),
    identities = new Map();
  for (const p of packages.values())
    for (const d of p.descriptors) {
      const key = d.id + '@' + d.version,
        prior = identities.get(key);
      check(!prior || prior === digest(d), 'CONTRACT_MISMATCH');
      identities.set(key, digest(d));
    }
  const visit = (p) => {
    check(!visiting.has(p.manifest.id), 'CONFLICT');
    if (visited.has(p.manifest.id)) return;
    visiting.add(p.manifest.id);
    for (const r of p.manifest.requires) {
      const pin = profile.providerPins.find(
        (x) => x.capabilityId === r.capabilityId,
      )?.providerId;
      const candidates = [];
      for (const provider of packages.values())
        for (const d of provider.descriptors) {
          const v = version(d.version);
          if (
            d.id !== r.capabilityId ||
            v[0] !== r.major ||
            v[1] < r.minMinor ||
            (r.maxMinor !== undefined && v[1] > r.maxMinor) ||
            r.operations.some((o) => !d.operations.some((x) => x.name === o)) ||
            r.features.some((f) => !d.features.includes(f)) ||
            (pin && pin !== provider.manifest.id)
          )
            continue;
          candidates.push({ provider, d });
        }
      candidates.sort((a, b) => {
        const av = version(a.d.version),
          bv = version(b.d.version);
        return (
          bv[0] - av[0] ||
          bv[1] - av[1] ||
          bv[2] - av[2] ||
          ascii(a.provider.manifest.id, b.provider.manifest.id) ||
          ascii(a.provider.packageDigest, b.provider.packageDigest)
        );
      });
      check(candidates.length > 0, 'NOT_FOUND');
      const { provider, d } = candidates[0];
      visit(provider);
      bindings.push({
        consumerId: p.manifest.id,
        scope,
        capabilityId: r.capabilityId,
        providerId: provider.manifest.id,
        version: d.version,
        providerVersion: provider.manifest.version,
        descriptorDigest: digest(d),
        packageDigest: provider.packageDigest,
      });
    }
    visiting.delete(p.manifest.id);
    visited.add(p.manifest.id);
  };
  for (const p of packages.values()) visit(p);
  return {
    schemaVersion: 'alica.resolution-lock/v1',
    profileDigest: digest(profile),
    policyDigest,
    plugins: [...profile.plugins].sort((a, b) => ascii(a.id, b.id)),
    bindings: bindings.sort((a, b) =>
      ascii(
        [a.scope, a.consumerId, a.capabilityId].join('|'),
        [b.scope, b.consumerId, b.capabilityId].join('|'),
      ),
    ),
  };
}
export function inspectRelease(file, material, floor) {
  verifyCurrentTrust(material, floor);
  const archive = openArchive(file);
  try {
    return inspectSource(archive, material, floor);
  } finally {
    archive.close();
  }
}
function inspectSource(archive, material, floor) {
  const trust = verifyCurrentTrust(material, floor);
  check(
    archive.entries[0]?.path === 'bundle.json' &&
      archive.entries[1]?.path === 'bundle-signature.json',
  );
  const bundle = schema('bundle', parse(archive.read('bundle.json')));
  const signature = schema(
    'signature',
    parse(archive.read('bundle-signature.json')),
  );
  const publisher = trust.policy.publishers.find(
    (p) => p.id === 'org.aquiero.alica',
  );
  check(
    publisher.keyIds.includes(signature.keyId) &&
      !trust.revocation.revokedKeyIds.includes(signature.keyId),
    'PERMISSION_DENIED',
  );
  verifySignature(
    bundle,
    signature,
    'ALICA-BUNDLE-v1',
    trust.keys,
    signature.keyId,
  );
  check(
    !trust.revocation.revokedArtifactDigests.includes(digest(bundle)),
    'PERMISSION_DENIED',
  );
  check(bundle.artifacts.length === archive.entries.length - 2);
  const inventory = new Map();
  for (const a of bundle.artifacts) {
    check(!inventory.has(a.path), 'CONFLICT');
    check(a.kind === artifactKind(a.path));
    inventory.set(a.path, a);
  }
  for (const e of archive.entries.slice(2)) {
    const a = inventory.get(e.path);
    check(
      a && a.bytes === e.bytes && a.digest === e.digest,
      'CONTRACT_MISMATCH',
    );
    check(
      !trust.revocation.revokedArtifactDigests.includes(e.digest),
      'PERMISSION_DENIED',
    );
  }
  const read = (p) => {
    check(inventory.has(p), 'NOT_FOUND');
    return archive.read(p);
  };
  const profile = validateProfile(
    canonical(parse(read('profile/profile.json'))),
  );
  check(digest(profile) === bundle.profileDigest, 'CONTRACT_MISMATCH');
  const lock = schema('resolution-lock', parse(read('profile/lock.json')));
  check(lock.policyDigest === digest(trust.policy), 'PERMISSION_DENIED');
  // Immutable candidate snapshot cannot become a replacement for current authority.
  for (const [name, value] of [
    ['policy', trust.policy],
    ['policy-signature', trust.policySignature],
  ])
    check(
      canonical(parse(read('trust/' + name + '.json'))) === canonical(value),
      'CONTRACT_MISMATCH',
    );
  const snapshot = schema('revocation', parse(read('trust/revocation.json')));
  verifySignature(
    snapshot,
    parse(read('trust/revocation-signature.json')),
    'ALICA-REVOCATION-v1',
    trust.keys,
    trust.rootKeyId,
  );
  check(snapshot.version <= trust.revocation.version, 'PERMISSION_DENIED');
  if (snapshot.version === trust.revocation.version)
    check(digest(snapshot) === digest(trust.revocation), 'PERMISSION_DENIED');
  const packages = new Map(),
    owned = new Set();
  for (const selection of profile.plugins) {
    const base = 'plugins/' + selection.id + '/';
    const index = schema('package-index', parse(read(base + 'index.json')));
    check(
      index.manifestPath === 'manifest.json' &&
        index.pluginId === selection.id &&
        index.version === selection.version &&
        digest(index) === selection.packageDigest,
      'CONTRACT_MISMATCH',
    );
    check(
      !trust.revocation.revokedArtifactDigests.includes(
        selection.packageDigest,
      ),
      'PERMISSION_DENIED',
    );
    const members = new Map();
    let total = 0;
    owned.add(base + 'index.json');
    for (const f of index.files) {
      check(!members.has(f.path) && f.path !== 'index.json', 'CONFLICT');
      check(
        f.path === 'manifest.json' ||
          f.path.startsWith('code/') ||
          f.path.startsWith('contracts/'),
      );
      const b = read(base + f.path);
      total += b.length;
      check(total <= 16777216, 'RESOURCE_EXHAUSTED');
      check(
        b.length === f.bytes && rawDigest(b) === f.digest,
        'CONTRACT_MISMATCH',
      );
      members.set(f.path, b);
      owned.add(base + f.path);
    }
    const get = (p) => {
      const b = members.get(p);
      check(b, 'NOT_FOUND');
      return b;
    };
    const m = validatePlugin(canonical(parse(get('manifest.json'))), get);
    check(
      m.id === selection.id &&
        m.version === selection.version &&
        m.publisher === 'org.aquiero.alica' &&
        m.execution === 'ipc',
      'PERMISSION_DENIED',
    );
    check(
      m.secretReferences.length === 0 &&
        m.publishedEvents.length === 0 &&
        m.subscribedEvents.length === 0,
      'PERMISSION_DENIED',
    );
    const descriptors = m.provides.map((d) =>
      descriptor(get(d.descriptorPath)),
    );
    for (const d of descriptors)
      check(
        !d.operations.some(
          (o) => o.idempotencyPolicy?.persistence === 'durable',
        ),
        'FAILED_PRECONDITION',
      );
    packages.set(m.id, {
      manifest: m,
      descriptors,
      packageDigest: selection.packageDigest,
    });
  }
  for (const p of inventory.keys())
    if (p.startsWith('plugins/')) check(owned.has(p), 'CONTRACT_MISMATCH');
  check(
    canonical(lock) ===
      canonical(resolveLock(profile, packages, digest(trust.policy))),
    'CONTRACT_MISMATCH',
  );
  // Presence and strict parsing are NOT a claim of provenance/SBOM completeness.
  parse(read('sbom/sbom.json'));
  parse(read('provenance/build.json'));
  check(
    [...inventory.keys()].some((p) => p.startsWith('runtime/')) &&
      [...inventory.keys()].some((p) => p.startsWith('schemas/')) &&
      [...inventory.keys()].some((p) => p.startsWith('docs/')),
  );
  verifyCurrentTrust(trust, floor);
  return freeze({
    bundleDigest: digest(bundle),
    profileDigest: digest(profile),
    lockDigest: digest(lock),
    policyDigest: digest(trust.policy),
    artifacts: bundle.artifacts.length,
    profile,
    lock,
    qualification: 'NOT_QUALIFIED',
  });
}
// No key arguments: signing is a separate owner action. Supplied signatures are checked by inspection.
export function assembleRelease(
  destination,
  bundleBytes,
  signatureBytes,
  files,
) {
  const bundle = schema('bundle', parse(bundleBytes));
  schema('signature', parse(signatureBytes));
  check(files instanceof Map && files.size === bundle.artifacts.length);
  const entries = [
    ['bundle.json', Buffer.from(bundleBytes)],
    ['bundle-signature.json', Buffer.from(signatureBytes)],
  ];
  const seen = new Set();
  for (const a of [...bundle.artifacts].sort((a, b) => ascii(a.path, b.path))) {
    check(!seen.has(a.path));
    seen.add(a.path);
    check(artifactKind(a.path) === a.kind);
    const b = files.get(a.path);
    check(
      Buffer.isBuffer(b) && b.length === a.bytes && rawDigest(b) === a.digest,
      'CONTRACT_MISMATCH',
    );
    entries.push([a.path, b]);
  }
  writeArchive(destination, entries);
}
