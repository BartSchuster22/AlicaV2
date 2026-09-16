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
import path from 'node:path';
const repo = process.cwd(),
  temp = mkdtempSync(path.join(tmpdir(), 'alica-g5-external-'));
const logs = [],
  packs = {};
function run(command, args, cwd) {
  try {
    const out = execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    logs.push({
      command: [
        command === process.execPath ? 'node' : command,
        ...args.map((a) => a.replaceAll(temp, '$TMP')),
      ],
      output: out,
    });
    return out;
  } catch (e) {
    console.error(e.stdout?.toString(), e.stderr?.toString());
    throw e;
  }
}
function hashFiles(dir) {
  return Object.fromEntries(
    readdirSync(dir)
      .sort()
      .map((n) => [n, readFileSync(path.join(dir, n), 'utf8')]),
  );
}
try {
  const artifacts = path.join(temp, 'artifacts');
  mkdirSync(artifacts);
  for (const name of [
    'acap-types',
    'acap-contracts',
    'plugin-sdk',
    'testkit',
    'alicac',
    'kernel',
  ]) {
    const [packed] = JSON.parse(
      run(
        'npm',
        [
          'pack',
          path.join(repo, 'packages', name),
          '--pack-destination',
          artifacts,
          '--json',
          '--ignore-scripts',
        ],
        repo,
      ),
    );
    packs[name] = path.join(artifacts, packed.filename);
    assert(
      packed.files.every(
        (f) =>
          !/(?:^|\/)(?:src|keys|node_modules)(?:\/|$)|\.(?:pem|key|env)$/.test(
            f.path,
          ),
      ),
    );
    if (['plugin-sdk', 'testkit'].includes(name))
      for (const file of packed.files.filter((f) =>
        /\.(?:js|ts)$/.test(f.path),
      ))
        assert(
          !/@alica\/kernel|\.\.\/\.\.\/packages\//.test(
            readFileSync(path.join(repo, 'packages', name, file.path), 'utf8'),
          ),
        );
  }
  const project = path.join(temp, 'author');
  mkdirSync(project);
  cpSync(path.join(repo, 'examples/sdk-tutorial'), project, {
    recursive: true,
  });
  run(
    'npm',
    [
      'install',
      '--no-save',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      ...[
        'acap-types',
        'acap-contracts',
        'plugin-sdk',
        'testkit',
        'alicac',
      ].map((n) => packs[n]),
    ],
    project,
  );
  const manifest = JSON.parse(
    readFileSync(path.join(project, 'package.json'), 'utf8'),
  );
  assert(
    Object.values({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).every((v) => /^\d+\.\d+\.\d+$/.test(v)),
    'no transient file aliases in distributed package',
  );
  const cli = path.join(project, 'node_modules/.bin/alicac');
  run(
    cli,
    [
      'capability',
      'init',
      '--id',
      'org.tutorial.math',
      '--out',
      'starter.json',
      '--json',
    ],
    project,
  );
  run(
    cli,
    ['capability', 'validate', 'contracts/math.json', '--json'],
    project,
  );
  run('npm', ['run', 'build'], project);
  const generated = hashFiles(path.join(project, 'generated'));
  run('npm', ['run', 'build'], project);
  assert.deepEqual(hashFiles(path.join(project, 'generated')), generated);
  run('npm', ['test'], project);
  const report = JSON.parse(
    run(
      cli,
      [
        'conformance',
        'run',
        '--provider',
        'dist/provider.js',
        '--fixtures',
        'conformance.json',
        '--json',
      ],
      project,
    ),
  );
  assert.equal(report.passed, true);
  mkdirSync(path.join(project, 'keys'));
  writeFileSync(
    path.join(project, 'keys', 'excluded.key'),
    'SYNTHETIC PACKAGE-EXCLUSION SENTINEL—not a private key',
  );
  run('npm', ['run', 'verify'], project);
  run('npm', ['run', 'run'], project);
  run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import assert from 'node:assert/strict';import {createRequire} from 'node:module';const require=createRequire(import.meta.url);assert.throws(()=>require.resolve('@alica/kernel'),e=>e.code==='MODULE_NOT_FOUND');for(const p of ['@alica/plugin-sdk/dist/index.js','@alica/testkit/dist/index.js'])assert.throws(()=>require.resolve(p),e=>e.code==='ERR_PACKAGE_PATH_NOT_EXPORTED')",
    ],
    project,
  );
  // Compiled declaration tests must reject a generated-client input of the wrong type.
  writeFileSync(
    path.join(project, 'src', 'negative.ts'),
    "import {createClient} from '../generated/client.mjs';import type {ClientEndpoint} from '@alica/acap-contracts';declare const session:ClientEndpoint;const client=createClient(session);\n// @ts-expect-error descriptor requires integer inputs\nclient.add({left:'wrong',right:1},{deadlineMs:1});\n",
  );
  run(
    process.execPath,
    ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.json'],
    project,
  );
  rmSync(path.join(project, 'src', 'negative.ts'));
  const [plugin] = JSON.parse(
    run(
      'npm',
      ['pack', '--pack-destination', artifacts, '--json', '--ignore-scripts'],
      project,
    ),
  );
  assert(
    !plugin.files.some(
      (f) => f.path.startsWith('keys/') || f.path.startsWith('src/'),
    ),
  );
  const host = path.join(temp, 'operator');
  mkdirSync(host);
  writeFileSync(
    path.join(host, 'package.json'),
    '{"name":"isolated-operator","version":"1.0.0","private":true,"type":"module"}\n',
  );
  run(
    'npm',
    [
      'install',
      '--no-save',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      ...['acap-types', 'acap-contracts', 'plugin-sdk', 'kernel'].map(
        (n) => packs[n],
      ),
      path.join(artifacts, plugin.filename),
    ],
    host,
  );
  cpSync(
    path.join(project, 'operator-run.mjs'),
    path.join(host, 'operator-run.mjs'),
  );
  const production = JSON.parse(
    run(
      process.execPath,
      ['--experimental-vm-modules', 'operator-run.mjs'],
      host,
    ).trim(),
  );
  assert.equal(production.result, 42);
  assert.equal(production.level, 'PROVIDER');
  const result = {
    schemaVersion: 'alica.g5-external/v1',
    level: 'PROVIDER',
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    runtime: process.version,
    publicImportsOnly: true,
    authorProjectHasNoKernel: true,
    separateOperatorProject: true,
    deterministicGeneration: true,
    negativeTypeCheck: true,
    packageFiles: plugin.files.map((f) => f.path),
    conformance: report,
    production,
    commands: logs,
  };
  if (process.env.G5_REPORT)
    writeFileSync(
      process.env.G5_REPORT,
      JSON.stringify(result, null, 2) + '\n',
    );
  if (process.env.G5_KIT) {
    mkdirSync(process.env.G5_KIT);
    cpSync(artifacts, path.join(process.env.G5_KIT, 'packages'), {
      recursive: true,
    });
    cpSync(
      path.join(repo, 'examples/sdk-tutorial'),
      path.join(process.env.G5_KIT, 'tutorial'),
      { recursive: true },
    );
    cpSync(
      path.join(repo, 'docs/sdk'),
      path.join(process.env.G5_KIT, 'docs/sdk'),
      { recursive: true },
    );
    cpSync(path.join(repo, 'api'), path.join(process.env.G5_KIT, 'api'), {
      recursive: true,
    });
    writeFileSync(
      path.join(process.env.G5_KIT, 'README.md'),
      '# ALICA G5 private SDK kit\n\nStart with docs/sdk/TUTORIAL.md. Public API and limitations: docs/sdk/API.md and docs/sdk/TESTKIT.md. Package archives are in packages/. No keys or credentials are included. Registry/transitive dependency access is required; this is not an offline installer.\n',
    );
  }
  console.log(
    JSON.stringify({ ...result, commands: logs.map((l) => l.command) }),
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
