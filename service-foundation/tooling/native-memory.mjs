// Trusted operator composition. Not exported to plugins or HTTP clients.
import {readFileSync,readdirSync,realpathSync,statSync} from 'node:fs';
import {dirname,join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {rawDigest,canonical} from '@alica/acap-contracts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=join(root,'services/memoryv4/provider.mjs');
function inventory(path,out,seen){
 const p=realpathSync(path);if(seen.has(p))return;seen.add(p);
 if(seen.size>12000)throw Error('native inventory entry limit');
 const s=statSync(p);
 if(s.isDirectory()){for(const name of readdirSync(p).sort())inventory(join(p,name),out,seen);}
 else if(s.isFile()){
  if(s.size>67108864||(out.bytes=(out.bytes??0)+s.size)>536870912)throw Error('native inventory byte limit');
  out.set(p,rawDigest(readFileSync(p)));
 }
}
export function memoryNativeArtifacts(python){
 if(!isAbsolute(python))throw Error('explicit absolute interpreter required');
 const files=new Map(),seen=new Set();
 for(const p of [fileURLToPath(import.meta.url),join(root,'service-foundation/tooling/native-memory-composition.mjs'),join(root,'package.json'),source,join(root,'services/memoryv4/bridge.py'),join(root,'services/memoryv4/app'),join(root,'packages/plugin-sdk/package.json'),join(root,'packages/acap-contracts/package.json'),join(root,'packages/plugin-sdk/dist'),join(root,'packages/acap-contracts/dist'),join(root,'packages/acap-contracts/schemas'),python,join(dirname(dirname(python)),'pyvenv.cfg')])inventory(p,files,seen);
 for(const dep of ['ajv','fast-deep-equal','fast-uri','json-schema-traverse','require-from-string'])inventory(join(root,'node_modules',dep),files,seen);
 const lib=join(dirname(dirname(python)),'lib');
 for(const version of readdirSync(lib).filter(x=>/^python\d+\.\d+$/.test(x)))inventory(join(lib,version,'site-packages'),files,seen);
 return [...files].sort(([a],[b])=>a<b?-1:1).map(([path,digest])=>({path,digest}));
}
export function memoryNativeImplementation({admission,configuration,descriptor,resolveAuthority}){
 if(!configuration||canonical(Object.keys(configuration).sort())!==canonical(['databasePath','python'])||!isAbsolute(configuration.python)||!isAbsolute(configuration.databasePath)||typeof resolveAuthority!=='function')throw Error('invalid operator configuration');
 // Require the full declared application/native dependency inventory, not a token marker file.
 const expected=memoryNativeArtifacts(configuration.python);
 if(canonical(admission.artifacts)!==canonical(expected))throw Error('native inventory is incomplete or changed');
 let service;
 return {implementation:{admission,configuration,async activate(ctx,cfg){
  // Host verifies inventory before this first native-module evaluation.
  const {memoryProvider}=await import('../../services/memoryv4/provider.mjs');
  service=memoryProvider(descriptor,resolveAuthority,cfg);
  await service.plugin.activate(ctx);
 }},active:()=>service?.active()??0};
}
