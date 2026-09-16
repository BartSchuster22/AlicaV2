import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), 'alica-g4-independent-'));
const env = { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' };
const run = (args) =>
  execFileSync(process.execPath, args, {
    cwd: temp,
    env,
    encoding: 'utf8',
    timeout: 30000,
  });
try {
  const archives = [];
  for (const pkg of ['acap-types', 'acap-contracts', 'alicac']) {
    const result = JSON.parse(
      execFileSync(
        'npm',
        ['pack', '--json', '--ignore-scripts', '--pack-destination', temp],
        { cwd: path.join(root, 'packages', pkg), env, encoding: 'utf8' },
      ),
    );
    archives.push(path.join(temp, result[0].filename));
  }
  writeFileSync(
    path.join(temp, 'package.json'),
    JSON.stringify({
      name: 'independent-consumer',
      version: '1.0.0',
      private: true,
      type: 'module',
      license: 'UNLICENSED',
    }),
  );
  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...archives],
    { cwd: temp, env, encoding: 'utf8', timeout: 90000 },
  );
  copyFileSync(
    'fixtures/g4/independent-provider.mjs',
    path.join(temp, 'provider.mjs'),
  );
  copyFileSync(
    'fixtures/g4/conformance.json',
    path.join(temp, 'fixtures.json'),
  );
  assert.match(
    execFileSync(path.join(temp, 'node_modules/.bin/alicac'), ['--help'], {
      cwd: temp,
      env,
      encoding: 'utf8',
    }),
    /alicac capability init/,
  );
  const cli = path.join(temp, 'node_modules/@alica/alicac/dist/index.js');
  const report = JSON.parse(
    run([
      cli,
      'conformance',
      'run',
      '--provider',
      'provider.mjs',
      '--fixtures',
      'fixtures.json',
      '--json',
    ]),
  );
  assert.equal(report.passed, true);
  const human = run([
    cli,
    'conformance',
    'run',
    '--provider',
    'provider.mjs',
    '--fixtures',
    'fixtures.json',
  ]);
  assert.match(human, /Conformance PASS/);
  writeFileSync(
    path.join(temp, 'descriptor-export.mjs'),
    "import {descriptor} from './provider.mjs';import {writeFileSync} from 'node:fs';writeFileSync('capability.json',JSON.stringify(descriptor));",
  );
  run(['descriptor-export.mjs']);
  for (const kind of ['client', 'provider']) {
    for (const name of [`generated-${kind}.mjs`, `generated-${kind}-again.mjs`])
      run([
        cli,
        'capability',
        `generate-${kind}`,
        'capability.json',
        '--out',
        name,
      ]);
    assert.equal(
      readFileSync(path.join(temp, `generated-${kind}.mjs`), 'utf8'),
      readFileSync(path.join(temp, `generated-${kind}-again.mjs`), 'utf8'),
    );
    assert.equal(
      readFileSync(path.join(temp, `generated-${kind}.d.mts`), 'utf8'),
      readFileSync(path.join(temp, `generated-${kind}-again.d.mts`), 'utf8'),
    );
  }
  // Compare against committed, deterministic reference artifacts as well.
  for (const kind of ['client', 'provider'])
    for (const ext of ['mjs', 'd.mts'])
      assert.equal(
        readFileSync(path.join(temp, `generated-${kind}.${ext}`), 'utf8'),
        readFileSync(`fixtures/g4/generated/${kind}.${ext}`, 'utf8'),
      );
  // The authored provider is separate from the generated scaffold.
  copyFileSync(
    'fixtures/g4/independent-provider.mjs',
    path.join(temp, 'provider.mjs'),
  );
  writeFileSync(
    path.join(temp, 'consumer.mjs'),
    `import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ContractProvider,ContractSession,canonical,decodeResponse,streamOutcomes,readStreamOutcomes} from '@alica/acap-contracts';
import {descriptor,handlers,invocationCount} from './provider.mjs';
import {createClient} from './generated-client.mjs';
const require=createRequire(import.meta.url);
assert.throws(()=>require.resolve('@alica/kernel'),{code:'MODULE_NOT_FOUND'});
assert.throws(()=>require.resolve('@alica/kernel/dist/index.js'),{code:'MODULE_NOT_FOUND'});
assert.throws(()=>require.resolve('@alica/acap-contracts/dist/runtime.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
const provider=new ContractProvider(descriptor,handlers);
const session=new ContractSession(provider,{caller:{principal:'org.independent.consumer',instanceId:'isolated',scope:'root'},scopeGeneration:1,authorize:()=>{}});
// Consumer endpoint crosses serialized request/response values, never accesses Kernel or provider object identity.
const wire={descriptor:JSON.parse(JSON.stringify(descriptor)),call:async(operation,input,options)=>{const q=session.request(operation,input,options);const response=await session.invoke(JSON.parse(canonical(q)));return decodeResponse(canonical(response),q.requestId)},openStream:(operation,input,options)=>{const q=JSON.parse(canonical(session.request(operation,input,options)));const encoded=streamOutcomes(q.requestId,session.stream(q));const transported=(async function*(){for await(const f of encoded)yield JSON.parse(canonical(f))})();return readStreamOutcomes(q.requestId,transported)}};
const client=createClient(wire);const options={deadlineMs:Date.now()+1000,idempotencyKey:'once'};
assert.equal(await client.add({left:2,right:3},options),5);assert.equal(await client.add({left:2,right:3},options),5);assert.equal(invocationCount(),1);
const values=[];for await(const x of client.count(3,{deadlineMs:Date.now()+1000}))values.push(x);assert.deepEqual(values,[0,1,2]);
session.close();provider.close();console.log('ISOLATED_CONSUMER_PASS kernelUnavailable=true generatedClient=true wireRoundTrip=true idempotentInvocations=1');`,
  );
  const output = run(['consumer.mjs']);
  assert.match(output, /ISOLATED_CONSUMER_PASS/);
  // Typecheck generated declarations/consumer without installing or resolving Kernel.
  writeFileSync(
    path.join(temp, 'consumer.mts'),
    "import {createClient} from './generated-client.mjs';import type {ClientEndpoint} from '@alica/acap-contracts';declare const endpoint:ClientEndpoint;const c=createClient(endpoint);c.add({left:1,right:2},{deadlineMs:100});\n// @ts-expect-error contract rejects string input\nc.add({left:'bad',right:2},{deadlineMs:100});\n",
  );
  run([
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
    '--strict',
    '--skipLibCheck',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--target',
    'ES2024',
    'consumer.mts',
  ]);
  console.log(
    JSON.stringify({
      schemaVersion: 'alica.isolated-conformance/v1',
      passed: true,
      installedPackages: [
        '@alica/acap-types',
        '@alica/acap-contracts',
        '@alica/alicac',
      ],
      kernelInstalled: false,
      generatedArtifactsDeterministic: true,
      generatedTypesChecked: true,
      wireRoundTrip: true,
      conformance: report,
    }),
  );
  console.log(output.trim());
} finally {
  rmSync(temp, { recursive: true, force: true });
}
