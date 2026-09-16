import type {
  Descriptor,
  Manifest,
  Profile,
  EventDescriptor,
  EventEnvelope,
} from '@alica/acap-types';
import {
  check,
  parse,
  canonical,
  document,
  descriptor,
  manifest,
  payloadSchema,
  payload,
  version,
  unique,
  digest,
  rawDigest,
  detach,
  freeze,
  schema,
} from './validation.js';
export function validateProfile(bytes: string): Profile {
  const p = document<Profile>('profile', bytes);
  version(p.version);
  unique(p.plugins.map((x) => x.id));
  unique(p.providerPins.map((x) => x.capabilityId));
  unique(p.scopes.map((x) => x.id));
  check(p.scopes.filter((s) => s.parent === null).length === 1);
  const scopes = new Map(p.scopes.map((x) => [x.id, x]));
  for (const s of p.scopes) {
    const seen = new Set<string>();
    let current: typeof s | undefined = s;
    while (current) {
      check(!seen.has(current.id));
      seen.add(current.id);
      if (current.parent === null) break;
      check(scopes.has(current.parent));
      current = scopes.get(current.parent);
    }
  }
  for (const plugin of p.plugins) version(plugin.version);
  for (const pin of p.providerPins)
    check(p.plugins.some((x) => x.id === pin.providerId));
  return freeze(p);
}
export function validateEventDescriptor(bytes: string): EventDescriptor {
  const d = document<EventDescriptor>('event-descriptor', bytes);
  version(d.version);
  payloadSchema(d.payload);
  return freeze(d);
}
export function validateEventEnvelope(
  bytes: string,
  contract: EventDescriptor,
): EventEnvelope {
  const e = document<EventEnvelope>('event', bytes);
  check(
    e.type === contract.id && e.contractDigest === digest(contract),
    'CONTRACT_MISMATCH',
  );
  payload(contract.payload, e.data);
  return freeze(e);
}
export function validatePlugin(
  bytes: string,
  read?: (path: string) => Uint8Array,
): Manifest {
  const m = manifest(bytes);
  if (read) {
    read(m.entrypoint);
    for (const b of m.provides) {
      const d = descriptor(read(b.descriptorPath));
      check(
        d.id === b.capabilityId &&
          d.version === b.version &&
          digest(d) === b.descriptorDigest,
        'CONTRACT_MISMATCH',
      );
    }
    for (const b of [...m.publishedEvents, ...m.subscribedEvents]) {
      const d = validateEventDescriptor(
        new TextDecoder('utf-8', { fatal: true }).decode(
          read(b.descriptorPath),
        ),
      );
      check(
        d.id === b.eventType &&
          d.version === b.version &&
          digest(d) === b.descriptorDigest,
        'CONTRACT_MISMATCH',
      );
    }
  }
  return freeze(m);
}
interface Inventory {
  path: string;
  bytes: number;
  digest: string;
  kind?: string;
}
interface Bundle {
  schemaVersion: string;
  bundleId: string;
  profileDigest: string;
  artifacts: Inventory[];
}
export function validateBundle(
  bytes: string,
  read?: (path: string) => Uint8Array,
  profileBytes?: string,
): Bundle {
  const b = document<Bundle>('bundle', bytes);
  unique(b.artifacts.map((x) => x.path));
  const profile = profileBytes ? validateProfile(profileBytes) : undefined;
  if (profile) check(digest(profile) === b.profileDigest, 'CONTRACT_MISMATCH');
  if (read) {
    const inventory = new Map(b.artifacts.map((a) => [a.path, a]));
    for (const a of b.artifacts) {
      const raw = read(a.path);
      check(
        raw.byteLength === a.bytes && rawDigest(raw) === a.digest,
        'CONTRACT_MISMATCH',
      );
      const prefix = a.path.includes('/')
        ? a.path.slice(0, a.path.lastIndexOf('/') + 1)
        : '';
      const linked = (name: string) => {
        check(inventory.has(prefix + name), 'CONTRACT_MISMATCH');
        return read(prefix + name);
      };
      const text = new TextDecoder('utf-8', { fatal: true });
      if (a.kind === 'manifest') {
        const value = parse(text.decode(raw)) as { schemaVersion?: string };
        if (value.schemaVersion === 'alica.plugin/v1')
          validatePlugin(text.decode(raw), linked);
        else {
          const index = schema<{
            pluginId: string;
            version: string;
            manifestPath: string;
            files: Inventory[];
          }>('package-index', value);
          version(index.version);
          unique(index.files.map((f) => f.path));
          check(
            index.files.some((f) => f.path === index.manifestPath),
            'CONTRACT_MISMATCH',
          );
          for (const f of index.files) {
            const data = linked(f.path);
            check(
              data.byteLength === f.bytes && rawDigest(data) === f.digest,
              'CONTRACT_MISMATCH',
            );
          }
          const m = validatePlugin(text.decode(linked(index.manifestPath)));
          check(
            m.id === index.pluginId && m.version === index.version,
            'CONTRACT_MISMATCH',
          );
          if (profile)
            check(
              profile.plugins.some(
                (p) =>
                  p.id === index.pluginId &&
                  p.version === index.version &&
                  p.packageDigest === digest(index),
              ),
              'CONTRACT_MISMATCH',
            );
        }
      }
      if (a.kind === 'descriptor') {
        const value = parse(text.decode(raw)) as { schemaVersion?: string };
        if (value.schemaVersion === 'acap.event-descriptor/v1')
          validateEventDescriptor(text.decode(raw));
        else descriptor(raw);
      }
    }
  }
  return freeze(b);
}
export function contractDigest(bytes: string): string {
  return digest(descriptor(bytes));
}
/** Templates contain only canonical validated descriptor data; no timestamps/absolute paths. */
export function generateClient(d: Descriptor): string {
  d = descriptor(canonical(d));
  const methods = d.operations
    .map(
      (o) =>
        `    ${JSON.stringify(o.name)}: (input, options) => session.${o.kind === 'stream' ? 'openStream' : 'call'}(${JSON.stringify(o.name)}, input, options)`,
    )
    .join(',\n');
  return `// Generated by alicac v1. Deterministic; do not edit.\nimport { negotiate } from '@alica/acap-contracts';\nexport const descriptor = ${canonical(d)};\nexport const descriptorDigest = ${JSON.stringify(digest(d))};\nexport function createClient(session) {\n  negotiate(session.descriptor, {capabilityId: descriptor.id, major: ${version(d.version)[0]}, minMinor: ${version(d.version)[1]}, maxMinor: ${version(d.version)[1]}, operations: ${JSON.stringify(d.operations.map((o) => o.name))}, features: descriptor.features}, descriptorDigest);\n  return Object.freeze({\n${methods}\n  });\n}\n`;
}
export function generateProvider(d: Descriptor): string {
  d = descriptor(canonical(d));
  return `// Generated by alicac v1. Implement handlers before conformance qualification.\nexport const descriptor = ${canonical(d)};\nexport const handlers = {\n${d.operations.map((o) => `  ${JSON.stringify(o.name)}: async ${o.kind === 'stream' ? 'function*' : 'function'}(input, context) { throw {code: 'FAILED_PRECONDITION'}; }`).join(',\n')}\n};\n`;
}
function typeOf(s: Descriptor['operations'][number]['input']): string {
  if (Object.hasOwn(s, 'const')) return canonical(s.const);
  if (s.enum) return s.enum.map((x) => canonical(x)).join(' | ');
  switch (s.type) {
    case 'null':
      return 'null';
    case 'boolean':
      return 'boolean';
    case 'integer':
      return 'number';
    case 'string':
      return 'string';
    case 'array':
      return `Array<${typeOf(s.items!)}>`;
    case 'object':
      return `{ ${Object.entries(s.properties ?? {})
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(
          ([key, value]) =>
            `${JSON.stringify(key)}${s.required?.includes(key) ? '' : '?'}: ${typeOf(value)}`,
        )
        .join('; ')} }`;
  }
}
export function generateDeclaration(
  d: Descriptor,
  kind: 'client' | 'provider',
): string {
  d = descriptor(canonical(d));
  const definitions = d.operations
    .map(
      (o) =>
        `${JSON.stringify(o.name)}: (input: ${typeOf(o.input)}, ${kind === 'client' ? 'options: CallOptions' : 'context: OperationContext'}) => ${o.kind === 'stream' ? `AsyncIterable<${typeOf(o.output)}>` : `Promise<${typeOf(o.output)}>`}`,
    )
    .join(';\n');
  return `// Generated by alicac v1.\nimport type {Descriptor, CallOptions, OperationContext} from '@alica/acap-types';\nimport type {ClientEndpoint} from '@alica/acap-contracts';\nexport declare const descriptor: Descriptor;\n${kind === 'client' ? `export declare const descriptorDigest: string;\nexport declare function createClient(session: ClientEndpoint): {\n${definitions}\n};` : `export declare const handlers: {\n${definitions}\n};`}\n`;
}
