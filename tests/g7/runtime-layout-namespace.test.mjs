// G7-06 / WP6: pure dependency-layout namespace collision regression.
// Synthetic strings/metadata only. No filesystem writes, native/Cell/assembler,
// child process, socket, clock, signing, or external package imports.
import assert from 'node:assert/strict';
import { dependencyLayout } from '../../tools/g7-runtime-layout.mjs';
const entry = path => Object.freeze({path:'runtime/node_modules/'+path,bytes:7,sha256:'a'.repeat(64)});
let cases=0;
for (const paths of [
  ['pkg/item','pkg/item/child.js'],
  ['pkg/item/child.js','pkg/item'],
  ['pkg/ITEM','pkg/item/child.js'],
  ['pkg/item/child.js','pkg/ITEM'],
  ['pkg/item','pkg/item/sub/child.js'],
  ['pkg/item/sub/child.js','pkg/item'],
]) {
  const input=Object.freeze(paths.map(entry));
  const before=JSON.stringify(input);
  assert.throws(()=>dependencyLayout(input),/invalid or colliding dependency output/,
    'must reject file/directory namespace collision: '+paths.join(' | '));
  assert.equal(JSON.stringify(input),before);
  cases++;
}
// Shared directories and string-prefix siblings are NOT collisions.
for (const paths of [
  ['pkg/item/a.js','pkg/item/b.js'],
  ['pkg/item','pkg/item-more/child.js'],
  ['pkg/item','pkg/item.js'],
  ['pkg/a/b.js','pkg/a/c/d.js'],
  ['ajv/.runkit_example.js','ajv/dist/2020.js'],
]) {
  const input=Object.freeze(paths.map(entry));
  const before=JSON.stringify(input);
  const output=dependencyLayout(input);
  assert.equal(output.length,input.length);
  for(let i=0;i<input.length;i++) {
    assert.equal(output[i].source,input[i].path);
    assert.equal(output[i].sha256,input[i].sha256);
    assert.equal(output[i].bytes,input[i].bytes);
  }
  assert.equal(JSON.stringify(input),before);
  cases++;
}
// A failed invocation must not poison a subsequent valid layout.
assert.deepEqual(dependencyLayout([entry('pkg/item')]),dependencyLayout([entry('pkg/item')]));
cases++;
console.log('PASS dependency-layout namespace collision regression: '+cases+' synthetic cases; no assembler/native/runtime invocation.');
