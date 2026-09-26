// Parse-only source selection/closure test. NEVER imports/evaluates assembler.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root=new URL('../',import.meta.url);
const mode=process.argv[2];
const source=fs.readFileSync(new URL(mode==='original'?'baseline/g7-runtime-assembly.mjs':'tools/g7-runtime-assembly.mjs',root),'utf8');
const sha=b=>createHash('sha256').update(b).digest('hex');
const selected=source.match(/const tools = (\[[\s\S]*?\]);/);
assert(selected);assert(/^[\s\[\]',a-z0-9.\-]+$/.test(selected[1]));
const tools=vm.runInNewContext(selected[1],{}, {timeout:100});
assert(source.includes("for (const name of tools)\n    name.endsWith('.mjs') ? transform('tools/' + name) : copy('tools/' + name);"));
assert(source.includes("put('runtime/' + p, output);"));
const reached=new Map();
function closure(name){
 assert(tools.includes(name),'selected package missing '+name);
 if(reached.has(name))return;
 const bytes=fs.readFileSync(new URL('tools/'+name,root));reached.set(name,bytes);
 // Parsing reveals static dependency specifiers without link/evaluate/import.
 const m=new vm.SourceTextModule(bytes.toString());
 assert(!/\bimport\s*\(/.test(bytes.toString()),'scope excludes dynamic imports');
 for(const spec of m.dependencySpecifiers){
  if(spec.startsWith('node:'))continue;
  assert(spec.startsWith('./')&&!spec.slice(2).includes('/'),'unexpected closure edge');
  closure(spec.slice(2));
 }
}
closure('g7-cell-rotation.mjs');
assert.equal(reached.size,3);
assert.equal(fs.readFileSync(new URL('tools/g7-owner-ingress-config.mjs',root),'utf8').trim().split('\n').at(-1),'export default null;');
// Execute ONLY exact pure inventory projection from the assembly output loop.
const start=source.indexOf('  for (const [p, b] of [...files].sort');
assert(start>0);
const loop=source.slice(start,source.indexOf('  inventory.sort',start));
assert(loop.includes("writeFileSync(join(destination, p), b,"));
const projection=loop.match(/inventory\.push\(\{[\s\S]*?\}\);/)[0];
const inventory=[];
for(const [name,b] of reached)vm.runInNewContext(projection,{inventory,p:'runtime/tools/'+name,b,sha,executable:false},{timeout:100});
for(const [name,b] of reached){const row=inventory.find(e=>e.path==='runtime/tools/'+name);assert.equal(row.sha256,sha(b));assert.equal(row.bytes,b.length);}
assert(source.includes("writeFileSync(join(destination, 'runtime-inventory.json'), json(result)"));
const guard=source.slice(source.indexOf('  const pinnedPaths ='),source.indexOf('  const result ='));
assert(guard.includes("pinnedPaths.has('runtime/' + target)"));
const relativeEdges=[{from:'tools/g7-cell-rotation.mjs',target:'tools/g7-owner-ingress.mjs'},{from:'tools/g7-owner-ingress.mjs',target:'tools/g7-owner-ingress-config.mjs'}];
const fail=(v,m)=>{if(!v)throw Error(m);};
vm.runInNewContext(guard,{inventory,relativeEdges,fail},{timeout:100});
assert.throws(()=>vm.runInNewContext(guard,{inventory:inventory.slice(0,-1),relativeEdges,fail},{timeout:100}),/unpackaged/);
console.log('PASS packaging: actual selector, 3-module transitive closure, exact pure pinned inventory projection, missing-output guard. No assembler/runtime/native/bootstrap execution; not whole-repository closure.');
