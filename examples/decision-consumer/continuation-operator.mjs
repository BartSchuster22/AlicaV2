// Reuses unchanged external SDK/Catalog-only author and the existing public Host.
// No discoverModels import or discovery operation exists in this continuation.
import assert from 'node:assert/strict';
import { readFileSync,mkdtempSync,chmodSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { consumeSnapshot } from '@alica/catalog/release';
import { publicDecisionHost } from '@alica/decision-phase4/public-host';
import { jevProvider } from '@alica/decision-phase4/jev';
import { beginContinuation,sha } from '@alica/decision-phase4/continuation';
import { matrix } from './matrix.mjs';
import { fixtureHTTPS } from './fixture-http.mjs';
export async function runContinuation({consumerURL,snapshot,mode}){
 assert(['continue-live','continuation-fixture'].includes(mode));
 const synthetic=mode==='continuation-fixture',selected=consumeSnapshot(snapshot),bytes=readFileSync(new URL(consumerURL));
 assert.equal(selected.entries.length,1);assert.equal(selected.digest.replace(/^sha256:/,''),'6bfeb23655ddafb37c266cf11b8cd8da386d030cfd212f97cbf4decf4eddd127');
 assert.equal(sha(bytes),'f9326697f7c6a3998a728304285e9879311d319ffe61c4891231c303ca044167');
 const {consumer}=await import(consumerURL),calls=[];
 const directory=synthetic?mkdtempSync(join(tmpdir(),'phase4-continuation-external-')):undefined;if(directory)chmodSync(directory,0o700);
 let session,runtime;
 try{
  session=beginContinuation(synthetic?{fixture:{directory,requestImpl:fixtureHTTPS(calls)}}:{});
  try{
   runtime=await publicDecisionHost(selected.entries[0].descriptor,jevProvider({transport:session.transport,models:session.models,model:session.model}));
   const external=await runtime.caller(consumer,snapshot);
   const requests=matrix(),kinds=['noul','choice','score','mixed'];assert.equal(requests.length,4);
   for(let i=0;i<4;i++){
    session.begin(kinds[i]);
    const response=await external.evaluate(requests[i],{deadlineMs:Date.now()+(synthetic?2000:30000)});
    assert.equal(response.provider,'typesafe-jev');assert.equal(response.answers.length,requests[i].questions.length);
    session.accept(response);
   }
  }catch(e){session.fail(e);throw e;}
  finally{if(runtime){try{
   const cleanup=await runtime.close();session.cleanup(cleanup);
   assert.deepEqual({...cleanup.resources},{registrations:0,listeners:0,pendingCalls:0,effects:0});assert.equal(cleanup.unsettledWork,0);assert.equal(cleanup.backend.pending,0);assert.equal(cleanup.backend.closed,true);
   for(const row of cleanup.instances){assert.deepEqual(row.failedDisposers,[]);assert.equal(row.restartRequired,false);assert.equal(row.timedOutResources,0);}
  }catch(e){session.fail(e);throw e;}}}
  assert.deepEqual(readFileSync(new URL(consumerURL)),bytes);
  if(synthetic){assert.equal(calls.length,4);assert(calls.every(c=>c.method==='POST'));}
  return session.complete({consumerUnchanged:true,consumerDigest:sha(bytes),consumerHasNoKernel:true,selectedSnapshot:selected.digest,trustVerified:selected.trustVerified,publicPackedArtifacts:true,separateConsumerAndOperatorInstalls:true,syntheticPhysicalRequests:synthetic?calls.length:0});
 }catch(e){if(session&&!session.report.failure)session.fail(e);throw e;}
 finally{if(directory)rmSync(directory,{recursive:true,force:true});}
}
