// Synthetic SOURCE ONLY. Future explicit execution: node --experimental-vm-modules
// tests/g7/m4-source-wiring.mjs. Not enrolled in the npm *.test.mjs glob.
// Whole actual assembler, linked to boundary doubles; no real payloads or crypto.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
const sourceText = readFileSync(new URL('../../tools/g7-runtime-assembly.mjs', import.meta.url), 'utf8');
const root = '/synthetic/project';
const role = 'native/g7/build/ownership.node';
const locations = { ownershipDirectory: '/synthetic/fresh', attributionDirectory: '/synthetic/maps' };
const reached = new Error('STOP at dependency boundary; not an assembly success');
async function moduleFor(failure = null) {
  const reads = [], children = [];
  const pin = 'synthetic-pin';
  const receipt = { sources: {}, compilerArchiveSha256: pin, compilerExecutableSha256: pin,
    artifacts: { 'bridge.node': pin, launcher: pin }, outputSha256: pin };
  const fs = {
    readFileSync(p) {
      reads.push(p);
      if (failure === 'missing-source' && p === '/synthetic/fresh/ownership.node')
        throw Error('synthetic missing source');
      let value = {};
      if (p.endsWith('/receipt.json')) value = receipt;
      else if (p.endsWith('/package-lock.json')) value = { packages: { 'node_modules/typescript': { version: 'synthetic' } } };
      else if (p.endsWith('/package.json')) value = { exports: {} };
      else if (p.endsWith('/native/g6/toolchain.lock.json')) value = { version: '1', sha256: pin };
      else if (p.endsWith('/toolchain.lock.json')) value = { node: { version: 'v1', sha256: pin } };
      return Buffer.from(JSON.stringify(value));
    },
    lstatSync: () => ({ isFile: () => true, isSymbolicLink: () => false, isDirectory: () => true, nlink: 1, size: 2 }),
    readdirSync: () => [],
    writeFileSync() { throw Error('unexpected write'); }, mkdirSync() { throw Error('unexpected mkdir'); },
    renameSync() { throw Error('unexpected rename'); }, rmdirSync() { throw Error('unexpected rmdir'); },
  };
  const ts = { version: 'synthetic', ScriptTarget: { Latest: 0 }, ScriptKind: { JS: 0 },
    createSourceFile: () => ({ parseDiagnostics: [] }), isImportDeclaration: () => false,
    isExportDeclaration: () => false, isCallExpression: () => false, forEachChild() {} };
  const doubles = {
    'node:crypto': { createHash: () => ({ update() { return this; }, digest: () => pin }) },
    'node:module': { builtinModules: [], createRequire: () => () => ts },
    'node:fs': fs, 'node:path': path, 'node:url': { fileURLToPath },
    'node:child_process': { execFileSync(command, argv) {
      children.push([command, argv]);
      if (argv.includes(root + '/tools/g7-runtime-binary-inputs.py')) {
        const roles = ['bridge.node', 'launcher', 'ownership.node'].map((name) =>
          'runtime/native/' + (name === 'ownership.node' ? 'g7' : 'g6') + '/build/' + name);
        const artifacts = roles.map((path) => ({ path, sha256: pin, mapSha256: pin }));
        if (failure === 'membership') artifacts.pop();
        if (failure === 'map') artifacts[0].mapSha256 = 'wrong';
        if (failure === 'output') artifacts[0].sha256 = 'wrong';
        return Buffer.from(JSON.stringify({ files: {},
          elf: Object.fromEntries(roles.map((p) => [p, { sha256: pin }])),
          nativeAttribution: { artifacts, bindingSha256: failure === 'binding' ? 'wrong' : pin },
        }));
      }
      return Buffer.from('{}');
    } },
    './g7-runtime-layout.mjs': { dependencyLayout() { throw Error('unexpected layout'); } },
    './g7-runtime-inputs.mjs': { ageInputs: () => ({ files: [] }) },
    './g7-runtime-dependencies.mjs': { assembleRuntimeDependencies() { throw reached; } },
  };
  const module = new SourceTextModule(sourceText, {
    identifier: 'file:///synthetic/assembler.mjs',
    initializeImportMeta(meta) { meta.url = 'file:///synthetic/assembler.mjs'; },
  });
  await module.link(async (name) => {
    assert.ok(Object.hasOwn(doubles, name), name);
    const values = doubles[name];
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return { api: module.namespace, reads, children };
}
for (const explicit of [false, true]) {
  const { api, reads, children } = await moduleFor();
  const args = explicit ? [locations] : [];
  const selected = api.selectNativeInputs(root, ...args);
  assert.equal(selected.paths[role], explicit ? '/synthetic/fresh/ownership.node' : root + '/' + role);
  assert.throws(() => api.assembleRuntime(root, '/synthetic/output', '/synthetic/age', 'pin', ...args), (e) => e === reached);
  const mapped = explicit ? '/synthetic/maps' : root + '/evidence/g7/runtime-assembly/native-attribution-inputs';
  for (const name of ['binding.json', 'bridge.node.map', 'launcher.map', 'ownership.node.map'])
    assert.ok(reads.includes(mapped + '/' + name));
  assert.ok(reads.includes(selected.paths[role]));
  assert.ok(reads.includes(selected.receipt));
  const argv = children.at(-1)[1];
  assert.deepEqual(argv, ['-I', '-B', root + '/tools/g7-runtime-binary-inputs.py', root,
    ...(explicit ? [JSON.stringify(locations)] : [])]);
  if (explicit) {
    assert.ok(!reads.includes(root + '/' + role));
    assert.ok(!reads.includes(root + '/native/g7/build/receipt.json'));
    assert.ok(!reads.some((p) => p.startsWith(root + '/evidence/g7/runtime-assembly/native-attribution-inputs/')));
  }
}
const invalid = [null, {}, [], { ownershipDirectory: locations.ownershipDirectory },
  { ...locations, extra: 'no' }];
for (const value of [null, 1, '', 'relative', '/', '//synthetic/new', '/synthetic/../new',
  '/synthetic//new', '/synthetic/./new', '/synthetic/new/', root, root + '/new', 'bad\0path']) {
  for (const key of Object.keys(locations)) invalid.push({ ...locations, [key]: value });
}
for (const value of invalid) {
  const { api, reads, children } = await moduleFor();
  assert.throws(() => api.assembleRuntime(root, '/synthetic/output', null, null, value));
  assert.deepEqual(reads, []);
  assert.deepEqual(children, []);
}
for (const failure of ['missing-source', 'membership', 'map', 'output', 'binding']) {
  const { api, reads } = await moduleFor(failure);
  assert.throws(() => api.assembleRuntime(root, '/synthetic/output', '/synthetic/age', 'pin', locations),
    (e) => e !== reached);
  assert.ok(!reads.includes(root + '/' + role));
  assert.ok(!reads.includes(root + '/native/g7/build/receipt.json'));
}
