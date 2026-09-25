import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencyLayout } from '../../tools/g7-runtime-layout.mjs';
const auxiliaries = [
  'ajv/.runkit_example.js',
  'fast-uri/.gitattributes',
  'fast-uri/.github/dependabot.yml',
  'fast-uri/.github/workflows/ci.yml',
  'fast-uri/.github/workflows/lock-threads.yml',
  'fast-uri/.github/workflows/package-manager-ci.yml',
  'json-schema-traverse/.eslintrc.yml',
  'json-schema-traverse/spec/.eslintrc.yml',
  'json-schema-traverse/.github/FUNDING.yml',
  'json-schema-traverse/.github/workflows/publish.yml',
  'json-schema-traverse/.github/workflows/build.yml',
];
test('closed auxiliary relocation retains every byte binding and runtime edge path', () => {
  const paths = ['ajv/dist/2020.js', 'ajv/LICENSE', ...auxiliaries];
  const entries = paths.map((p) => ({
    path: 'runtime/node_modules/' + p,
    bytes: 17,
    sha256: 'a'.repeat(64),
  }));
  const before = structuredClone(entries);
  const actual = dependencyLayout(entries);
  assert.deepEqual(entries, before);
  assert.deepEqual(dependencyLayout(entries), actual);
  assert.equal(actual.length, entries.length);
  for (let i = 0; i < entries.length; i++) {
    assert.equal(actual[i].bytes, entries[i].bytes);
    assert.equal(actual[i].sha256, entries[i].sha256);
    assert.equal(actual[i].source, entries[i].path);
    assert.match(
      actual[i].path,
      /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)*$/,
    );
    if (i < 2) assert.equal(actual[i].path, entries[i].path);
    else
      assert(
        actual[i].path.startsWith('runtime/receipts/dependency-auxiliary/'),
      );
  }
});
for (const p of [
  'ajv/.unknown.js',
  'ajv/../escape',
  'ajv/@scope/file.js',
  'ajv/file..js',
  'ajv/.github/new.yml',
  'ajv/' + 'a'.repeat(241),
  'ajv/' + 'a/'.repeat(17) + 'x',
])
  test(
    'unknown or unsafe path cannot acquire auxiliary exception: ' + p,
    () => {
      assert.throws(() =>
        dependencyLayout([{ path: 'runtime/node_modules/' + p }]),
      );
    },
  );
test('duplicate/case aliases and nondependency inputs denied', () => {
  assert.throws(() =>
    dependencyLayout([
      { path: 'runtime/node_modules/ajv/LICENSE' },
      { path: 'runtime/node_modules/ajv/license' },
    ]),
  );
  assert.throws(() => dependencyLayout([{ path: 'runtime/bin/node' }]));
  assert.throws(() => dependencyLayout([{ path: null }]));
});
