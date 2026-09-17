import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { violations } from '../../tools/check-boundaries.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
function check(importer, target) {
  const file = path.join(root, importer);
  let specifier = path
    .relative(path.dirname(file), path.join(root, target))
    .replaceAll('\\', '/');
  if (!specifier.startsWith('.')) specifier = './' + specifier;
  return violations(
    file,
    `import * as privateModule from ${JSON.stringify(specifier)};`,
    root,
  );
}
const pairs = [
  ['tests/ipc/wire.test.mjs', 'packages/kernel/dist/g6/schema.js'],
  ['tests/ipc/wire.test.mjs', 'packages/kernel/dist/g6/wire-schema.js'],
  ['tests/ipc/wire.test.mjs', 'packages/kernel/dist/g6/wire.js'],
  ['tests/ipc/scheduler.test.mjs', 'packages/kernel/dist/g6/scheduler.js'],
  ['tests/ipc/scheduler.test.mjs', 'packages/kernel/dist/g6/wire.js'],
  ['tests/ipc/reap.test.mjs', 'packages/kernel/src/g6/reap.ts'],
  [
    'tests/ipc/scope-correction.test.mjs',
    'packages/kernel/dist/g6/host-adapter.js',
  ],
  ['tests/ipc/scope-correction.test.mjs', 'packages/kernel/dist/g6/native.js'],
  ['tests/ipc/scope-wire.test.mjs', 'packages/kernel/dist/g6/wire.js'],
];

test('private component tests can import only their enumerated runtime modules', () => {
  for (const [importer, target] of pairs)
    assert.deepEqual(check(importer, target), []);
});

test('component exceptions do not authorize private Host, Trust or transport imports', () => {
  for (const importer of new Set(pairs.map(([file]) => file))) {
    for (const target of [
      'packages/kernel/dist/trust.js',
      'packages/kernel/dist/index.js',
      'packages/kernel/dist/g6/session.js',
    ])
      assert.ok(check(importer, target).includes('cross-package path import'));
  }
});

test('adjacent tests and plugin packages cannot inherit component exceptions', () => {
  for (const importer of [
    'tests/ipc/other.test.mjs',
    'tests/ipc/nested/reap.test.mjs',
    'packages/echo-a/src/index.ts',
  ]) {
    for (const [, target] of pairs)
      assert.ok(check(importer, target).includes('cross-package path import'));
  }
});

test('scope qualification permissions remain exact importer-target pairs', () => {
  for (const importer of [
    'tests/ipc/scope-correction.test.mjs',
    'tests/ipc/scope-wire.test.mjs',
  ]) {
    for (const [, target] of pairs) {
      if (
        !pairs.some(
          ([file, allowed]) => file === importer && allowed === target,
        )
      )
        assert.ok(
          check(importer, target).includes('cross-package path import'),
        );
    }
    assert.ok(
      violations(
        path.join(root, importer),
        "import Ajv from 'ajv/dist/2020.js';",
        root,
      ).includes('undeclared external import'),
    );
  }
});

test('scheduler and reap exceptions do not widen external dependency permissions', () => {
  for (const importer of [
    'tests/ipc/scheduler.test.mjs',
    'tests/ipc/reap.test.mjs',
  ]) {
    assert.ok(
      violations(
        path.join(root, importer),
        "import Ajv from 'ajv/dist/2020.js';",
        root,
      ).includes('undeclared external import'),
    );
    assert.ok(
      violations(
        path.join(root, importer),
        "import { x } from '@alica/kernel/private';",
        root,
      ).includes('non-public or undeclared package import'),
    );
  }
});
