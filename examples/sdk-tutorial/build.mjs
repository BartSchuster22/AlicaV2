import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {canonical,digest,descriptor as validate,generateClient,generateProvider,generateDeclaration,validatePlugin} from '@alica/acap-contracts';
const d=validate(readFileSync('contracts/math.json','utf8'));
rmSync('dist',{recursive:true,force:true});mkdirSync('generated',{recursive:true});
for(const [kind,generate] of [['client',generateClient],['provider',generateProvider]]){writeFileSync(`generated/${kind}.mjs`,generate(d));writeFileSync(`generated/${kind}.d.mts`,generateDeclaration(d,kind))}
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json'],{stdio:'inherit'});
const result={...d,id:'org.tutorial.result'};writeFileSync('contracts/result.json',canonical(result)+'\n');
const requirement={capabilityId:d.id,major:1,minMinor:0,operations:['add'],features:[]};
for(const role of ['provider','consumer']){const contract=role==='provider'?d:result;const manifest={schemaVersion:'alica.plugin/v1',id:'org.tutorial.'+role,version:'1.0.0',publisher:'org.tutorial.author',execution:'inproc',entrypoint:`dist/${role}.js`,provides:[{capabilityId:contract.id,version:contract.version,descriptorDigest:digest(contract),descriptorPath:`contracts/${role==='provider'?'math':'result'}.json`}],requires:role==='consumer'?[requirement]:[],optionalRequires:[],secretReferences:[],publishedEvents:[],subscribedEvents:[]};validatePlugin(canonical(manifest),p=>new Uint8Array(readFileSync(p)));writeFileSync(`${role}.plugin.json`,canonical(manifest)+'\n')}
