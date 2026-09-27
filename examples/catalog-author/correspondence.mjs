import {
  canonical,
  manifest,
  descriptor,
  digest,
  version,
  freeze,
  negotiate,
} from '@alica/acap-contracts';
import { identity, insist } from '@alica/catalog';
import { consumeSnapshot } from '@alica/catalog/release';

/** Build-time companion mapping; never extends PluginManifest or grants authority.
 * Every provided/required capability must have exactly one explicit selected binding.
 * expectedDigest must come from the author's trusted distribution channel.
 */
export function validateCorrespondence(
  snapshot,
  expectedDigest,
  plugin,
  bindings,
  read,
) {
  insist(
    typeof expectedDigest === 'string' && snapshot.digest === expectedDigest,
    'SNAPSHOT_PIN_MISMATCH',
  );
  const catalog = consumeSnapshot(snapshot);
  const m = manifest(canonical(plugin));
  insist(Array.isArray(bindings), 'INVALID_BINDINGS');
  const declarations = [
    ...m.provides.map((value) => ({ role: 'provides', value })),
    ...m.requires.map((value) => ({ role: 'requires', value })),
    ...m.optionalRequires.map((value) => ({ role: 'optionalRequires', value })),
  ];
  insist(bindings.length === declarations.length, 'BINDING_COVERAGE');
  const used = new Set();
  const selected = declarations.map(({ role, value }) => {
    const matches = bindings.filter(
      (b) =>
        b.role === role &&
        b.identity === value.capabilityId &&
        (role !== 'provides' || b.version === value.version),
    );
    insist(matches.length === 1 && !used.has(matches[0]), 'BINDING_COVERAGE');
    const b = matches[0];
    used.add(b);
    insist(
      Object.keys(b).sort().join(',') === 'digest,identity,role,uri,version',
      'INVALID_BINDING',
    );
    const id = identity(b.uri);
    insist(id.major === version(b.version)[0], 'MAJOR_MISMATCH');
    const entries = catalog.entries.filter(
      (e) =>
        e.definition.metadata.id === b.uri &&
        e.definition.metadata.version === b.version,
    );
    insist(entries.length === 1, 'CATALOG_NOT_FOUND');
    const entry = entries[0],
      d = entry.descriptor;
    insist(d.id === b.identity && digest(d) === b.digest, 'CONTRACT_MISMATCH');
    if (role === 'provides') {
      insist(
        value.version === d.version && value.descriptorDigest === b.digest,
        'CONTRACT_MISMATCH',
      );
      const supplied = descriptor(read(value.descriptorPath));
      insist(
        supplied.id === d.id &&
          supplied.version === d.version &&
          digest(supplied) === b.digest,
        'CONTRACT_MISMATCH',
      );
    } else {
      insist(value.major === id.major, 'MAJOR_MISMATCH');
      negotiate(d, value);
    }
    return { role, uri: b.uri, descriptor: d };
  });
  insist(used.size === bindings.length, 'BINDING_COVERAGE');
  return freeze({
    manifest: m,
    selected,
    snapshotDigest: catalog.digest,
    trustVerified: false,
  });
}
