// Explicit isolated namespace-maintainer workflow, not Owner Acceptance.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {canonical} from '@alica/acap-contracts';
import {validateDefinition,localReader} from '@alica/catalog';
import {reviewProposal,transition} from '@alica/catalog/governance';
import {createSnapshot,consumeSnapshot} from '@alica/catalog/release';
import {validate,localJSON} from '../../../service-foundation/tooling/validate.mjs';
assert.deepEqual(process.argv.slice(2),['--admit-experimental']);
const root=new URL('./',import.meta.url),design=new URL('../../../docs/phase5.2/design/',root),repo=new URL('../../../',root);
const json=u=>JSON.parse(readFileSync(u)),get=n=>json(new URL(n,root));
const sha=b=>createHash('sha256').update(b).digest('hex');
const proposal=get('proposal.json'),raw=get('parent.review.json'),review=reviewProposal(proposal,raw),proof=get('conformance.json');
assert.equal(review.state,'proposed');assert.equal(proof.status,'PASS');assert.equal(proof.tests,23);assert.equal(proof.fail,0);
for(const [path,hash] of Object.entries(proof.hashes))assert.equal(sha(readFileSync(new URL(path,repo))),hash,path);
for(const name of ['descriptor.json','signal.json','definition.json','namespace-policy.json','proposal.json'])assert.equal(sha(readFileSync(new URL(name,root))),sha(readFileSync(new URL(name,design))),name);
assert.equal(sha(readFileSync(new URL('parent.review.json',root))),sha(readFileSync(new URL('../../../docs/phase5.2/review/parent.review.json',root))));
const original=get('definition.json'),definition={...original,metadata:{...original.metadata,maturity:'experimental'}},policy={...get('namespace-policy.json'),release:[proposal.draft]};
const entry=validateDefinition(definition,localReader(root.pathname),policy);
const admission=transition(null,entry,{maintainer:'ALICA maintainers',reference:'Current explicit Owner Phase5.2 execution grant authorizes existing local maintainer workflow. Genuine independent parent design review preserved; not human cryptographic signature or Owner Acceptance.',proposal,review,implementation:'services/doghouse/{core,store,contracts,adapter}.mjs; conformance.json exact hashes and606e1645 revision',conformance:'conformance.json; docs/phase5.2/evidence/d13-native.log actual23/23 native public Host/SDK and domain tests. No-container, no daemon or provider; local native operator trust, trustVerified=false.'});
const snapshot=createSnapshot({release:{version:'0.5.2'},policy,entries:[entry],read:localReader(root.pathname)});assert.equal(consumeSnapshot(snapshot).entries.length,1);
const service={...json(new URL('service.json',design)),catalog:{version:'0.5.2',digest:snapshot.digest}};
const result=validate(service,{snapshot,pin:snapshot.digest,readJSON:n=>localJSON(design.pathname,n),configuration:json(new URL('config.json',design))});
assert.equal(result.structural.status,'PASS');assert.equal(result.semantic.status,'PASS');assert.equal(result.executed.status,'NOT_TESTED');
for(const [name,value] of Object.entries({'experimental-definition.json':definition,'experimental-policy.json':policy,'admission.json':admission,'snapshot.json':snapshot,'service.json':service,'manifest-validation.json':result})){
 const file=new URL(name,root),text=canonical(value)+'\n';if(existsSync(file))assert.equal(readFileSync(file,'utf8'),text,'Refuse changed readmission');else writeFileSync(file,text,{flag:'wx'});
}
console.log(canonical({transition:'proposed -> experimental',snapshotDigest:snapshot.digest,manifestStructural:result.structural.status,manifestSemantic:result.semantic.status,executedEvidence:proof.status,tests:proof.tests,trustVerified:false,ownerAcceptance:false}));
