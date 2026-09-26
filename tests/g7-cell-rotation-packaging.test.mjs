// Build-free extraction test. Never import/evaluate assembly, Cell, or helper.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import vm from 'node:vm';
const sha = b => createHash('sha256').update(b).digest('hex');
const root = new URL('../', import.meta.url);
const baseline = readFileSync(new URL('tests/fixtures/g7-runtime-assembly-before-rotation.mjs', root), 'utf8');
assert.equal(sha(baseline), '395f0f7d4b797400ed98e00f64bb3a958b48cbfd9ed8b2b6240d3fcacbd6794b');
const mode = process.argv[2];
assert.ok(['baseline', 'fixed'].includes(mode));
const corrected = readFileSync(new URL('tools/g7-runtime-assembly.mjs', root), 'utf8');
assert.equal(corrected, baseline.replace("  'g7-cell.mjs',\n", "  'g7-cell.mjs',\n  'g7-cell-rotation.mjs',\n"));
const assembly = mode === 'baseline' ? baseline : corrected;
const cell = readFileSync(new URL('tools/g7-cell.mjs', root), 'utf8');
const helper = readFileSync(new URL('tools/g7-cell-rotation.mjs', root), 'utf8');
// Deliberate candidate pins for the history slice. Historical b2b8c7b0 pins:
// Cell 148a8058d1d9ae6746aa283534c20cbe1b75b30b40e1be8607cdf0966aa95b08
// helper a0a1a25541db473d296d1fdbb2dbc43bcd118cf9f08dcf25a3c4c581dd9a7d34
// The immutable assembler fixture and every selection/provenance check remain.
assert.equal(sha(cell), 'e6df0ce4d136a871c6ca23eb298c49bec3646b38bcb69b599b42cbe6fb352bef');
assert.equal(sha(helper), '95d4ec5514869f7bdcca839cb6f6c6a77fb6a75c7254e743847462256e637213');
function slice(start, end) {
  assert.equal(assembly.split(start).length, 2, 'unique start');
  assert.equal(assembly.split(end).length, 2, 'unique end');
  const a = assembly.indexOf(start), b = assembly.indexOf(end, a);
  assert.ok(b > a);
  return assembly.slice(a, b);
}
// Exactly these reviewed fragments from the pinned ordinary source execute.
const list = slice('const tools = [', '// Lexical source selection only.');
const put = slice('  const put = (p, b) => {', '  for (const [p, b] of age.files)');
const transform = slice('  function transform(p) {', "  copy('package.json');");
const selection = slice('  for (const name of tools)', '  for (const p of [');
const inventoryLoop = slice('  for (const [p, b] of [...files].sort', '  inventory.sort(');
const provenance = slice('      inputs: Object.fromEntries([...inputs].sort()),', '      typescript: ts.version,\n      ageInventorySha256:');
const files = new Map(), inputs = new Map(), transformations = [], inventory = [];
const reads = [], stats = [], writes = new Map(), parses = [];
const names = [...list.matchAll(/^  '([^']+)',$/gm)].map(m => m[1]);
assert.equal(new Set(names).size, names.length);
const helperPath = 'tools/g7-cell-rotation.mjs';
const outputPath = 'runtime/' + helperPath;
// Other closed-list members are empty synthetic byte fixtures, NOT disk reads.
const fixtures = new Map(names.map(n => ['tools/' + n, Buffer.from('')]));
fixtures.set('tools/g7-cell.mjs', Buffer.from(cell));
fixtures.set(helperPath, Buffer.from(helper));
const edgeLine = cell.split('\n').find(l => /^import .* from '\.\/g7-cell-rotation\.mjs';$/.test(l));
assert.ok(edgeLine, 'actual Cell static helper dependency');
// Explicit AST mock presents that real edge only; not a TypeScript/parser test.
const ts = {
  ScriptTarget: { Latest: 99 }, ScriptKind: { JS: 1 }, SyntaxKind: { ImportKeyword: 2 },
  createSourceFile(p, text) {
    assert.equal(text, fixtures.get(p).toString()); parses.push(p);
    return { parseDiagnostics: [], children: p === 'tools/g7-cell.mjs'
      ? [{ kind: 'import', moduleSpecifier: { literal: true, text: './g7-cell-rotation.mjs' } }] : [] };
  },
  isStringLiteral: n => n.literal === true,
  isImportDeclaration: n => n.kind === 'import',
  isExportDeclaration: () => false,
  isCallExpression: () => false,
  forEachChild: (n, visit) => (n.children ?? []).forEach(visit),
};
const context = vm.createContext({
  Buffer, files, inputs, transformations, inventory, ts, sha, posix,
  source: '/mock-source', destination: '/mock-output',
  join: posix.join, dirname: posix.dirname, builtinModules: [], exports: new Map(),
  fail: (v, m) => assert.ok(v, m),
  read(p) {
    assert.ok(fixtures.has(p), 'deny unlisted mock read: ' + p);
    reads.push(p); const b = fixtures.get(p); inputs.set(p, sha(b)); return b;
  },
  lstatSync(p) {
    assert.equal(p, '/mock-source/' + helperPath); stats.push(p);
    return { isFile: () => true };
  },
  mkdirSync(p) { assert.ok(p.startsWith('/mock-output/runtime/tools')); },
  writeFileSync(p, b, options) {
    assert.ok(p.startsWith('/mock-output/runtime/tools/'));
    assert.equal(options.flag, 'wx'); assert.equal(options.mode, 384);
    assert.ok(!writes.has(p)); writes.set(p, Buffer.from(b));
  },
}, { codeGeneration: { strings: false, wasm: false } });
new vm.Script(list + put + transform + selection + inventoryLoop +
  '\nglobalThis.receipt = ({' + provenance + '});',
  { filename: 'audited-assembly-fragments' }).runInContext(context, { timeout: 1000 });
assert.deepEqual(stats, ['/mock-source/' + helperPath]);
assert.equal(files.get('runtime/tools/g7-cell.mjs').toString(), cell);
assert.equal(reads.filter(p => p === helperPath).length, files.has(outputPath) ? 1 : 0);
assert.equal(parses.includes(helperPath), files.has(outputPath));
console.log('Relative Cell edge existence check passed; helper selected=' + files.has(outputPath));
// This assertion intentionally fails against the unchanged published inventory.
assert.ok(files.has(outputPath), 'closed tools selection must ship tools/g7-cell-rotation.mjs');
assert.equal(files.get(outputPath).toString(), helper);
assert.equal(writes.get('/mock-output/' + outputPath).toString(), helper);
const item = inventory.filter(e => e.path === outputPath);
assert.equal(item.length, 1);
assert.equal(item[0].sha256, sha(helper));
assert.equal(item[0].bytes, Buffer.byteLength(helper));
assert.equal(item[0].mode, 384);
assert.equal(context.receipt.inputs[helperPath], sha(helper));
const records = context.receipt.transformations.filter(e => e.source === helperPath);
assert.equal(records.length, 1);
assert.equal(records[0].output, outputPath);
assert.equal(records[0].sourceSha256, sha(helper));
assert.equal(records[0].outputSha256, sha(helper));
assert.equal(records[0].edges.length, 0);
assert.equal(files.size, names.length);
assert.equal(inventory.length, names.length);
assert.equal(writes.size, names.length);
console.log('PASS: literal closed-list selection -> transform -> output/inventory/provenance at ' + outputPath);
console.log('Mock I/O only; deliberately pinned history-slice Cell/helper; no module evaluation/native/build/signing');
