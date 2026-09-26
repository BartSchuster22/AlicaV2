// Public-only portable replay. Run: node --jitless --experimental-vm-modules
// tests/g7-historical-transition.test.mjs (installed TypeScript + Ajv required).
// No Kernel index/bootstrap, native module, assembler, signing or compiled copy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const root = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const ts = require('typescript');
const {Ajv2020} = require('ajv/dist/2020.js');
const synthetic = o => new vm.SyntheticModule(Object.keys(o), function() {
  for (const [k,v] of Object.entries(o)) this.setExport(k,v);
});
let effects = 0, verifies = 0;
const deny = () => { effects++; throw Error('forbidden effect'); };
const modules = {};
for (const [name,path] of Object.entries({
  inspection:'packages/kernel/src/trust-inspection.ts',
  validation:'packages/acap-contracts/src/validation.ts',
  schemas:'packages/acap-contracts/src/schema-data.ts',
})) {
  const out = ts.transpileModule(fs.readFileSync(new URL(path,root),'utf8'), {
    fileName:path, reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ES2022,strict:true},
  });
  assert.equal(out.diagnostics.length,0);
  modules[name] = new vm.SourceTextModule(out.outputText, {identifier:path,importModuleDynamically:deny});
}
const imports = new Map([
  ['node:crypto',synthetic({createHash:crypto.createHash,randomUUID:crypto.randomUUID,
    createPublicKey:crypto.createPublicKey,verify(...args){verifies++;return crypto.verify(...args);}})],
  ['node:fs',synthetic({constants:fs.constants,openSync:deny,readSync:deny,fstatSync:deny,closeSync:deny})],
  ['ajv/dist/2020.js',synthetic({Ajv2020})],
  ['./validation.js',modules.validation],['./schema-data.js',modules.schemas],
]);
await modules.inspection.link(spec => { assert(imports.has(spec),spec); return imports.get(spec); });
await modules.inspection.evaluate({timeout:1000});
const verify = modules.inspection.namespace.verifyHistoricalTrustTransition;
const fixture = JSON.parse(fs.readFileSync(new URL('tests/fixtures/g7-historical-transition-public.json',root),'utf8'));
const clone = v => JSON.parse(JSON.stringify(v));
const canonical = x => x === null || typeof x !== 'object' ? JSON.stringify(x) : Array.isArray(x)
  ? '['+x.map(canonical).join(',')+']' : '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
const hash = x => 'sha256:'+crypto.createHash('sha256').update(x).digest('hex');
const expected = {schemaVersion:'alica.historical-trust-transition/v1',classification:'AUTHENTICATED',...fixture.independentPin};
const invoke = o => {
  const now = Date.now; try { Date.now=deny; return verify(o); } finally {Date.now=now;}
};
assert.deepEqual(invoke(fixture),expected);assert(Object.isFrozen(invoke(fixture)));
let signatures = 0;
for (const [m,data,sig,domain] of [
 [fixture.priorTrust,fixture.priorTrust.policy,fixture.priorTrust.policySignature,'ALICA-TRUST-POLICY-v1'],
 [fixture.priorTrust,fixture.priorTrust.revocation,fixture.priorTrust.revocationSignature,'ALICA-REVOCATION-v1'],
 [fixture.nextTrust,fixture.nextTrust.policy,fixture.nextTrust.policySignature,'ALICA-TRUST-POLICY-v1'],
 [fixture.nextTrust,fixture.nextTrust.revocation,fixture.nextTrust.revocationSignature,'ALICA-REVOCATION-v1'],
 [fixture.priorTrust,fixture.rotation.record,fixture.rotation.oldSignature,'ALICA-ROOT-ROTATION-v1'],
 [fixture.nextTrust,fixture.rotation.record,fixture.rotation.newSignature,'ALICA-ROOT-ROTATION-v1'],
]) {
 const raw=Buffer.from(m.keys[m.rootKeyId],'base64');assert.equal(hash(raw),m.rootKeyId);
 assert.equal(sig.keyId,m.rootKeyId);
 const key=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw]),format:'der',type:'spki'});
 assert(crypto.verify(null,Buffer.from(domain+'\n'+canonical(data)),key,Buffer.from(sig.signature,'base64')));signatures++;
}
let negatives=0;
function negative(edit, repin=false) {
 const o=clone(fixture);edit(o);
 // Negative-only repinning isolates signature/schema rejection, NOT provenance.
 if(repin) for(const k of ['priorTrust','nextTrust','rotation'])o.independentPin[k+'Digest']=hash(canonical(o[k]));
 assert.deepEqual(invoke(o),{schemaVersion:'alica.historical-trust-transition/v1',classification:'UNRESOLVED'});
 negatives++;
}
for(const k of ['priorTrustDigest','nextTrustDigest','rotationDigest'])negative(o=>{o.independentPin[k]='sha256:'+'0'.repeat(64);});
for(const k of ['priorTrust','nextTrust','rotation','independentPin'])negative(o=>{delete o[k];});
negative(o=>{o.extra=true;});negative(o=>{o.independentPin.cellId='bad cell';});
for(const side of ['priorTrust','nextTrust']) {
 for(const name of ['policySignature','revocationSignature'])negative(o=>{o[side][name].signature=Buffer.alloc(64).toString('base64');},true);
 negative(o=>{o[side].policy.version++;},true);
 negative(o=>{o[side].revocation.version++;},true);
 negative(o=>{o[side].keys[o[side].rootKeyId]=Buffer.alloc(32).toString('base64');},true);
}
for(const name of ['oldSignature','newSignature'])negative(o=>{o.rotation[name].signature=Buffer.alloc(64).toString('base64');},true);
negative(o=>{o.rotation.record.nextVersion++;},true);
negative(o=>{o.priorTrust.policy.issuedAtMs=Number.MAX_SAFE_INTEGER+1;},true);
assert.equal(effects,0);
console.log('PASS portable actual historical verifier: public fixture, '+negatives+' mutation negatives, '+signatures+' independent real signatures; verifies='+verifies);

// Execute the actual full Cell method via the existing audited FS/custody mock
// harness. The latest persisted inspection remains that harness's explicit mock;
// predecessor verification below always delegates the REAL isolated verifier.
// No real Cell module/index evaluation. No fabricated signature success.
let source=fs.readFileSync(new URL('tests/g7-cell-recovery-preflight.test.mjs',root),'utf8');
const prefix="await run('one edge assessed, no admission'";
assert.equal(source.split(prefix).length,2);source=source.slice(0,source.indexOf(prefix));
const replace=(a,b)=>{assert.equal(source.split(a).length,2,a);source=source.replace(a,b);};
replace("const root = new URL('../', import.meta.url);", "const root = new URL('../', import.meta.url);\nconst cellId = publicFixture.independentPin.cellId;");
source=source.replaceAll("'cell1'",'cellId');
replace("const trust = n => ({ rootKeyId:","const trust = n => n===1 ? clone(publicFixture.priorTrust) : n===2 ? clone(publicFixture.nextTrust) : ({ rootKeyId:");
replace("revocation:{version:1,mock:'UNSIGNED'}","revocation:{version:n,mock:'UNSIGNED'}");
replace("const rotation={mock:'UNSIGNED edge '+n};","const rotation=n===1 ? clone(publicFixture.rotation) : {mock:'UNSIGNED edge '+n};");
replace("const details=[{priorTrust:trust(n),nextTrust:trust(n+1),rotation},", "if(n===1) Object.assign(b, publicFixture.independentPin);\n    const details=[{priorTrust:trust(n),nextTrust:trust(n+1),rotation},");
replace('verifyHistoricalTrustTransition: undefined,','verifyHistoricalTrustTransition: realHistorical,');
source = "import { publicFixture, realHistorical, stats, setMode } from 'test:crypto';\n"+source;
source+=`\n
let integrationCases=0;
const successful=await run('actual predecessor crypto',()=>{},'UNAVAILABLE','HISTORICAL_PIN_PROVENANCE_UNAVAILABLE',2);
assert.equal(successful.historicalTransitionsVerified,1);
assert.equal(successful.historicalPinProvenance,'UNAVAILABLE');
assert.deepEqual(Array.from(successful.missing),['independentHistoricalPinProvenance','currentEligibility','independentReplacementAuthorization','durabilityEvidence','failureInclusiveNumericFit']);
assert.equal(stats.calls,1); integrationCases++;
for(const field of ['schemaVersion','classification','cellId','priorTrustDigest','nextTrustDigest','rotationDigest']) {
 setMode(field);
 await run('reject returned '+field,()=>{},'DENIED','HISTORICAL_AUTHENTICATION_UNAVAILABLE',2);
 assert.equal(calls,0); integrationCases++;
}
setMode('throw');await run('historical exception',()=>{},'DENIED',undefined,2);assert.equal(calls,0);integrationCases++;
setMode('unresolved');await run('historical unresolved',()=>{},'DENIED','HISTORICAL_AUTHENTICATION_UNAVAILABLE',2);assert.equal(calls,0);integrationCases++;
setMode('real');
// Second predecessor unsigned: real verifier must reject, despite valid first.
await run('every predecessor required',()=>{},'DENIED','HISTORICAL_AUTHENTICATION_UNAVAILABLE',3);assert.equal(calls,0);integrationCases++;
await run('checkpoint reread after crypto',()=>{mutation=f=>f.files.set('CHECKPOINT',Buffer.from('{}'));},'DENIED','SNAPSHOT_CHANGED',2);integrationCases++;
await run('custody lost after inspection',()=>{mutation=()=>{lost=true;};},'DENIED','CUSTODY_LOST',2);integrationCases++;
// Independent checkpoint pin mismatch cannot be repaired from retained bytes.
const before=stats.calls;
await run('checkpoint pin mismatch',f=>{f.checkpoint.lineage.expected[0].binding.rotationDigest=sha('substitute');f.put('CHECKPOINT',f.checkpoint);},'DENIED',undefined,2);
assert.equal(stats.calls,before);assert.equal(calls,0);integrationCases++;
for(const mode of ['unresolved','bad-digest','bad-time','prior']) {
 await run('latest inspection preserved '+mode,()=>{inspectionMode=mode;},'DENIED',undefined,2);
 integrationCases++;
}
const beforePrior=stats.calls;
await run('failed prior release before real historical API',f=>{
 let previousHash=null;
 for(const name of f.dirs.get('transactions/'+id(3))) {
  const path='transactions/'+id(3)+'/'+name,row=JSON.parse(f.files.get(path));
  row.record.prior=release(999);row.record.previousHash=previousHash;
  row.checksum=digest(row.record);previousHash=row.checksum;f.put(path,row);
 }
},'DENIED','PRIOR_RELEASE_MISMATCH',2);
assert.equal(stats.calls,beforePrior);assert.equal(calls,0);integrationCases++;
console.log('PASS actual Cell full-method real predecessor integration:',integrationCases,'cases; FS/custody/latest-inspection explicitly mocked; production provenance UNAVAILABLE');
`;
const stats={calls:0};let mode='real';
const boundary=synthetic({publicFixture:fixture,stats,setMode:x=>{mode=x;},realHistorical:o=>{
 stats.calls++;const actual=invoke(clone(o));
 if(mode==='throw')throw Error('test boundary failure');
 if(mode==='unresolved')return {schemaVersion:'alica.historical-trust-transition/v1',classification:'UNRESOLVED'};
 return mode==='real'?actual:{...actual,[mode]:'substitute'};
}});
const method=new vm.SourceTextModule(source,{identifier:'actual-cell-preflight-harness',
 initializeImportMeta(meta){meta.url=new URL('tests/g7-cell-recovery-preflight.test.mjs',root).href;},importModuleDynamically:deny});
const allowed={'node:assert/strict':assert,'node:fs':fs,'node:crypto':crypto,'node:vm':vm};
const path=await import('node:path');allowed['node:path']=path;
const builtins=new Map(Object.entries(allowed).map(([k,v])=>[k,synthetic({...v,default:v})]));
await method.link(spec=>{if(spec==='test:crypto')return boundary;assert(builtins.has(spec),spec);return builtins.get(spec);});
await method.evaluate({timeout:10000});
assert.equal(effects,0);
console.log('PASS no historical FS/clock effects; total actual verifies='+verifies+'; keygen=0 signing=0');
