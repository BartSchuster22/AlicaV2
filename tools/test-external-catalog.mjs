import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { canonical } from '@alica/acap-contracts';

const repo = process.cwd();
const temp = mkdtempSync(join(tmpdir(), 'alica-catalog-external-'));
function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      timeout: 120000,
      env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    console.error(error.stdout?.toString(), error.stderr?.toString());
    throw error;
  }
}
try {
  const artifacts = join(temp, 'packages'),
    project = join(temp, 'author');
  mkdirSync(artifacts);
  cpSync(join(repo, 'examples/catalog-author'), project, { recursive: true });
  // Check the distributed author uses only public package exports, never repository source paths.
  const allowed = new Set([
    '@alica/acap-contracts',
    '@alica/plugin-sdk',
    '@alica/testkit',
    '@alica/catalog',
    '@alica/catalog/release',
    '@alica/catalog/governance',
  ]);
  for (const file of readdirSync(project).filter((f) => f.endsWith('.mjs'))) {
    const source = readFileSync(join(project, file), 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const spec = match[1];
      assert(
        spec.startsWith('node:') ||
          /^\.\/[a-z-]+\.mjs$/.test(spec) ||
          allowed.has(spec),
        spec,
      );
    }
    assert(!source.includes('../../packages/'));
  }
  const packs = [];
  for (const name of [
    'acap-types',
    'acap-contracts',
    'plugin-sdk',
    'testkit',
    'catalog',
  ]) {
    const [packed] = JSON.parse(
      run(
        'npm',
        [
          'pack',
          join(repo, 'packages', name),
          '--pack-destination',
          artifacts,
          '--json',
          '--ignore-scripts',
        ],
        repo,
      ),
    );
    assert(
      packed.files.every(
        (f) =>
          !/(?:^|\/)(?:src|keys|node_modules)(?:\/|$)|\.(?:key|pem|env)$/.test(
            f.path,
          ),
      ),
    );
    packs.push(join(artifacts, packed.filename));
  }
  run(
    'npm',
    [
      'install',
      '--no-save',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      ...packs,
    ],
    project,
  );
  const catalogJson = (action) =>
    JSON.parse(
      run(
        process.execPath,
        [
          join(repo, 'packages/alicac/dist/index.js'),
          'catalog',
          action,
          '--root',
          join(repo, 'catalog'),
        ],
        repo,
      ),
    );
  const snapshot = catalogJson('snapshot');
  assert.equal(canonical(snapshot), canonical(catalogJson('snapshot')));
  const snapshotBytes = canonical(snapshot) + '\n';
  writeFileSync(join(project, 'snapshot.json'), snapshotBytes, { flag: 'wx' });
  writeFileSync(join(project, 'snapshot.digest'), snapshot.digest + '\n', {
    flag: 'wx',
  });
  writeFileSync(
    join(project, 'index.json'),
    canonical(catalogJson('index')) + '\n',
    { flag: 'wx' },
  );
  // The child has no Catalog source tree, Kernel package or monorepo imports.
  // Installation can need registry access; consumption below is local-only.
  const report = JSON.parse(run(process.execPath, ['verify.mjs'], project));
  assert.equal(report.manifestCorrespondence, true);
  assert.equal(report.providerAgnosticConsumer, true);
  assert.equal(report.authorProjectHasNoKernel, true);
  const result = {
    ...report,
    separateExternalProject: true,
    deterministicSnapshot: true,
    sourceRevision: run('git', ['rev-parse', 'HEAD'], repo).trim(),
  };
  if (process.env.CATALOG_REPORT)
    writeFileSync(
      resolve(process.env.CATALOG_REPORT),
      JSON.stringify(result, null, 2) + '\n',
    );
  console.log(JSON.stringify(result));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
