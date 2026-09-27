import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { canonical, digest, runConformance } from '@alica/acap-contracts';
import { consumeSnapshot } from '@alica/catalog/release';
import { compatibility } from '@alica/catalog/governance';
import { createTestCell } from '@alica/testkit';
import { validateCorrespondence } from './correspondence.mjs';
import { provider, handlersA, handlersB } from './provider.mjs';
import { consumer } from './consumer.mjs';

const require = createRequire(import.meta.url);
assert.throws(() => require.resolve('@alica/kernel'), {
  code: 'MODULE_NOT_FOUND',
});
for (const path of [
  '@alica/catalog/index.mjs',
  '@alica/plugin-sdk/dist/index.js',
])
  assert.throws(() => require.resolve(path), {
    code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  });
globalThis.fetch = () => {
  throw Error('network forbidden during snapshot consumption');
};
const snapshot = JSON.parse(readFileSync('snapshot.json', 'utf8'));
const pin = readFileSync('snapshot.digest', 'utf8').trim();
const { entries } = consumeSnapshot(snapshot);
const entry = entries.find(
  (e) =>
    e.definition.metadata.id === 'acap://alica.io/example/echo@1' &&
    e.definition.metadata.version === '1.0.0',
);
assert(entry);
const d = entry.descriptor;
const requirement = {
  capabilityId: d.id,
  major: 1,
  minMinor: 0,
  operations: ['echo'],
  features: [],
};
const base = {
  schemaVersion: 'alica.plugin/v1',
  id: 'org.example.echo',
  version: '7.2.0',
  publisher: 'org.example',
  execution: 'inproc',
  entrypoint: 'provider.mjs',
  provides: [],
  requires: [],
  optionalRequires: [],
  secretReferences: [],
  publishedEvents: [],
  subscribedEvents: [],
};
const plugin = {
  ...base,
  provides: [
    {
      capabilityId: d.id,
      version: d.version,
      descriptorDigest: digest(d),
      descriptorPath: 'echo.json',
    },
  ],
  requires: [requirement],
};
const binding = {
  uri: entry.definition.metadata.id,
  version: d.version,
  identity: d.id,
  digest: digest(d),
};
const bindings = [
  { ...binding, role: 'provides' },
  { ...binding, role: 'requires' },
];
const read = (path) => {
  assert.equal(path, 'echo.json');
  return canonical(d);
};
const checked = validateCorrespondence(snapshot, pin, plugin, bindings, read);
assert.equal(checked.selected.length, 2);
assert.equal(checked.trustVerified, false);
const negatives = [];
function negative(name, code, change) {
  const args = [
    structuredClone(snapshot),
    pin,
    structuredClone(plugin),
    structuredClone(bindings),
    read,
  ];
  change(args);
  assert.throws(() => validateCorrespondence(...args), { code });
  negatives.push(name);
}
negative('untrusted snapshot pin', 'SNAPSHOT_PIN_MISMATCH', (a) => {
  a[1] = 'sha256:' + '0'.repeat(64);
});
negative('altered snapshot', 'SNAPSHOT_INTEGRITY', (a) => {
  a[0].content.version = '9.0.0';
});
negative('missing selected capability', 'CATALOG_NOT_FOUND', (a) => {
  a[3][0].uri = 'acap://alica.io/example/missing@1';
});
negative('unavailable major', 'CATALOG_NOT_FOUND', (a) => {
  a[3][1].uri = 'acap://alica.io/example/echo@2';
  a[3][1].version = '2.0.0';
});
negative('URI version major mismatch', 'MAJOR_MISMATCH', (a) => {
  a[3][1].uri = 'acap://alica.io/example/echo@2';
});
negative('required major mismatch', 'MAJOR_MISMATCH', (a) => {
  a[2].requires[0].major = 2;
});
negative('identity mismatch', 'CONTRACT_MISMATCH', (a) => {
  a[2].provides[0].capabilityId = 'org.other.echo';
  a[3][0].identity = 'org.other.echo';
});
negative('mapping digest mismatch', 'CONTRACT_MISMATCH', (a) => {
  a[3][0].digest = 'sha256:' + '0'.repeat(64);
});
negative('manifest digest mismatch', 'CONTRACT_MISMATCH', (a) => {
  a[2].provides[0].descriptorDigest = 'sha256:' + '0'.repeat(64);
});
negative('actual plugin descriptor mismatch', 'CONTRACT_MISMATCH', (a) => {
  a[4] = () => canonical({ ...d, id: 'org.other.echo' });
});
negative('missing mapping', 'BINDING_COVERAGE', (a) => {
  a[3].pop();
});
negative('duplicate mapping', 'BINDING_COVERAGE', (a) => {
  a[3][1] = { ...a[3][0] };
});
negative('required unsupported operation', 'INCOMPATIBLE_VERSION', (a) => {
  a[2].requires[0].operations = ['missing'];
});
const fixtures = [
  {
    name: 'round-trip',
    operation: 'echo',
    input: { text: 'neutral' },
    expected: { text: 'neutral' },
  },
  {
    name: 'empty',
    operation: 'echo',
    input: { text: '' },
    expected: { text: '' },
  },
  {
    name: 'invalid-input',
    operation: 'echo',
    input: { text: 42 },
    errorCode: 'INVALID_ARGUMENT',
  },
];
const conformance = [];
const runs = [];
for (const [index, handlers] of [handlersA, handlersB].entries()) {
  const report = await runConformance(d, handlers, fixtures);
  assert.equal(report.passed, true, canonical(report));
  conformance.push(report);
  const cell = createTestCell();
  const p = cell.instance({ id: `org.provider.p${index}` });
  const c = cell.instance({
    id: 'org.consumer.neutral',
    permissions: { capabilities: { [d.id]: ['echo'] } },
  });
  let endpoint;
  try {
    await p.activate(provider(d, handlers));
    await c.activate(
      consumer(d, requirement, (value) => {
        endpoint = value;
      }),
    );
    const result = await endpoint.call(
      'echo',
      { text: 'neutral' },
      { deadlineMs: Date.now() + 1000 },
    );
    assert.deepEqual(JSON.parse(canonical(result)), { text: 'neutral' });
    runs.push(result);
  } finally {
    for (const report of await cell.close()) {
      assert.equal(report.state, 'DISPOSED');
      assert.deepEqual(report.failedDisposers, []);
      assert.equal(report.timedOutResources, 0);
      assert.equal(report.restartRequired, false);
    }
    assert.equal(cell.inspect().providers, 0);
    assert.equal(cell.inspect().pending, 0);
  }
}
assert.deepEqual(runs[0], runs[1]);
const diff = compatibility(entry, entry);
assert.equal(diff.classification, 'BACKWARD_COMPATIBLE');
console.log(
  canonical({
    schemaVersion: 'alica.catalog-external/v1',
    level: 'SDK_TESTKIT_NOT_PRODUCTION',
    publicImportsOnly: true,
    authorProjectHasNoKernel: true,
    snapshotDigest: pin,
    manifestCorrespondence: true,
    negatives,
    conformance,
    providerAgnosticConsumer: true,
    providerRuns: runs,
    cleanup: 'DISPOSED',
    compatibility: diff.classification,
    trustVerified: false,
  }),
);
