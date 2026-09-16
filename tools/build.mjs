import { mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
for (const name of [
  'acap-types',
  'acap-contracts',
  'alicac',
  'plugin-sdk',
  'testkit',
  'kernel',
  'echo-a',
  'echo-b',
  'echo-consumer',
]) {
  rmSync(`packages/${name}/dist`, { recursive: true, force: true });
  execFileSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', '-p', `packages/${name}/tsconfig.json`],
    { stdio: 'inherit' },
  );
}
rmSync('packages/acap-contracts/schemas', { recursive: true, force: true });
mkdirSync('packages/acap-contracts/schemas', { recursive: true });
for (const name of readdirSync('specs/schemas'))
  if (name.endsWith('.json'))
    copyFileSync(
      'specs/schemas/' + name,
      'packages/acap-contracts/schemas/' + name,
    );
