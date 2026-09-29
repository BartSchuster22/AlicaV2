// Hash-bound candidate verification, independent of live services or credentials.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const repo=new URL('../../',import.meta.url),proof=JSON.parse(readFileSync(new URL('qualification-r1-r2.json',import.meta.url)));
for(const [path,expected] of Object.entries(proof.hashes))assert.equal(createHash('sha256').update(readFileSync(new URL(path,repo))).digest('hex'),expected,path);
assert.equal(proof.tests,61);assert.equal(proof.fail,0);
console.log(JSON.stringify({hashBoundFiles:Object.keys(proof.hashes).length,implementationRevision:proof.implementationRevision,tests:proof.tests,status:'VERIFIED',ownerAcceptance:false}));
