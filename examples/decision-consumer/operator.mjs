import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { publicDecisionHost } from '@alica/decision-phase4/public-host';
import { consumeSnapshot } from '@alica/catalog/release';
import { neutralProvider } from '@alica/decision-phase4/neutral';
import { jevProvider, discoverModels } from '@alica/decision-phase4/jev';
import { createTransport } from '@alica/decision-phase4/transport';
import { initializeLedger, inspectLedger } from '@alica/decision-phase4/ledger';
import { matrix } from './matrix.mjs';
import { fixtureHTTPS } from './fixture-http.mjs';
const LIVE_LEDGER='/home/alica-dev/.local/state/alica/phase4/physical-requests.jsonl';
const LIVE_KEY='/home/alica-dev/.config/alica/phase4/typesafe-api-key';
const safe=['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','CONTRACT_MISMATCH','DEADLINE_EXCEEDED','CANCELLED','UNAVAILABLE','RESOURCE_EXHAUSTED','FAILED_PRECONDITION'];
export async function runExternal({ consumerURL, snapshot, mode='fixture', reportFile }) {
  assert(['fixture','live'].includes(mode)); const live=mode==='live';
  const { consumer }=await import(consumerURL), selected=consumeSnapshot(snapshot), descriptor=selected.entries[0].descriptor;
  assert.equal(selected.entries.length,1);
  const bytes=readFileSync(new URL(consumerURL)), calls=[];
  const report={schema:'alica.phase4-external/v1',runtime:process.version,level:'PUBLIC_HOST',classification:live?'LIVE-OBSERVED':'FIXTURE-TESTED-DEFENSIVE',
    consumerDigest:'sha256:'+createHash('sha256').update(bytes).digest('hex'),consumerUnchanged:false,consumerHasNoKernel:true,
    selectedSnapshot:selected.digest,trustVerified:selected.trustVerified,hostLocalSignedPackages:true,stage:'starting',reports:[]};
  // The live evidence path must be new. No silent overwrite/restart of a run.
  if(live){assert(reportFile);assert.equal(inspectLedger(LIVE_LEDGER).consumed,0);writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});}
  const persist=()=>{if(live)writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{mode:0o600});};
  const temp=mkdtempSync(join(tmpdir(),'phase4-public-external-'));chmodSync(temp,0o700);
  const keyFile=live?LIVE_KEY:join(temp,'disposable-key'), ledgerFile=live?LIVE_LEDGER:join(temp,'fixture-ledger.jsonl');
  if(!live){writeFileSync(keyFile,'DISPOSABLE_EXTERNAL_FIXTURE_KEY\n',{mode:0o600});initializeLedger(ledgerFile);}
  const transport=createTransport({keyFile,ledgerFile,...(!live?{requestImpl:fixtureHTTPS(calls)}:{})});
  const options=()=>({signal:new AbortController().signal,deadlineMs:Date.now()+(live?30000:2000)});
  async function runProvider(provider,classification){
    const runtime=await publicDecisionHost(descriptor,provider), row={provider:provider.id,classification,results:[]};report.reports.push(row);
    try{
      const external=await runtime.caller(consumer,snapshot);
      if(!live)await assert.rejects(runtime.caller(consumer,snapshot,{authorized:false}),{code:'PERMISSION_DENIED'});
      for(const request of matrix()){
        report.stage=provider.id+':'+request.questions.map(q=>q.kind).join('+');persist();
        const response=await external.evaluate(request,{deadlineMs:options().deadlineMs});
        assert.equal(response.provider,provider.id);assert.equal(response.answers.length,request.questions.length);
        row.results.push({model:response.model,usage:response.usage,answers:response.answers.map(({legend,...a})=>a)});
        persist();
      }
      if(!live&&provider.id==='typesafe-jev'){
        assert.equal(row.results[0].answers[0].probability,'0.734928');assert.equal(row.results[2].answers[0].expectedScore,'0.75');
        const before=calls.length;
        await assert.rejects(external.evaluate({...matrix()[0],model:'not-advertised'},options()),{code:'NOT_FOUND'});
        const bad=matrix()[2];bad.questions[0].levels[1].value='2.625';
        await assert.rejects(external.evaluate(bad,options()),{code:'INVALID_ARGUMENT'});assert.equal(calls.length,before);
      }
      if(!live){await external.dispose();await assert.rejects(external.evaluate(matrix()[0],options()),e=>['FAILED_PRECONDITION','UNAVAILABLE'].includes(e.code));}
    }finally{
      row.cleanup=await runtime.close();
      assert.deepEqual({...row.cleanup.resources},{registrations:0,listeners:0,pendingCalls:0,effects:0});
      assert.equal(row.cleanup.unsettledWork,0);assert.equal(row.cleanup.backend.pending,0);assert.equal(row.cleanup.backend.closed,true);
      for(const r of row.cleanup.instances){assert.deepEqual(r.failedDisposers,[]);assert.equal(r.restartRequired,false);assert.equal(r.timedOutResources,0);}
      persist();
    }
    assert.deepEqual(readFileSync(new URL(consumerURL)),bytes);
  }
  try{
    // Exercise the actual public Host neutral path before spending even discovery.
    await runProvider(neutralProvider(),'FIXTURE-TESTED-DEFENSIVE');
    report.stage='discovery';persist();
    const models=await discoverModels(transport,options());report.advertisedModelIds=models.map(m=>m.id);
    const model=models[0].id;report.configuredModel=model;persist();
    await runProvider(jevProvider({transport,models,model}),live?'LIVE-OBSERVED':'FIXTURE-TESTED-DEFENSIVE');
    const ledger=inspectLedger(ledgerFile);
    assert.equal(ledger.consumed,5);assert.deepEqual(ledger.attempts.map(a=>a.kind),['discovery','noul','choice','score','mixed']);
    if(!live)assert.equal(calls.length,5);
    report.stage='complete';report.consumerUnchanged=true;report.ledger=ledger;
    report.authenticatedLiveRequests=live?ledger.consumed:0;report.syntheticPhysicalRequests=live?0:calls.length;
    persist();return report;
  }catch(e){
    report.failure={stage:report.stage,code:safe.includes(e?.code)?e.code:'UNAVAILABLE'};
    report.ledger=inspectLedger(ledgerFile);report.authenticatedLiveRequests=live?report.ledger.consumed:0;
    persist();throw Object.assign(new Error(report.failure.code),{code:report.failure.code});
  }finally{rmSync(temp,{recursive:true,force:true});}
}
