import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { violations } from '../../tools/check-boundaries.mjs';
import * as publicModule from '@alica/acap-types';
const root = process.cwd();
test('boundary CLI fails on planted source violation', () => {
  const d = mkdtempSync(path.join(tmpdir(), 'alica-boundary-test-'));
  try {
    for (const folder of ['packages/bad/src', 'tests/foundation', 'tools'])
      mkdirSync(path.join(d, folder), { recursive: true });
    writeFileSync(
      path.join(d, 'packages/bad/src/index.ts'),
      "import '/srv/alica-v1/private.js';",
    );
    const result = spawnSync(
      process.execPath,
      ['tools/check-boundaries.mjs', d],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /absolute import/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
test('Cell/admin Ajv declaration is limited to exact host importers and target', () => {
  const allowed = "import { Ajv2020 } from 'ajv/dist/2020.js';";
  for (const importer of ['tools/g7-cell.mjs', 'tools/g7-admin.mjs']) {
    assert.deepEqual(violations(path.join(root, importer), allowed, root), []);
    for (const target of ['ajv', 'ajv/dist/jtd.js', 'unapproved-runtime'])
      assert.ok(
        violations(
          path.join(root, importer),
          `import '${target}';`,
          root,
        ).includes('undeclared external import'),
      );
  }
  for (const file of [
    'tools/other.mjs',
    'tools/g7-cell-cli.mjs',
    'tests/g7/arbitrary.mjs',
    'packages/consumer/src/index.ts',
    'packages/plugin-sdk/src/index.ts',
  ])
    assert.ok(
      violations(path.join(root, file), allowed, root).includes(
        'undeclared external import',
      ),
    );
});
test('built public entry has no accidental runtime implementation', () =>
  assert.deepEqual(Object.keys(publicModule), []));
for (const [name, code] of [
  ['deep import', "import type { X } from '@alica/acap-types/src/index';"],
  ['cross-package relative', "export * from '../../kernel/src/index.js';"],
  ['V1 absolute', "import '/srv/alica-v1/private.js';"],
  ['dynamic computed', 'import(variable);'],
  ['undeclared external', "import 'unapproved-runtime';"],
  ['developer tooling from package', "import type * as ts from 'typescript';"],
  ['host dependency from package', "import 'node:fs';"],
  ['escape to repo tools', "import '../../../tools/check-boundaries.mjs';"],
])
  test('reject ' + name, () =>
    assert.ok(
      violations(path.join(root, 'packages/consumer/src/index.ts'), code, root)
        .length,
    ),
  );
test('accept public type import', () =>
  assert.deepEqual(
    violations(
      path.join(root, 'packages/consumer/src/index.ts'),
      "import type { JsonValue } from '@alica/acap-types';",
      root,
    ),
    [],
  ));
test('package exports reject deep runtime import', () => {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', "import '@alica/acap-types/dist/index.js';"],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
});
test('planted synthetic token is rejected without leaking its value', () => {
  const d = mkdtempSync(path.join(tmpdir(), 'alica-secret-test-'));
  const token = 'gh' + 'p_' + 'A'.repeat(36);
  try {
    const p = path.join(d, 'fixture.txt');
    writeFileSync(p, token);
    const r = spawnSync('python3', ['tools/check-secrets.py', '--path', p], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /credential pattern/);
    assert.ok(!r.stdout.includes(token));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
test('ordinary public data passes secret scanner', () => {
  const d = mkdtempSync(path.join(tmpdir(), 'alica-safe-test-'));
  try {
    const p = path.join(d, 'fixture.txt');
    writeFileSync(p, 'public example');
    assert.equal(
      spawnSync('python3', ['tools/check-secrets.py', '--path', p]).status,
      0,
    );
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
