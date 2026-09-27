import { canonical, digest, freeze, version } from '@alica/acap-contracts';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { localReader, validateDefinitions, insist } from './index.mjs';

const json = (bytes) => JSON.parse(Buffer.from(bytes).toString('utf8'));
const sorted = (entries) =>
  [...entries].sort((a, b) => {
    const x = a.definition.metadata,
      y = b.definition.metadata;
    return x.id < y.id
      ? -1
      : x.id > y.id
        ? 1
        : x.version < y.version
          ? -1
          : x.version > y.version
            ? 1
            : 0;
  });
export function loadCatalog(root = 'catalog') {
  const base = realpathSync(root),
    manifest = realpathSync(resolve(base, 'catalog.yaml'));
  const rel = relative(base, manifest);
  insist(
    rel && !rel.startsWith('..') && !isAbsolute(rel),
    'NONLOCAL_REFERENCE',
  );
  // The release manifest is JSON-in-YAML; contract references remain JSON-only.
  const read = localReader(base),
    release = json(readFileSync(manifest));
  insist(
    release.apiVersion === 'catalog.alica.io/release-v1' &&
      Array.isArray(release.definitions),
    'INVALID_RELEASE',
  );
  version(release.version);
  const policy = json(read(release.namespacePolicy));
  const entries = sorted(
    validateDefinitions(
      release.definitions.map((p) => json(read(p))),
      read,
      policy,
    ),
  );
  return { release, policy, entries, read };
}
export function createIndex(catalog) {
  return freeze({
    apiVersion: 'catalog.alica.io/index-v1',
    version: catalog.release.version,
    entries: sorted(catalog.entries).map(({ definition: d }) => ({
      id: d.metadata.id,
      version: d.metadata.version,
      maturity: d.metadata.maturity,
      identity: d.contract.identity,
      digest: d.contract.digest,
    })),
  });
}
export function createSnapshot(catalog) {
  const files = {};
  for (const { definition: d } of catalog.entries) {
    for (const path of [
      d.contract.descriptor,
      ...d.events.map((e) => e.descriptor),
    ]) {
      const value = json(catalog.read(path));
      insist(
        !Object.hasOwn(files, path) ||
          canonical(files[path]) === canonical(value),
        'REFERENCE_COLLISION',
      );
      files[path] = value;
    }
  }
  const content = {
    apiVersion: 'catalog.alica.io/snapshot-v1',
    version: catalog.release.version,
    policy: catalog.policy,
    definitions: sorted(catalog.entries).map((e) => e.definition),
    files,
    index: createIndex(catalog),
    compatibility: { rules: 'catalog-v1-bounded', unknown: 'REVIEW_REQUIRED' },
  };
  return freeze({ content, digest: digest(content) });
}
export function consumeSnapshot(snapshot) {
  const c = snapshot?.content;
  insist(
    c &&
      c.apiVersion === 'catalog.alica.io/snapshot-v1' &&
      digest(c) === snapshot.digest,
    'SNAPSHOT_INTEGRITY',
  );
  version(c.version);
  const read = (path) => {
    insist(
      typeof path === 'string' &&
        !path.includes('..') &&
        !path.startsWith('/') &&
        !path.includes(':') &&
        Object.hasOwn(c.files, path),
      'NONLOCAL_REFERENCE',
    );
    return Buffer.from(canonical(c.files[path]));
  };
  const entries = sorted(validateDefinitions(c.definitions, read, c.policy));
  const catalog = { release: { version: c.version }, entries };
  insist(
    canonical(createIndex(catalog)) === canonical(c.index),
    'INDEX_MISMATCH',
  );
  insist(
    canonical(c.compatibility) ===
      canonical({ rules: 'catalog-v1-bounded', unknown: 'REVIEW_REQUIRED' }),
    'INVALID_COMPATIBILITY_RULES',
  );
  return freeze({
    version: c.version,
    entries,
    index: c.index,
    digest: snapshot.digest,
    trustVerified: false,
  });
}
