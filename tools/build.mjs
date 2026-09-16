import { execFileSync } from 'node:child_process';
for (const name of [
  'acap-types',
  'kernel',
  'echo-a',
  'echo-b',
  'echo-consumer',
])
  execFileSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', '-p', `packages/${name}/tsconfig.json`],
    { stdio: 'inherit' },
  );
