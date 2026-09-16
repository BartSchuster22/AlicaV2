import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  canonical,
  digest,
  generateClient,
  descriptor,
} from '@alica/acap-contracts';
import { echo, fixture, keyPair } from '../../tools/g3-fixtures.mjs';
const cli = path.resolve('packages/alicac/dist/index.js');
function env(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'alicac-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (name, value) => {
    const file = path.join(dir, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      typeof value === 'string' || Buffer.isBuffer(value)
        ? value
        : canonical(value),
    );
    return file;
  };
  const run = (...args) => {
    const p = spawnSync(process.execPath, [cli, ...args], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 10000,
    });
    assert(!p.error, String(p.error));
    return p;
  };
  return { dir, write, run };
}
test('CLI init/validate/generators run and preserve existing operator files', (t) => {
  const e = env(t);
  assert.equal(
    e.run('capability', 'init', '--id', 'org.test.echo', '--out', 'cap.json')
      .status,
    0,
  );
  assert.equal(e.run('capability', 'validate', 'cap.json', '--json').status, 0);
  assert.equal(
    e.run('capability', 'init', '--id', 'org.test.other', '--out', 'cap.json')
      .status,
    1,
  );
  for (const kind of ['client', 'provider']) {
    assert.equal(
      e.run(
        'capability',
        `generate-${kind}`,
        'cap.json',
        '--out',
        `${kind}.mjs`,
      ).status,
      0,
    );
    assert(
      readFileSync(path.join(e.dir, `${kind}.d.mts`), 'utf8').includes(
        '@alica/acap-types',
      ),
    );
    assert.equal(
      e.run(
        'capability',
        `generate-${kind}`,
        'cap.json',
        '--out',
        `${kind}.mjs`,
      ).status,
      1,
    );
  }
});
test('CLI rejects invalid syntax/unknown flags, duplicate JSON, and redacts diagnostics', (t) => {
  const e = env(t);
  e.write('bad.json', '{"secret":"never-print-this","secret":1}');
  for (const args of [
    ['capability', 'validate', 'bad.json', '--json'],
    ['capability', 'validate', 'bad.json', '--override', 'x', '--json'],
    ['plugin', 'execute', 'bad.json', '--json'],
  ]) {
    const p = e.run(...args);
    assert.equal(p.status, 1);
    const out = JSON.parse(p.stdout);
    assert.equal(out.valid, false);
    assert(!p.stdout.includes('never-print-this'));
    assert(!p.stdout.includes(e.dir));
  }
});
test('CLI plugin/bundle/profile validation checks linked artifacts and raw inventory', (t) => {
  const e = env(t);
  const f = fixture(keyPair());
  for (const [name, data] of Object.entries(f.files)) e.write(name, data);
  e.write('package-index.json', f.indexText);
  e.write('bundle.json', f.bundleText);
  e.write('profile.json', f.profileText);
  for (const [kind, file] of [
    ['plugin', 'plugin.json'],
    ['bundle', 'bundle.json'],
    ['profile', 'profile.json'],
  ]) {
    const p = e.run(kind, 'validate', file, '--json');
    assert.equal(p.status, 0, p.stdout);
    assert.equal(JSON.parse(p.stdout).valid, true);
  }
  e.write('dist/index.js', 'tampered');
  assert.equal(e.run('bundle', 'validate', 'bundle.json', '--json').status, 1);
});
test('CLI plugin validation denies symlink escape even for a syntactically valid path', (t) => {
  const e = env(t);
  const f = fixture(keyPair());
  for (const [name, data] of Object.entries(f.files)) e.write(name, data);
  rmSync(path.join(e.dir, 'dist/index.js'));
  symlinkSync('/etc/hostname', path.join(e.dir, 'dist/index.js'));
  const p = e.run('plugin', 'validate', 'plugin.json', '--json');
  assert.equal(p.status, 1);
  assert.equal(JSON.parse(p.stdout).error.code, 'PERMISSION_DENIED');
});
test('CLI conformance has human and machine reports and nonzero exit for wrong behavior', (t) => {
  const e = env(t);
  e.write(
    'provider.mjs',
    `export const descriptor=${canonical(echo)};export const handlers={echo:async x=>x};`,
  );
  e.write('cases.json', [
    {
      name: 'positive',
      operation: 'echo',
      input: { text: 'x' },
      expected: { text: 'x' },
    },
  ]);
  const args = [
    'conformance',
    'run',
    '--provider',
    'provider.mjs',
    '--fixtures',
    'cases.json',
  ];
  assert.match(e.run(...args).stdout, /Conformance PASS/);
  const ok = e.run(...args, '--json');
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).passed, true);
  e.write('cases.json', [
    {
      name: 'wrong',
      operation: 'echo',
      input: { text: 'x' },
      expected: { text: 'y' },
    },
  ]);
  const bad = e.run(...args, '--json');
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).passed, false);
});
test('CLI validates expected descriptor digest before running conformance', (t) => {
  const e = env(t);
  e.write(
    'provider.mjs',
    `export const descriptor=${canonical(echo)};export const handlers={echo:async x=>x};`,
  );
  e.write('cases.json', [
    {
      name: 'positive',
      operation: 'echo',
      input: { text: 'x' },
      expected: { text: 'x' },
    },
  ]);
  e.write('other.json', { ...echo, version: '1.1.0' });
  const p = e.run(
    'conformance',
    'run',
    '--provider',
    'provider.mjs',
    '--fixtures',
    'cases.json',
    '--descriptor',
    'other.json',
    '--json',
  );
  assert.equal(p.status, 1);
  assert.equal(JSON.parse(p.stdout).error.code, 'CONTRACT_MISMATCH');
});
test('stream-only provider passes conformance without unary assumptions', (t) => {
  const e = env(t);
  const d = structuredClone(echo);
  d.operations[0].kind = 'stream';
  e.write(
    'provider.mjs',
    `export const descriptor=${canonical(d)};export const handlers={echo:async function*(x){yield x}};`,
  );
  e.write('cases.json', [
    {
      name: 'stream',
      operation: 'echo',
      input: { text: 'x' },
      items: [{ text: 'x' }],
    },
  ]);
  const p = e.run(
    'conformance',
    'run',
    '--provider',
    'provider.mjs',
    '--fixtures',
    'cases.json',
    '--json',
  );
  assert.equal(p.status, 0, p.stdout);
  assert.equal(JSON.parse(p.stdout).passed, true);
});
