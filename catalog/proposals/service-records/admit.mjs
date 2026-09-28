// Explicit existing Catalog transition. Local maintainer-role record, not signed human approval.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {canonical} from '@alica/acap-contracts';
import {validateDefinition,localReader} from '@alica/catalog';
import {reviewProposal,transition} from '@alica/catalog/governance';
import {createSnapshot,consumeSnapshot} from '@alica/catalog/release';
assert.deepEqual(process.argv.slice(2),['--admit-experimental'],'Explicit authorized maintainer operation required');
const root=new URL('./',import.meta.url),repo=new URL('../../../',root);
const bytes=n=>readFileSync(new URL(n,root));const read=n=>JSON.parse(bytes(n));
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(bytes('parent.review.json')),'3bb846c7006b7ceb937c53c9191f6cc073dcf8703930c7952ead2d1ab7e45b79');
for(const [name,hash] of Object.entries({'descriptor.json':'52e6cced5be8e707142411317b2da0d62a9b806718e61bd01bc0fdd87060f202','definition.json':'e1929d7b5ee7203070be49db171196cd28deb5bb50fb93e028a0dee25e2230d9','namespace-policy.json':'2fb15c596b09f1dde108ab56508c2d24152d6afdd2d713dfdf174f692382bac9','proposal.json':'53bb4057369595e9cc673f07e1027f635f45aec86a44ef00537b476efc12db79','SEMANTICS.md':'670591fb44fab02714588497425a1df0332b7da7f767cb590cbd4dab254a2986'}))assert.equal(sha(bytes(name)),hash,'Exact parent-reviewed artifact '+name);
const proposal=read('proposal.json'),raw=read('parent.review.json'),review=reviewProposal(proposal,raw);
assert.equal(review.state,'proposed');
const proof=read('conformance.json');assert.equal(proof.status,'PASS');assert.equal(proof.tests,35);assert.equal(proof.fail,0);assert.equal(proof.externalAuthor,'PASS');
for(const [path,hash] of Object.entries(proof.implementationHashes))assert.equal(sha(readFileSync(new URL(path,repo))),hash,path);
assert.equal(sha(readFileSync(new URL(proof.log.path,repo))),proof.log.sha256);
const original=read('definition.json');assert.equal(original.metadata.maturity,'proposed');
const definition={...original,metadata:{...original.metadata,maturity:'experimental'}};
const policy={...read('namespace-policy.json'),release:[proposal.draft]};
const entry=validateDefinition(definition,localReader(root.pathname),policy);
const admission=transition(null,entry,{
 maintainer:'ALICA maintainers',reference:'Owner-authorized Phase5.0 execution of existing local namespace-maintainer workflow. parent.review.json is exact distinct-parent design review, not Owner Acceptance or independently signed identity.',
 proposal,review,implementation:'service-foundation/reference/{services,file-records}.mjs; conformance.json exact tested hashes',
 conformance:'conformance.json; docs/phase5.0/evidence/native-slice5.log SHA256 '+proof.log.sha256+';35/35 actual publicHost/SDK/native tests plus separately installed author and crash/restart proof. Local signed-shell/operator-owned-native boundary, trustVerified=false.'
});
const snapshot=createSnapshot({release:{version:'0.5.0'},policy,entries:[entry],read:localReader(root.pathname)});
assert.equal(consumeSnapshot(snapshot).entries.length,1);
for(const [name,value] of Object.entries({'experimental-definition.json':definition,'experimental-policy.json':policy,'review.json':review,'admission.json':admission,'snapshot.json':snapshot})){
 const file=new URL(name,root),text=canonical(value)+'\n';if(existsSync(file))assert.equal(readFileSync(file,'utf8'),text,'Refuse changed readmission');else writeFileSync(file,text,{flag:'wx'});
}
console.log(canonical({transition:'proposed -> experimental',snapshotDigest:snapshot.digest,selectedEntries:1,trustVerified:false,parentReviewSHA256:sha(bytes('parent.review.json')),ownerAcceptance:false}));
