// Executes shipped owner source with isolated dependencies. NOT real Kernel,
// signature verification, native custody, or DEV lifecycle qualification.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
const source = readFileSync(new URL('../../tools/g7-cell-owner.mjs', import.meta.url), 'utf8');
const canonical = JSON.stringify; // fixture-only deterministic encoding
const digest = x => 'sha256:' + createHash('sha256').update(canonical(x)).digest('hex');
const approved = { archive: '/fixture/archive', authorization: { id: 'approved' },
  trust: { policy: { version: 2 }, revocation: { version: 2 }, rootKeyId: 'root' } };
async function run(input, binding = digest(approved)) {
  const events = [];
  const acceptedDigest = 'sha256:' + 'a'.repeat(64);
  class Cell {
    constructor() { events.push('construct'); }
    async startAccepted(material, authorization, selection) {
      events.push('start'); assert.deepEqual(material, input.trust);
      assert.deepEqual(authorization, input.authorization);
      assert.equal(selection, acceptedDigest); return { cellId: 'fixture' };
    }
    status() { return { runtime: 'STOPPED', accepted: { sequence: 1 } }; }
    async shutdown() { events.push('shutdown'); }
    close() { events.push('close-cell'); }
  }
  const check = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
  class Exit extends Error {}
  const modules = {
    'node:fs': { closeSync() {} },

    'node:module': { createRequire: () => () => ({ guardParent() {} }) },
    'node:path': { resolve: x => x, dirname: () => '/fixture', basename: () => 'input.json' },
    '@alica/acap-contracts': { parse: JSON.parse, digest, check },
    './g7-cell.mjs': { CellPreparation: Cell },
    './g7-owner-channel.mjs': { OwnerChannel: class {
      next() { return Promise.resolve('STOP'); }
      async send(message) { events.push(message.uncertain ? 'uncertain' : 'snapshot'); }
    } },
    './g7-durable.mjs': { openPrivateRoot: () => 90,
      readPrivate: () => canonical(input) },
  };
  const context = vm.createContext({ Buffer, process: {
    argv: ['node', 'owner', '/root', '/fixture/input.json', '10', '11', acceptedDigest,
      ...(binding === null ? [] : [binding])],
    exit(code) { events.push('exit-' + code); throw new Exit(); },
  } });
  const module = new vm.SourceTextModule(source, { context,
    initializeImportMeta(meta) { meta.url = 'file:///fixture/tools/g7-cell-owner.mjs'; } });
  await module.link(name => new vm.SyntheticModule(Object.keys(modules[name]), function () {
    for (const [key, value] of Object.entries(modules[name])) this.setExport(key, value);
  }, { context }));
  await assert.rejects(module.evaluate(), Exit);
  return events;
}
for (const field of ['policy', 'revocation']) for (const delta of [-1, 1])
  test(`${field} revision ${delta} rejected before start/readiness`, async () => {
    const changed = structuredClone(approved); changed.trust[field].version += delta;
    const events = await run(changed);
    assert.deepEqual(events, ['construct', 'uncertain', 'exit-1']);
  });
for (const field of ['archive', 'authorization'])
  test(`${field} replacement rejected before start`, async () => {
    const changed = structuredClone(approved); changed[field] = 'replacement';
    assert.deepEqual(await run(changed), ['construct', 'uncertain', 'exit-1']);
  });
test('exact approved input reaches start and ordinary stop', async () => {
  const events = await run(approved);
  assert.ok(events.includes('start'));
  assert.ok(events.indexOf('start') < events.indexOf('shutdown'));
  assert.ok(events.includes('exit-0'));
});
test('ordinary non-restore continuation remains unbound', async () => {
  assert.ok((await run(approved, null)).includes('exit-0'));
});
