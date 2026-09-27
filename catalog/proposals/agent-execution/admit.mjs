// Actual additive EXPERIMENTAL admission via frozen public Catalog APIs.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { canonical, digest, runConformance } from '@alica/acap-contracts';
import { validateDefinition, validatePolicy } from '@alica/catalog';
import { reviewProposal, transition } from '@alica/catalog/governance';
import { loadCatalog, createSnapshot, consumeSnapshot } from '@alica/catalog/release';
import { handlers, fixtureTask, fixtureText } from './reference.mjs';
const base = loadCatalog('catalog');
const directory = new URL('./', import.meta.url);
const readJSON = name => JSON.parse(readFileSync(new URL(name, directory), 'utf8'));
const proposal = readJSON('proposal.json');
const descriptor = readJSON('descriptor.json');
const reviewInput = readJSON('parent.review.json');
const review = reviewProposal(proposal, reviewInput);
const conformance = await runConformance(descriptor, handlers, [
  {name:'common-domain',operation:'execute',input:{task:fixtureTask},expected:{text:fixtureText}},
  {name:'unsupported-domain',operation:'execute',input:{task:'unsupported'},errorCode:'INVALID_ARGUMENT'},
  {name:'invalid-input',operation:'execute',input:{task:42},errorCode:'INVALID_ARGUMENT'},
]);
assert.equal(conformance.passed, true, canonical(conformance));
const policy = validatePolicy({ ...base.policy, version:'1.1.0',
  namespaces:[...base.policy.namespaces,{authority:'alica.io',domain:'agent',kind:'first-party',owner:'ALICA maintainers'}],
  release:[...base.policy.release,proposal.draft] });
const definition = {
  apiVersion:'catalog.alica.io/v1',kind:'CapabilityDefinition',
  metadata:{id:proposal.draft,version:descriptor.version,maturity:'experimental',owner:'ALICA maintainers',summary:'Bounded provider-neutral request-scoped task execution.'},
  contract:{descriptor:'proposals/agent-execution/descriptor.json',identity:descriptor.id,version:descriptor.version,digest:digest(descriptor)},
  semantics:{description:'Executes a task in the documented provider-supported domain and returns its completed response text, not proof of correctness or a transcript. Unsupported tasks are INVALID_ARGUMENT. No persistent task state, resume, deduplication or automatic retries. Task text grants no tools, credentials, endpoints or scopes. Local cancellation bounds delivery and owned cleanup, not remote generation or billing.',cancellation:'supported',errors:['INVALID_ARGUMENT','PERMISSION_DENIED','UNAVAILABLE','RESOURCE_EXHAUSTED','DEADLINE_EXCEEDED','CANCELLED','INTERNAL','FAILED_PRECONDITION']},
  scopes:['application','session'],permissions:['agent.execute'],dependencies:[],events:[],
};
const entry = validateDefinition(definition,base.read,policy);
const admission = transition(null,entry,{
  maintainer:'ALICA maintainers',reference:'Owner-authorized Phase3; parent.review.json and SEMANTICS.md',
  proposal,review,implementation:'catalog/proposals/agent-execution/reference.mjs',
  conformance:'admission.json: freshly executed finite reference conformance',
});
const snapshot = createSnapshot({release:{version:'0.2.0'},policy,entries:[...base.entries,entry],read:base.read});
const consumed = consumeSnapshot(snapshot);
assert.equal(consumed.entries.length,base.entries.length+1);
for(const old of base.entries) assert.equal(canonical(consumed.entries.find(e=>e.definition.metadata.id===old.definition.metadata.id)),canonical(old));
// Negative governance checks prove review and namespace are enforced, not bypassed.
assert.throws(()=>transition(null,entry,{...admission.evidence,review:null}),{code:'UNACCEPTED_PROPOSAL'});
assert.throws(()=>validateDefinition(definition,base.read,base.policy),{code:'UNAUTHORIZED_NAMESPACE'});
const result={schemaVersion:'alica.phase3-admission/v1',admission,conformance,snapshotDigest:snapshot.digest,trustVerified:false,limitations:'Distinct parent source review, same model family; no human audit. Finite reference conformance only, not live H12.'};
for(const [name,value] of Object.entries({'definition.json':definition,'namespace-policy.json':policy,'admission.json':result,'snapshot.json':snapshot})) writeFileSync(new URL(name,directory),canonical(value)+'\n');
console.log(canonical({transition:'proposed -> experimental',conformance,snapshotDigest:snapshot.digest,frozenEntriesPreserved:true,negativeGovernanceChecks:true}));
