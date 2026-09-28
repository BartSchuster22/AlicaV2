// OFFLINE proof only; no live runner, key reference or discovery invocation.
// The subsequent --continue-live entry requires this exact-source PASS record.
import assert from 'node:assert/strict';
import { readFileSync,readdirSync,existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sourceDigest,sourceManifest,durableNew,sha,observed } from '../providers/typesafe-jev/continuation.mjs';
const repo=process.cwd(),dir=join(repo,'docs/phase4/evidence');
const proofFile=join(dir,'CONTINUATION-FIXTURE-PROOF.json'),logFile=join(dir,'CONTINUATION-TESTS.log'),fixtureFile=join(dir,'CONTINUATION-EXTERNAL-FIXTURE.json'),manifestFile=join(dir,'CONTINUATION-SOURCE-SHA256SUMS');
assert.equal(process.argv.length,2);for(const p of [proofFile,logFile,fixtureFile,manifestFile])assert(!existsSync(p),'Existing proof/evidence is never overwritten');
const digest=sourceDigest(repo);
const env={PATH:process.env.PATH,HOME:process.env.HOME,NODE_PATH:'',NODE_OPTIONS:''};
const files=['contract','provider','external'].flatMap(d=>readdirSync(join(repo,'services/decision/tests',d)).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'services/decision/tests/'+d+'/'+f));
let tests;
try{tests=execFileSync(process.execPath,['--experimental-vm-modules','--test-reporter=tap','--test',...files],{cwd:repo,env,encoding:'utf8',timeout:120000});}
catch(e){durableNew(logFile,String(e.stdout??'')+String(e.stderr??''));throw new Error('CONTINUATION_FIXTURE_TESTS_FAILED');}
durableNew(logFile,tests);
const count=Number(tests.match(/^# tests (\d+)$/m)?.[1]),passed=Number(tests.match(/^# pass (\d+)$/m)?.[1]),failed=Number(tests.match(/^# fail (\d+)$/m)?.[1]),skipped=Number(tests.match(/^# skipped (\d+)$/m)?.[1]);
assert(count>0&&passed===count&&failed===0&&skipped===0);
let output;
try{output=execFileSync(process.execPath,['services/decision/tools/external.mjs','--continuation-fixture'],{cwd:repo,env,encoding:'utf8',timeout:240000});}
catch{throw new Error('CONTINUATION_INSTALLED_FIXTURE_FAILED');}
const fixture=JSON.parse(output);assert.equal(fixture.classification,'FIXTURE-TESTED-DEFENSIVE');assert.equal(fixture.level,'PUBLIC_HOST');assert.equal(fixture.stage,'complete');assert.equal(fixture.authenticatedLiveRequests,0);assert.equal(fixture.syntheticPhysicalRequests,4);assert.equal(fixture.results.length,4);assert.equal(fixture.consumerUnchanged,true);assert.equal(fixture.publicPackedArtifacts,true);assert.equal(fixture.separateConsumerAndOperatorInstalls,true);
durableNew(fixtureFile,fixture);assert.equal(sourceDigest(repo),digest);durableNew(manifestFile,sourceManifest(repo));
const proof={schema:'alica.phase4-continuation-fixture-proof/v1',status:'PASS',runtime:process.version,sourceDigest:digest,diagnosticSha256:observed.diagnosticSha256,tests:count,passed,failed,skipped,testsLogSha256:sha(readFileSync(logFile)),fixtureReportSha256:sha(readFileSync(fixtureFile)),publicHostFixture:true,fixtureAuthenticatedRequests:0,fixtureEvaluations:4};
durableNew(proofFile,proof);console.log(JSON.stringify(proof));
