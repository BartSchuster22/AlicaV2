import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { CellPreparation } from '../../tools/g7-cell.mjs';
import { cellFixture } from './cell-fixture.mjs';
import { canonical } from '@alica/acap-contracts';
import { echo } from '../../tools/g3-fixtures.mjs';
const provide = (body = 'return x;') =>
  `ctx.provide(${JSON.stringify(echo)}, {echo: async x => { ${body} }});`;
async function setup(t, providerCode) {
  const dir = mkdtempSync(join(tmpdir(), 'g7-lifecycle-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const f = await cellFixture(dir, { providerCode });
  const root = join(dir, 'cell');
  mkdirSync(root, { mode: 0o700 });
  const c = new CellPreparation(root);
  await c.initialize(f.trust, f.floor);
  c.close();
  const input = join(dir, 'input.json');
  writeFileSync(
    input,
    canonical({
      archive: f.archive,
      trust: f.trust,
      authorization: f.authorization,
    }),
    { mode: 0o600 },
  );
  return { ...f, root, input };
}
async function external(f, fault) {
  const child = spawn(
    process.execPath,
    [
      '--experimental-vm-modules',
      'tests/g7/cell-lifecycle-process.mjs',
      f.root,
      f.input,
      fault,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (b) => {
    stdout += b;
  });
  child.stderr.on('data', (b) => {
    stderr += b;
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 100000);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) =>
        code === 0
          ? resolve()
          : reject(new Error(JSON.stringify({ code, signal, stdout, stderr }))),
      );
    });
    return JSON.parse(stdout);
  } finally {
    clearTimeout(timer);
  }
}
for (const fault of [
  'accepted-rename',
  'accepted-directory',
  'journal-link',
  'enospc',
  'accepted-file-delay',
]) {
  test(
    'real syscall fault remains conservative and cannot publish later: ' +
      fault,
    { timeout: 100000 },
    async (t) => {
      const f = await setup(t);
      const result = await external(f, fault);
      assert.equal(result.failure.runtime, 'NEEDS_OPERATOR');
      assert.equal(
        result.accepted,
        !['enospc', 'accepted-file-delay'].includes(fault),
      );
      if (fault === 'accepted-file-delay') assert(result.elapsedMs >= 30000);
    },
  );
}
for (const [name, code] of [
  [
    'activation hangs',
    'export async function activate() { await new Promise(() => {}); }',
  ],
  [
    'activation resolves late',
    `export async function activate(ctx) { await new Promise(r => setTimeout(r, 31000)); ${provide()} }`,
  ],
  [
    'readiness shares activation budget',
    `export async function activate(ctx) { await new Promise(r => setTimeout(r, 29000)); ${provide('await new Promise(r => setTimeout(r, 700)); return x;')} }`,
  ],
]) {
  test(
    name + ': actual IPC, no late accepted publication',
    { timeout: 100000 },
    async (t) => {
      const f = await setup(t, code);
      const result = await external(f, 'provider');
      assert.equal(result.accepted, false);
      assert(result.elapsedMs >= 29000);
      assert(result.elapsedMs < 65000);
    },
  );
}
test('throwing IPC activation preserves clean same-object status and safe conflict on retained candidate', async (t) => {
  const f = await setup(
    t,
    'export async function activate() { throw new Error("test failure"); }',
  );
  const c = new CellPreparation(f.root);
  try {
    await assert.rejects(c.install(f.archive, f.trust, f.authorization), {
      runtime: 'STOPPED',
      outcome: 'ACTIVATION_FAILED',
    });
    assert.equal(c.status().runtime, 'STOPPED');
    assert.equal(c.status().transactions[0].state, 'ABORTED');
    await assert.rejects(c.install(f.archive, f.trust, f.authorization), {
      code: 'CONFLICT',
    });
    assert.equal(c.status().runtime, 'STOPPED');
    assert.equal(existsSync(join(f.root, 'accepted.json')), false);
  } finally {
    await c.shutdown();
    c.close();
  }
});
for (const body of [
  'throw new Error("readiness failure");',
  'await new Promise(r => setTimeout(r, 1500)); return x;',
  'await new Promise(() => {});',
]) {
  test('actual IPC readiness fails closed: ' + body, async (t) => {
    const f = await setup(
      t,
      `export async function activate(ctx) { ${provide(body)} }`,
    );
    const c = new CellPreparation(f.root);
    try {
      await assert.rejects(c.install(f.archive, f.trust, f.authorization));
      await new Promise((r) => setTimeout(r, 1700));
      assert.equal(existsSync(join(f.root, 'accepted.json')), false);
    } finally {
      await c.shutdown();
      c.close();
    }
  });
}
test(
  'actual hanging IPC disposer cannot claim STOPPED or reopen admission',
  { timeout: 100000 },
  async (t) => {
    const f = await setup(
      t,
      `export async function activate(ctx) { await ctx.effect(async register => { register(async () => { await new Promise(() => {}); }); return 'owned'; }); ${provide()} }`,
    );
    const result = await external(f, 'shutdown');
    assert.equal(result.failure.runtime, 'NEEDS_OPERATOR');
    assert.equal(result.accepted, true);
    assert.equal(result.closeBlocked, true);
  },
);
test('actual committed corruption has structured conservative error and is not repaired', async (t) => {
  const f = await setup(t);
  const c = new CellPreparation(f.root);
  await c.install(f.archive, f.trust, f.authorization);
  await c.shutdown();
  const path = join(f.root, 'accepted.json');
  writeFileSync(path, '{}');
  assert.throws(() => c.status(), {
    runtime: 'NEEDS_OPERATOR',
    outcome: 'CLEANUP_UNCERTAIN',
  });
  await assert.rejects(c.recover(f.trust), { runtime: 'NEEDS_OPERATOR' });
  assert.equal(readFileSync(path, 'utf8'), '{}');
  c.close();
});
