import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  cpSync,
  rmSync,
} from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonical, digest } from '@alica/acap-contracts';
import {
  loadCatalog,
  createIndex,
  createSnapshot,
  consumeSnapshot,
} from '@alica/catalog/release';

const catalog = () => loadCatalog('catalog');
test('C11 C12 deterministic index and offline self-contained snapshot', () => {
  assert.equal(
    canonical(createIndex(catalog())),
    canonical(createIndex(catalog())),
  );
  const shape = new Ajv2020({ strict: true }).compile(
    JSON.parse(
      readFileSync('catalog/schemas/capability-index.schema.json', 'utf8'),
    ),
  );
  assert.equal(
    shape(createIndex(catalog())),
    true,
    JSON.stringify(shape.errors),
  );
  assert.equal(shape({ ...createIndex(catalog()), version: 'invalid' }), false);
  const a = createSnapshot(catalog()),
    b = createSnapshot(catalog());
  assert.equal(canonical(a), canonical(b));
  const offline = consumeSnapshot(JSON.parse(canonical(a)));
  assert.equal(offline.entries.length, 1);
  assert.equal(offline.trustVerified, false);
  assert.equal(
    offline.entries[0].descriptor.id,
    a.content.index.entries[0].identity,
  );
  const changed = structuredClone(a);
  changed.content.version = '9.0.0';
  assert.throws(() => consumeSnapshot(changed), { code: 'SNAPSHOT_INTEGRITY' });
  const badIndex = structuredClone(a);
  badIndex.content.index.entries = [];
  badIndex.digest = digest(badIndex.content);
  assert.throws(() => consumeSnapshot(badIndex), { code: 'INDEX_MISMATCH' });
  const missing = structuredClone(a);
  missing.content.files = {};
  missing.digest = digest(missing.content);
  assert.throws(() => consumeSnapshot(missing), { code: 'NONLOCAL_REFERENCE' });
});
test('C10 CLI validates, lists, shows, diffs, creates index/snapshot and validates proposals', () => {
  const dir = mkdtempSync(join(tmpdir(), 'alica-catalog-'));
  const cli = (args, cwd = process.cwd()) =>
    spawnSync(
      process.execPath,
      ['packages/alicac/dist/index.js', 'catalog', ...args],
      { cwd, encoding: 'utf8' },
    );
  try {
    const snapshot = join(dir, 'snapshot.json'),
      index = join(dir, 'index.json');
    for (const args of [
      ['validate'],
      ['list'],
      ['show', 'acap://alica.io/example/echo@1'],
      ['diff', 'catalog', 'catalog'],
      ['index', '--out', index],
      ['snapshot', '--out', snapshot],
      ['proposal', 'validate', 'catalog/proposals/echo-reference.json'],
      ['validate', '--snapshot', snapshot],
    ]) {
      const result = cli(args);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      JSON.parse(result.stdout);
    }
    assert.notEqual(
      cli(['show', 'acap://alica.io/example/missing@1']).status,
      0,
    );
    assert.notEqual(
      cli(['proposal', 'validate', 'catalog/proposals/templates/proposal.json'])
        .status,
      0,
    );
    assert.notEqual(cli(['snapshot', '--out', snapshot]).status, 0);
    const multiple = join(dir, 'multiple');
    cpSync('catalog', multiple, { recursive: true });
    const d = structuredClone(catalog().entries[0].definition);
    const descriptor = structuredClone(catalog().entries[0].descriptor);
    descriptor.version = '1.1.0';
    d.metadata.version = '1.1.0';
    d.contract.version = '1.1.0';
    d.contract.descriptor = 'next-descriptor.json';
    d.contract.digest = digest(descriptor);
    writeFileSync(
      join(multiple, 'next-descriptor.json'),
      canonical(descriptor),
    );
    writeFileSync(join(multiple, 'next-definition.json'), canonical(d));
    const release = JSON.parse(
      readFileSync(join(multiple, 'catalog.yaml'), 'utf8'),
    );
    release.definitions.push('next-definition.json');
    writeFileSync(join(multiple, 'catalog.yaml'), canonical(release));
    assert.equal(cli(['validate', '--root', multiple]).status, 0);
    const ambiguous = cli(['diff', 'catalog', multiple]);
    assert.equal(ambiguous.status, 1);
    assert.match(ambiguous.stderr, /AMBIGUOUS_DIFF_VERSION/);
    release.definitions.reverse();
    writeFileSync(join(multiple, 'catalog.yaml'), canonical(release));
    assert.match(
      cli(['diff', multiple, 'catalog']).stderr,
      /AMBIGUOUS_DIFF_VERSION/,
    );
    const moduleURL = new URL(
      '../../packages/catalog/release.mjs',
      import.meta.url,
    ).href;
    const script = join(dir, 'offline.mjs');
    writeFileSync(
      script,
      `import {readFileSync} from 'node:fs'; import {consumeSnapshot} from ${JSON.stringify(moduleURL)}; globalThis.fetch=()=>{throw Error('network forbidden')}; const result=consumeSnapshot(JSON.parse(readFileSync(${JSON.stringify(snapshot)},'utf8'))); if(result.entries.length!==1) throw Error('missing entry'); console.log('offline PASS');`,
    );
    const offline = spawnSync(process.execPath, [script], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        HTTP_PROXY: 'http://127.0.0.1:1',
        HTTPS_PROXY: 'http://127.0.0.1:1',
      },
    });
    assert.equal(offline.status, 0, offline.stderr);
    assert.match(offline.stdout, /offline PASS/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
