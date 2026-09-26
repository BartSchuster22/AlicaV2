// G7-07/WP6: synthetic write faults, real tiny scratch FS; no host exhaustion.
// Run directly: node --experimental-vm-modules tests/g7/durable-write-faults.test.mjs
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { SourceTextModule, SyntheticModule } from 'node:vm';
const source = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
// Exact production utility excerpts; no schema/Ajv/Kernel initialization.
const validation = source('packages/acap-contracts/src/validation.ts');
const excerpt = validation.slice(validation.indexOf('export class AcapError'),
  validation.indexOf('export function normalized')) +
  validation.slice(validation.indexOf('export function rawDigest'),
  validation.indexOf('export function digest('));
assert.ok(excerpt.startsWith('export class AcapError'));
// Finite type erasure of this exact excerpt, including TS parameter properties.
// No compiler/Wasm or unrelated contract initialization in the test closure.
let utilityJS = excerpt;
for (const [typed, js] of [
  ['  readonly correlationId: string;\n', ''],
  ['  readonly retryable = false;', '  retryable = false;'],
  ['    readonly code: ErrorCode,', '    code,'],
  ['    correlationId: string = randomUUID(),', '    correlationId = randomUUID(),'],
  ['    super(code);', '    super(code); this.code = code;'],
  ['fail(code: ErrorCode): never', 'fail(code)'],
  ['  ok: unknown,', '  ok,'],
  ["  code: ErrorCode = 'INVALID_ARGUMENT',", "  code = 'INVALID_ARGUMENT',"],
  ['): asserts ok {', ') {'],
  ['rawDigest(bytes: string | Uint8Array): string', 'rawDigest(bytes)'],
]) {
  assert.equal(utilityJS.split(typed).length, 2, 'exact utility type erasure');
  utilityJS = utilityJS.replace(typed, js);
}
const contracts = new SourceTextModule(
  "import {createHash, randomUUID} from 'node:crypto';\n" + utilityJS);
let injection = null;
const realWrite = fs.writeSync;
const fsModule = new SyntheticModule(Object.keys(fs), function () {
  for (const key of Object.keys(fs)) this.setExport(key,
    key === 'writeSync' ? (...args) => injection ? injection(...args) : realWrite(...args) : fs[key]);
});
const cryptoModule = new SyntheticModule(Object.keys(crypto), function () {
  for (const key of Object.keys(crypto)) this.setExport(key, crypto[key]);
});
const archive = new SourceTextModule(source('tools/g7-archive.mjs'));
const durable = new SourceTextModule(source('tools/g7-durable.mjs'));
const modules = new Map([['node:fs', fsModule], ['node:crypto', cryptoModule],
  ['@alica/acap-contracts', contracts], ['./g7-archive.mjs', archive]]);
await durable.link((name) => {
  assert.ok(modules.has(name), 'unaudited import: ' + name);
  return modules.get(name);
});
await durable.evaluate();
const {openPrivateRoot, durableWrite, readPrivate} = durable.namespace;
// Deliberately retained tiny artifacts, never /tmp or a Cell directory.
const scratch = fs.mkdtempSync(new URL('../../scratch-', import.meta.url).pathname);
const prior = Buffer.from('retained-prior');
const target = Buffer.from('replacement-payload');
let passed = 0;
function scenario(name, kind, replace = true) {
  const dir = scratch + '/' + name;
  fs.mkdirSync(dir, {mode: 0o700});
  fs.writeFileSync(dir + '/selected', prior, {mode: 0o600, flag: 'wx'});
  const before = fs.statSync(dir + '/selected', {bigint: true});
  const root = openPrivateRoot(dir);
  const boundaries = [];
  const calls = [];
  const fault = Object.assign(new Error('synthetic ' + kind), {code: kind});
  const fdCount = fs.readdirSync('/proc/self/fd').length;
  let output, thrown;
  try {
    injection = (fd, bytes, offset, length) => {
      assert.equal(bytes, target);
      calls.push([offset, length]);
      assert.ok(calls.length <= target.length + 1, 'bounded progress');
      if (kind === 'short') return realWrite(fd, bytes, offset, Math.min(2, length));
      if (calls.length === 1) return realWrite(fd, bytes, offset, 3);
      if (kind === 'zero') return 0;
      throw fault;
    };
    try {
      output = durableWrite(root, replace ? 'selected' : 'new', target,
        {replace, boundary: (b) => boundaries.push(b)});
    } catch (e) { thrown = e; }
    finally { injection = null; }
    assert.equal(fs.readdirSync('/proc/self/fd').length, fdCount, 'no descriptor leak');
    if (kind === 'short') {
      assert.equal(thrown, undefined);
      assert.equal(output, 'sha256:' + crypto.createHash('sha256').update(target).digest('hex'));
      assert.deepEqual(readPrivate(root, replace ? 'selected' : 'new'), target);
      assert.equal(calls.length, Math.ceil(target.length / 2));
      calls.forEach(([offset, length], i) => assert.deepEqual([offset, length],
        [i * 2, target.length - i * 2]));
      assert.ok(boundaries.includes(replace ? 'rename' : 'link'));
      assert.equal(boundaries.at(-1), 'directory-fsync');
      assert.deepEqual(fs.readdirSync(dir).sort(), replace ? ['selected'] : ['new', 'selected']);
    } else {
      assert.equal(output, undefined);
      if (kind === 'zero') assert.equal(thrown?.code, 'INVALID_ARGUMENT');
      else assert.equal(thrown, fault, 'original error identity propagated');
      assert.deepEqual(calls, [[0, target.length], [3, target.length - 3]]);
      assert.deepEqual(boundaries, ['open', 'write']);
      assert.deepEqual(readPrivate(root, 'selected'), prior);
      const after = fs.statSync(dir + '/selected', {bigint: true});
      for (const k of ['ino', 'size', 'mode', 'nlink', 'mtimeNs', 'ctimeNs'])
        assert.equal(after[k], before[k], 'prior ' + k);
      if (!replace) assert.equal(fs.existsSync(dir + '/new'), false);
      const residue = fs.readdirSync(dir).filter(n => n.startsWith('next-'));
      assert.equal(residue.length, 1);
      assert.deepEqual(fs.readFileSync(dir + '/' + residue[0]), target.subarray(0, 3));
      assert.equal(fs.statSync(dir + '/' + residue[0]).mode & 0o777, 0o600);
    }
    if (!replace) assert.deepEqual(readPrivate(root, 'selected'), prior);
    console.log('PASS ' + name); passed++;
  } finally { injection = null; fs.closeSync(root); }
}
for (const replace of [true, false]) {
  for (const kind of ['short', 'zero', 'ENOSPC', 'EFBIG'])
    scenario((replace ? 'replace-' : 'create-') + kind, kind, replace);
}
console.log(JSON.stringify({passed, scratch, synthetic: true, hostExhaustion: false}));
