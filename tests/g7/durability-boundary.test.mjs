// G7-10: real tiny FS operations with narrowly injected syscall/callback errors.
// Run directly: node --experimental-vm-modules tests/g7/durability-boundary.test.mjs
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
let observe = null;
const fsModule = new SyntheticModule(Object.keys(fs), function () {
  for (const key of Object.keys(fs)) this.setExport(key,
    typeof fs[key] === "function" ? (...args) => observe ? observe(key, args) : fs[key](...args) : fs[key]);
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
// No children/network/native/Cell imports. All scratch retained inside this slice.
const scratch = fs.mkdtempSync(new URL("../../scratch-", import.meta.url).pathname);
const prior = Buffer.from("prior"), target = Buffer.from("target");
let passed = 0;
function scenario(replace, faultAt) {
  const name = (replace ? "replace-" : "create-") + faultAt;
  const dir = scratch + "/" + name;
  fs.mkdirSync(dir, {mode: 0o700});
  const selected = dir + "/selected";
  if (replace) fs.writeFileSync(selected, prior, {mode: 0o600, flag: "wx"});
  const before = replace ? fs.statSync(selected, {bigint:true}) : null;
  const root = openPrivateRoot(dir);
  const fds = fs.readdirSync("/proc/self/fd").length;
  let tempfd, parentfd, fired = false, output, thrown;
  const events = [], fault = Object.assign(new Error(name), {code:"EIO"});
  function fail(label) {
    if (!fired && faultAt === label) { fired = true; throw fault; }
  }
  observe = (key, args) => {
    if (key === "openSync") {
      const fd = fs.openSync(...args);
      if (String(args[0]).includes("/next-")) { tempfd = fd; events.push("open-temp"); }
      else if (fs.fstatSync(fd).isDirectory()) { parentfd = fd; events.push("open-parent"); }
      else events.push("open-old");
      return fd;
    }
    let label;
    if (key === "writeSync") label = "write";
    if (key === "fsyncSync") label = args[0] === parentfd ? "parent-fsync" : "file-fsync";
    if (key === "renameSync") label = "rename";
    if (key === "linkSync") label = "link";
    if (key === "unlinkSync") label = "unlink";
    if (key === "closeSync") label = args[0] === tempfd ? "file-close" : args[0] === parentfd ? "parent-close" : "old-close";
    if (!label) return fs[key](...args);
    events.push("call:" + label);
    fail("before-" + label);
    const value = fs[key](...args);
    events.push("done:" + label);
    // Linux close error model: fd released even when close reports EIO.
    fail("after-" + label);
    if (label === "file-close") tempfd = undefined;
    return value;
  };
  try {
    try {
      output = durableWrite(root, "selected", target, {replace, boundary(b) {
        events.push("boundary:" + b); fail("boundary-" + b);
      }});
    } catch(e) { thrown = e; }
    finally { observe = null; }
    console.log(JSON.stringify({name, events, error:thrown?.code, originalError:thrown===fault}));
    assert.equal(fs.readdirSync("/proc/self/fd").length, fds, "no descriptor leak");
    const publish = replace ? "rename" : "link";
    const published = events.includes("done:" + publish);
    const temps = fs.readdirSync(dir).filter(x => x.startsWith("next-"));
    if (faultAt === "success") {
      assert.equal(thrown, undefined);
      assert.equal(output, "sha256:" + crypto.createHash("sha256").update(target).digest("hex"));
      const middle = replace ? ["open-old","call:old-close","done:old-close","call:rename","done:rename","boundary:rename"] : ["call:link","done:link","boundary:link","call:unlink","done:unlink","boundary:unlink"];
      assert.deepEqual(events,["open-parent","open-temp","boundary:open","call:write","done:write","boundary:write","call:file-fsync","done:file-fsync","boundary:file-fsync","call:file-close","done:file-close",...middle,"call:parent-fsync","done:parent-fsync","boundary:directory-fsync","call:parent-close","done:parent-close"]);
      assert.equal(temps.length,0);
    } else {
      assert.equal(fired,true,"fault reached");
      assert.equal(thrown,fault,"original EIO identity; never success or cleanup masking");
      assert.equal(output,undefined);
      if (!published) assert.equal(events.includes("call:parent-fsync"),false);
      if (faultAt === "before-parent-fsync") assert.equal(events.includes("done:parent-fsync"),false);
    }
    if (!published) {
      if (replace) {
        assert.deepEqual(fs.readFileSync(selected),prior);
        const after=fs.statSync(selected,{bigint:true});
        for(const k of ["ino","size","mode","nlink","mtimeNs","ctimeNs"]) assert.equal(after[k],before[k],k);
      } else assert.equal(fs.existsSync(selected),false);
      assert.equal(temps.length,1);
    } else {
      assert.deepEqual(fs.readFileSync(selected),target,"postpublication target visible; no rollback claim");
      if (replace) assert.notEqual(fs.statSync(selected,{bigint:true}).ino,before.ino);
      const linkedResidue = !replace && !events.includes("done:unlink");
      assert.equal(temps.length,linkedResidue ? 1 : 0);
      assert.equal(fs.statSync(selected).nlink,linkedResidue ? 2 : 1);
      if(linkedResidue) {
        assert.equal(fs.statSync(dir+"/"+temps[0]).ino,fs.statSync(selected).ino);
        assert.throws(()=>readPrivate(root,"selected"),{code:"PERMISSION_DENIED"});
      } else assert.deepEqual(readPrivate(root,"selected"),target);
    }
    for (const t of temps) {
      assert.deepEqual(fs.readFileSync(dir+"/"+t),target);
      assert.equal(fs.statSync(dir+"/"+t).mode % 512,0o600);
    }
    console.log("PASS " + name); passed++;
  } finally { observe=null; fs.closeSync(root); }
}
if (process.argv.includes("--baseline-close")) scenario(true,"after-file-close");
else for (const replace of [true,false]) {
  for (const point of ["success","before-file-fsync","boundary-file-fsync","after-file-close",replace?"before-rename":"before-link",replace?"boundary-rename":"boundary-link",...(!replace?["before-unlink","boundary-unlink"]:[]),"before-parent-fsync","boundary-directory-fsync"])
    scenario(replace,point);
}
console.log(JSON.stringify({passed,scratch,qualification:"same-process source component; not crash/power-loss/Cell reconciliation"}));
