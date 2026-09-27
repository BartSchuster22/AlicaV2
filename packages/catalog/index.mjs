import { readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  canonical,
  parse,
  descriptor,
  validateEventDescriptor,
  digest,
  version,
  unique,
  freeze,
  errorCodes,
} from '@alica/acap-contracts';

export class CatalogError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
export function insist(condition, code) {
  if (!condition) throw new CatalogError(code);
}
const ajv = new Ajv2020({ strict: true, allErrors: false });
export const definitionSchema = freeze(
  JSON.parse(
    readFileSync(
      new URL('./schemas/capability-definition.schema.json', import.meta.url),
      'utf8',
    ),
  ),
);
const shape = ajv.compile(definitionSchema);
export function identity(uri) {
  const match = new RegExp(definitionSchema.$defs.uri.pattern).exec(uri);
  insist(
    typeof uri === 'string' && uri.length <= 256 && match,
    'INVALID_IDENTITY',
  );
  const [authority, domain, tail] = uri.slice(7).split('/');
  const [capability, majorText] = tail.split('@');
  const major = Number(majorText);
  insist(Number.isSafeInteger(major) && major <= 2147483647, 'INVALID_MAJOR');
  return { authority, domain, capability, major };
}

/** Policy is a locally reviewed release input, NOT domain ownership or authenticity proof. */
export function validatePolicy(policy) {
  insist(
    policy && policy.apiVersion === 'catalog.alica.io/namespace-v1',
    'INVALID_POLICY',
  );
  insist(
    Object.keys(policy).sort().join(',') ===
      'apiVersion,namespaces,release,version',
    'INVALID_POLICY',
  );
  version(policy.version);
  insist(
    Array.isArray(policy.namespaces) && Array.isArray(policy.release),
    'INVALID_POLICY',
  );
  unique(policy.namespaces.map((n) => n.authority + '/' + n.domain));
  unique(policy.release);
  for (const n of policy.namespaces) {
    insist(
      Object.keys(n).sort().join(',') === 'authority,domain,kind,owner',
      'INVALID_POLICY',
    );
    identity(`acap://${n.authority}/${n.domain}/check@1`);
    insist(
      typeof n.owner === 'string' && n.owner.trim().length > 0,
      'INVALID_OWNER',
    );
    insist(
      ['first-party', 'vendor', 'private'].includes(n.kind),
      'INVALID_NAMESPACE_KIND',
    );
    insist(
      n.authority !== 'alica.io' || n.kind === 'first-party',
      'RESERVED_AUTHORITY',
    );
    insist(
      n.kind !== 'first-party' || n.authority === 'alica.io',
      'RESERVED_AUTHORITY',
    );
    insist(
      n.domain !== 'core' || n.authority === 'alica.io',
      'RESERVED_DOMAIN',
    );
    insist(
      n.kind !== 'private' || n.authority.endsWith('.private'),
      'PRIVATE_AUTHORITY',
    );
    insist(
      !n.authority.endsWith('.private') || n.kind === 'private',
      'PRIVATE_AUTHORITY',
    );
  }
  for (const uri of policy.release) {
    const id = identity(uri);
    insist(
      policy.namespaces.some(
        (n) => n.authority === id.authority && n.domain === id.domain,
      ),
      'UNAUTHORIZED_NAMESPACE',
    );
  }
  return freeze(parse(canonical(policy)));
}
export function localReader(root) {
  const base = realpathSync(root);
  return (name) => {
    insist(
      typeof name === 'string' &&
        new RegExp(definitionSchema.$defs.path.pattern).test(name),
      'NONLOCAL_REFERENCE',
    );
    const file = realpathSync(resolve(base, name));
    const rel = relative(base, file);
    insist(
      rel && !rel.startsWith('..') && !isAbsolute(rel),
      'NONLOCAL_REFERENCE',
    );
    return readFileSync(file);
  };
}

/** Contract operations and payload schemas have ONE source: executable ACAP descriptors. */
export function validateDefinition(
  value,
  read,
  policy,
  { release = true } = {},
) {
  const d = parse(canonical(value));
  insist(shape(d), 'INVALID_DEFINITION');
  const id = identity(d.metadata.id);
  const v = version(d.metadata.version);
  insist(id.major === v[0], 'MAJOR_MISMATCH');
  const p = validatePolicy(policy);
  insist(
    p.namespaces.some(
      (n) =>
        n.authority === id.authority &&
        n.domain === id.domain &&
        n.owner === d.metadata.owner,
    ),
    'UNAUTHORIZED_NAMESPACE',
  );
  if (release) {
    insist(p.release.includes(d.metadata.id), 'NOT_INCLUDED');
    insist(d.metadata.maturity !== 'proposed', 'UNRELEASED_PROPOSAL');
  }
  const contract = descriptor(read(d.contract.descriptor));
  insist(
    contract.id === d.contract.identity &&
      contract.version === d.contract.version &&
      contract.version === d.metadata.version &&
      digest(contract) === d.contract.digest,
    'CONTRACT_MISMATCH',
  );
  unique(d.dependencies.map((x) => x.capability));
  for (const dep of d.dependencies) {
    insist(
      identity(dep.capability).major === version(dep.version.slice(1))[0],
      'DEPENDENCY_MAJOR_MISMATCH',
    );
    insist(dep.capability !== d.metadata.id, 'SELF_DEPENDENCY');
  }
  insist(
    d.semantics.errors.every((e) => errorCodes.includes(e)),
    'UNKNOWN_ERROR',
  );
  unique(d.events.map((e) => e.identity));
  const events = d.events.map((e) => {
    const contract = validateEventDescriptor(
      new TextDecoder('utf8', { fatal: true }).decode(read(e.descriptor)),
    );
    insist(
      contract.id === e.identity &&
        contract.version === e.version &&
        digest(contract) === e.digest,
      'EVENT_MISMATCH',
    );
    return contract;
  });
  return freeze({ definition: d, descriptor: contract, events });
}
export function validateDefinitions(values, read, policy) {
  const entries = values.map((v) => validateDefinition(v, read, policy));
  unique(
    entries.map((e) => [
      e.definition.metadata.id,
      e.definition.metadata.version,
    ]),
  );
  // No aliases: one executable identity belongs to one URI family.
  const bindings = new Map();
  const families = new Map();
  for (const { definition: d } of entries) {
    const family = d.metadata.id.replace(/@\d+$/, '');
    insist(
      !bindings.has(d.contract.identity) ||
        bindings.get(d.contract.identity) === family,
      'IDENTITY_COLLISION',
    );
    bindings.set(d.contract.identity, family);
    insist(
      !families.has(family) || families.get(family) === d.contract.identity,
      'IDENTITY_COLLISION',
    );
    families.set(family, d.contract.identity);
    for (const dep of d.dependencies.filter((x) => x.required)) {
      const minimum = version(dep.version.slice(1));
      insist(
        entries.some((e) => {
          const v = version(e.definition.metadata.version);
          return (
            e.definition.metadata.id === dep.capability &&
            v[0] === minimum[0] &&
            (v[1] > minimum[1] || (v[1] === minimum[1] && v[2] >= minimum[2]))
          );
        }),
        'UNRESOLVED_DEPENDENCY',
      );
    }
  }
  return freeze(entries);
}
