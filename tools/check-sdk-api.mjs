import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as sdk from '@alica/plugin-sdk';
import * as testkit from '@alica/testkit';
const expected = {
  'plugin-sdk': [
    'clientEndpoint',
    'createPluginContext',
    'definePlugin',
    'onceDisposer',
  ],
  testkit: ['TestCell', 'createTestCell'],
};
mkdirSync('api', { recursive: true });
for (const [name, module] of [
  ['plugin-sdk', sdk],
  ['testkit', testkit],
]) {
  assert.deepEqual(Object.keys(module).sort(), expected[name]);
  const declaration = readFileSync(`packages/${name}/dist/index.d.ts`, 'utf8');
  assert(!declaration.includes('@alica/kernel'));
  const path = `api/${name}.d.ts`;
  if (process.argv.includes('--update')) writeFileSync(path, declaration);
  else
    assert.equal(
      declaration,
      readFileSync(path, 'utf8'),
      `${name}: public API changed; compatibility review required`,
    );
}
console.log('SDK/testkit runtime exports and declaration snapshots passed');
