import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
// Parse the generated data declaration, not a Kernel-private import.
const text = readFileSync('packages/acap-contracts/src/schema-data.ts', 'utf8');
const embedded = JSON.parse(
  runInNewContext(
    text.replace('export const schemas', 'const schemas') +
      ';JSON.stringify(schemas)',
  ),
);
for (const f of readdirSync('specs/schemas').filter((f) =>
  f.endsWith('.schema.json'),
))
  assert.deepEqual(
    embedded[f.slice(0, -12)],
    JSON.parse(readFileSync('specs/schemas/' + f, 'utf8')),
    f,
  );
console.log('Runtime schemas match frozen G1 schema sources');
