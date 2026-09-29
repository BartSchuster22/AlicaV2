import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {reviewProposal} from '@alica/catalog/governance';
const root='docs/phase5k/',json=p=>JSON.parse(readFileSync(root+p)),sha=p=>createHash('sha256').update(readFileSync(root+p)).digest('hex');
if(sha('DESIGN.md')!=='547f71d1eface23533eeaf630042b99d27466e299da5eef40fb3d8fb22458b5e')throw Error('REVIEW_HASH_MISMATCH');
const result=reviewProposal(json('design/proposal.json'),json('review/review.json'));if(result.state!=='proposed')throw Error('NOT_PROPOSED');
writeFileSync(root+'DESIGN-FREEZE.json',JSON.stringify({gate:'K13',status:'DESIGN_FROZEN_PROPOSED_ONLY',review:result,hashes:Object.fromEntries(['DESIGN.md','prepare-design.mjs','design/descriptor.json','design/service.json','design/definition.json','review/review.json'].map(p=>[p,sha(p)])),conformance:'NOT_RUN',admission:'NOT_ADMITTED',ownerAcceptance:false},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
