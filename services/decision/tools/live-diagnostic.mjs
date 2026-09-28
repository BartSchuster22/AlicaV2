// Single authorized diagnostic only. This entry point NEVER evaluates or resumes
// a prior invocation; later conditional evaluation needs fixture-verified code.
import { constants, openSync, closeSync, readFileSync, writeSync, fsyncSync, renameSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectLedger, ORIGINAL_LEDGER_SHA256, ORIGINAL_LEDGER_BYTES } from '../providers/typesafe-jev/ledger.mjs';
import { runDiscoveryDiagnostic } from '../providers/typesafe-jev/transport.mjs';
const repo='/home/alica-dev/AlicaV2-phase4';
const ledger='/home/alica-dev/.local/state/alica/phase4/physical-requests.jsonl';
const original=repo+'/docs/phase4/LIVE.json';
const target=repo+'/docs/phase4/LIVE-CONTINUATION.json';
const originalHash='a7d462fab9503e3059f4c9951ca154839b01a91bab6730d08731138918f68151';
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=()=>{throw Object.assign(new Error('FAILED_PRECONDITION'),{code:'FAILED_PRECONDITION'});};
const safe=new Set(['FAILED_PRECONDITION','CONTRACT_MISMATCH','UNAUTHENTICATED','PERMISSION_DENIED','INVALID_ARGUMENT','NOT_FOUND','RESOURCE_EXHAUSTED','UNAVAILABLE','CANCELLED','DEADLINE_EXCEEDED']);
function read(file){const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{return readFileSync(fd);}finally{closeSync(fd);}}
function directorySync(file){const fd=openSync(dirname(file),constants.O_RDONLY);try{fsyncSync(fd);}finally{closeSync(fd);}}
function durable(file,value){const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{const b=Buffer.from(JSON.stringify(value,null,2)+'\n');if(writeSync(fd,b)!==b.length)fail();fsyncSync(fd);}finally{closeSync(fd);}directorySync(file);}
function historical(){if(sha(read(original))!==originalHash||sha(read(ledger).subarray(0,ORIGINAL_LEDGER_BYTES))!==ORIGINAL_LEDGER_SHA256)fail();return inspectLedger(ledger);}
export async function diagnosticOnce(){
  // Fixed production paths; no caller-supplied model, URL, kind, file or loop.
  if(process.argv.length!==3||process.argv[2]!=='--diagnostic-once'||resolve(process.cwd())!==repo||existsSync(target)||existsSync(target+'.next')||existsSync(ledger+'.lock'))fail();
  const before=historical();
  if(before.consumed!==1||before.attempts[0]?.kind!=='discovery'||before.attempts[0]?.outcome!=='OK'||read(ledger).length!==ORIGINAL_LEDGER_BYTES)fail();
  const report={schema:'alica.phase4-live-continuation/v1',authorization:'owner-bounded-diagnostic-and-conditional-continuation',ownerDecision:'Authorize the bounded diagnostic and conditional continuation; retain all consumed slots and evidence',max:6,timeoutMs:30000,automaticRetries:0,diagnosticMaximum:1,originalLiveSha256:originalHash,originalLedgerPrefixSha256:ORIGINAL_LEDGER_SHA256,originalLedgerPrefixBytes:ORIGINAL_LEDGER_BYTES,stage:'diagnostic-ready',sourceHashes:{},budget:before};
  for(const file of ['../providers/typesafe-jev/ledger.mjs','../providers/typesafe-jev/transport.mjs','../providers/typesafe-jev/discovery-diagnostic.mjs','../providers/typesafe-jev/mapping.mjs','../providers/typesafe-jev/wire.mjs','./live-diagnostic.mjs'])report.sourceHashes[file]=sha(read(fileURLToPath(new URL(file,import.meta.url))));
  durable(target,report);
  const persist=()=>{durable(target+'.next',report);renameSync(target+'.next',target);directorySync(target);};
  try{
    report.diagnostic=await runDiscoveryDiagnostic({keyFile:'/home/alica-dev/.config/alica/phase4/typesafe-api-key',ledgerFile:ledger,signal:new AbortController().signal,deadlineMs:Date.now()+30000,beforeSend:()=>{
      const state=historical();
      if(state.consumed!==2||state.attempts[1]?.kind!=='discovery-diagnostic'||state.attempts[1]?.outcome!=='AMBIGUOUS_OR_PENDING')fail();
      if(sha(read(target))!==sha(Buffer.from(JSON.stringify(report,null,2)+'\n')))fail();
      report.stage='diagnostic-reserved';report.budget=state;persist();
    }});
    report.stage=report.diagnostic.documentedSchemaValid&&report.diagnostic.genericModelsCompatible?'diagnostic-recorded-awaiting-fixture-verification':'diagnostic-blocked';
    if(report.stage==='diagnostic-blocked')report.failure={code:'CONTRACT_MISMATCH',stage:'diagnostic'};
  }catch(e){report.stage='diagnostic-blocked';report.failure={code:safe.has(e?.code)?e.code:'UNAVAILABLE',stage:'diagnostic'};}
  report.budget=historical();persist();
  console.log(JSON.stringify({stage:report.stage,budget:report.budget,diagnostic:report.diagnostic,failure:report.failure}));
  if(report.failure)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){diagnosticOnce().catch(e=>{console.log(JSON.stringify({code:safe.has(e?.code)?e.code:'FAILED_PRECONDITION',stage:'diagnostic-guard'}));process.exitCode=1;});}
