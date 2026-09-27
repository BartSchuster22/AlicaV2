import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { canonical, digest, runConformance } from '@alica/acap-contracts';
import {
  validateDefinition,
  validateDefinitions,
  validatePolicy,
  identity,
  localReader,
} from '@alica/catalog';
const read = localReader('catalog');
const source = JSON.parse(read('capabilities/core/echo/definition.json'));
const policy = JSON.parse(read('governance/namespaces.json'));
const clone = (x) => structuredClone(x);
const validate = (d = clone(source), p = policy, r = read) =>
  validateDefinition(d, r, p);
const rejects = (change, code) => {
  const d = clone(source);
  change(d);
  assert.throws(
    () => validate(d),
    (e) => e.code === code,
  );
};

test('C1 C2 C5: ACAP-aligned definition and independent catalog/platform versions', () => {
  const result = validate();
  assert.equal(result.descriptor.id, source.contract.identity);
  assert.equal(result.definition.contract.digest, digest(result.descriptor));
  assert(Object.isFrozen(result.definition));
  assert.equal(
    JSON.parse(readFileSync('catalog/catalog.yaml')).version,
    '0.1.0',
  );
  assert.equal(result.definition.metadata.version, '1.0.0');
  const pkg = JSON.parse(readFileSync('packages/catalog/package.json'));
  assert(!Object.keys(pkg.dependencies).some((k) => /kernel/.test(k)));
  assert.throws(
    () => createRequire(import.meta.url).resolve('@alica/catalog/index.mjs'),
    { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' },
  );
});
test('C2: malformed shape, maturity, version, descriptor and event references fail', () => {
  rejects((d) => (d.metadata.maturity = 'imagined'), 'INVALID_DEFINITION');
  rejects((d) => (d.contract.provider = 'plugin-x'), 'INVALID_DEFINITION');
  rejects((d) => (d.metadata.version = '01.0.0'), 'INVALID_DEFINITION');
  rejects((d) => (d.metadata.version = '2.0.0'), 'MAJOR_MISMATCH');
  rejects(
    (d) => (d.contract.digest = 'sha256:' + '0'.repeat(64)),
    'CONTRACT_MISMATCH',
  );
  rejects((d) => (d.contract.version = '1.0.1'), 'CONTRACT_MISMATCH');
  rejects(
    (d) => (d.contract.descriptor = 'https://example.com/schema.json'),
    'INVALID_DEFINITION',
  );
  assert.throws(() => validate(source, policy, () => Buffer.from('{}')));
  rejects((d) => d.events.push({ ...d.contract }), 'INVALID_ARGUMENT');
  assert.throws(
    () =>
      validate({
        ...clone(source),
        contract: { ...source.contract, descriptor: 'missing.json' },
      }),
    { code: 'ENOENT' },
  );
});
test('C3: malformed identities, namespace owner, release inclusion and reserved names', () => {
  for (const uri of [
    'acap://ALICA.io/example/echo@1',
    'acap://alica.io/example/echo@01',
    'acap://alica.io/example/echo@0',
    'acap://alica.io/example/echo@1#alias',
    'acap://alica.io/example/echo@9007199254740993',
  ])
    assert.throws(() => identity(uri));
  rejects((d) => (d.metadata.owner = 'someone else'), 'UNAUTHORIZED_NAMESPACE');
  const p = clone(policy);
  p.release = [];
  assert.throws(() => validate(source, p), { code: 'NOT_INCLUDED' });
  const reserved = clone(policy);
  reserved.namespaces[0].kind = 'vendor';
  assert.throws(() => validatePolicy(reserved), { code: 'RESERVED_AUTHORITY' });
  for (const [authority, kind] of [
    ['vendor.example', 'vendor'],
    ['team.private', 'private'],
  ]) {
    const p = clone(policy),
      d = clone(source);
    p.namespaces[0].authority = authority;
    p.namespaces[0].kind = kind;
    d.metadata.id = `acap://${authority}/example/echo@1`;
    p.release = [d.metadata.id];
    assert.equal(validate(d, p).definition.metadata.id, d.metadata.id);
  }
});
test('C3: duplicate/colliding entries and major mapping fail', () => {
  assert.throws(() => validateDefinitions([source, source], read, policy), {
    code: 'CONFLICT',
  });
  const d = clone(source),
    p = clone(policy);
  d.metadata.id = 'acap://alica.io/example/alias@1';
  p.release.push(d.metadata.id);
  assert.throws(() => validateDefinitions([source, d], read, p), {
    code: 'IDENTITY_COLLISION',
  });
  const newer = clone(source);
  const desc = JSON.parse(read(source.contract.descriptor));
  desc.id = 'example.other';
  desc.version = '1.1.0';
  newer.metadata.version = desc.version;
  newer.contract = {
    descriptor: 'other.json',
    identity: desc.id,
    version: desc.version,
    digest: digest(desc),
  };
  assert.throws(
    () =>
      validateDefinitions(
        [source, newer],
        (path) =>
          path === 'other.json' ? Buffer.from(canonical(desc)) : read(path),
        policy,
      ),
    { code: 'IDENTITY_COLLISION' },
  );
});
test('C7 C8: dependencies are semantic, declarations cannot grant authority', () => {
  rejects(
    (d) =>
      d.dependencies.push({
        capability: 'acap://alica.io/example/base@1',
        version: '^1.0.0',
        required: true,
        provider: 'x',
      }),
    'INVALID_DEFINITION',
  );
  rejects(
    (d) => (d.permissions = [{ name: 'example.echo', grant: true }]),
    'INVALID_DEFINITION',
  );
  rejects((d) => (d.grants = ['root']), 'INVALID_DEFINITION');
  rejects(
    (d) =>
      d.dependencies.push({
        capability: 'acap://alica.io/example/base@1',
        version: '^2.0.0',
        required: true,
      }),
    'DEPENDENCY_MAJOR_MISMATCH',
  );
  const d = clone(source);
  d.dependencies.push({
    capability: 'acap://alica.io/example/base@1',
    version: '^1.0.0',
    required: true,
  });
  assert.throws(() => validateDefinitions([d], read, policy), {
    code: 'UNRESOLVED_DEPENDENCY',
  });
  d.dependencies[0].required = false;
  assert.equal(validateDefinitions([d], read, policy).length, 1);
});
test('C2: filesystem references stay local including symlinks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-path-'));
  try {
    symlinkSync(join(process.cwd(), 'package.json'), join(dir, 'escape.json'));
    const r = localReader(dir);
    for (const p of [
      '../package.json',
      '/etc/passwd',
      'https://host/schema.json',
      'escape.json',
    ])
      assert.throws(() => r(p), { code: 'NONLOCAL_REFERENCE' });
    writeFileSync(join(dir, 'local.json'), '{}');
    assert.equal(r('local.json').toString(), '{}');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('early C13: real public ACAP conformance consumes neutral Catalog descriptor', async () => {
  const { descriptor: d } = validate();
  const report = await runConformance(
    d,
    { echo: async (input) => ({ text: input.text }) },
    [
      {
        name: 'round-trip',
        operation: 'echo',
        input: { text: 'hello' },
        expected: { text: 'hello' },
      },
    ],
  );
  assert.equal(report.passed, true, canonical(report));
});
