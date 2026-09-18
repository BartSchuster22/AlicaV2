import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  cpSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { assembleRuntimeDependencies } from '../../tools/g7-runtime-dependencies.mjs';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
test('actual locked runtime dependency bytes: deterministic materialization, complete file/license inventory, isolated staged AJV execution', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'g7-deps-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const first = join(dir, 'first'),
    second = join(dir, 'second');
  const bom = assembleRuntimeDependencies('.', first);
  assert.deepEqual(assembleRuntimeDependencies('.', second), bom);
  assert.deepEqual(
    bom.components.map((c) => c.name),
    [
      'ajv',
      'fast-deep-equal',
      'fast-uri',
      'json-schema-traverse',
      'require-from-string',
    ],
  );
  const actual = readdirSync(join(first, 'runtime'), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(first.length + 1))
    .sort();
  assert.deepEqual(
    actual,
    bom.inventory.map((e) => e.path),
  );
  for (const e of bom.inventory) {
    const bytes = readFileSync(join(first, e.path));
    assert.equal(bytes.length, e.bytes);
    assert.equal(sha(bytes), e.sha256);
    assert.deepEqual(readFileSync(join(second, e.path)), bytes);
  }
  for (const c of bom.components) {
    assert(c.licenses.length > 0);
    for (const p of c.licenses) assert(c.files.includes(p));
    for (const d of c.dependencies)
      assert(bom.components.some((c) => c.name === d));
  }
  const run = spawnSync(
    process.execPath,
    [
      '--input-type=commonjs',
      '-e',
      `
    const assert = require('node:assert/strict');
    const Ajv = require('./runtime/node_modules/ajv/dist/2020.js');
    const ajv = new Ajv();
    const check = ajv.compile({type:'object', required:['value'], additionalProperties:false, properties:{value:{type:'integer'}}});
    assert.equal(check({value:3}),true); assert.equal(check({value:'3'}),false);
    assert.equal(check({value:3, extra:true}),false);
    const root=process.cwd()+'/runtime/node_modules/';
    for(const p of Object.keys(require.cache)) assert(p.startsWith(root),p);
    console.log(JSON.stringify({validated:true, loaded:Object.keys(require.cache).map(p=>p.slice(root.length)).sort()}));
  `,
    ],
    { cwd: first, encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).validated, true);
  assert.throws(() => assembleRuntimeDependencies('.', first), {
    code: 'EEXIST',
  });
  assert.deepEqual(
    readFileSync(join(first, 'sbom/dependencies.json')),
    readFileSync(join(second, 'sbom/dependencies.json')),
  );
  if (process.env.G7_DEPENDENCY_EVIDENCE) {
    const dest = resolve(process.env.G7_DEPENDENCY_EVIDENCE);
    mkdirSync(dest, { recursive: true });
    cpSync(first, join(dest, 'subassembly'), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    writeFileSync(
      join(dest, 'execution.json'),
      JSON.stringify(
        { exit: run.status, stdout: run.stdout, stderr: run.stderr },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
  }
});
for (const fault of [
  'missing-lock-edge',
  'version',
  'license',
  'symlink',
  'dynamic-category',
])
  test('dependency subassembly refuses ' + fault + ' before output', (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'g7-deps-negative-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    cpSync('package-lock.json', join(dir, 'package-lock.json'));
    mkdirSync(join(dir, 'node_modules'));
    for (const p of [
      'ajv',
      'fast-deep-equal',
      'fast-uri',
      'json-schema-traverse',
      'require-from-string',
    ])
      cpSync(join('node_modules', p), join(dir, 'node_modules', p), {
        recursive: true,
      });
    if (fault === 'missing-lock-edge') {
      const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json')));
      delete lock.packages['node_modules/fast-uri'];
      writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(lock));
    } else if (fault === 'symlink') {
      symlinkSync('/etc/passwd', join(dir, 'node_modules/ajv/escape'));
    } else {
      const p = join(dir, 'node_modules/ajv/package.json');
      const m = JSON.parse(readFileSync(p));
      if (fault === 'version') m.version = '0.0.0';
      if (fault === 'license') m.license = 'UNLICENSED';
      if (fault === 'dynamic-category')
        m.optionalDependencies = { missing: '*' };
      writeFileSync(p, JSON.stringify(m));
    }
    assert.throws(() => assembleRuntimeDependencies(dir, join(dir, 'output')));
    assert(!readdirSync(dir).includes('output'));
  });
