// Focused architecture diagnostic, not conformance/admission or an alternative contract.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hostFixture} from '../../service-foundation/conformance/host-fixture.mjs';
const path='catalog/proposals/memory-candidates/descriptor.json';
const bytes=readFileSync(path),descriptor=JSON.parse(bytes);
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(descriptor.operations.find(o=>o.name==='create').idempotencyPolicy.persistence,'durable');
const f=hostFixture();let rejected=false,control;
try{
 assert.throws(()=>f.discover({descriptor}),e=>{rejected=e.code==='FAILED_PRECONDITION';return rejected;});
 // In-memory diagnostic control ONLY; never saved, activated, admitted, or used by product.
 const instanceOnlyControl=structuredClone(descriptor);
 instanceOnlyControl.operations.find(o=>o.name==='create').idempotencyPolicy.persistence='instance';
 control=f.discover({descriptor:instanceOnlyControl});assert.equal(typeof control,'string');
}finally{await f.close();}
const result={status:'BLOCKED_FROZEN_HOST_REJECTS_DURABLE_DESCRIPTOR',originalRejected:rejected,
 instanceOnlyDiagnosticDiscoveryAccepted:!!control,controlActivated:false,productDescriptorChanged:false,
 descriptorFileSha256:sha(bytes),trustSourceSha256:sha(readFileSync('packages/kernel/src/trust.ts')),
 kernelSourceSha256:sha(readFileSync('packages/kernel/src/index.ts')),
 rejection:'packages/kernel/src/trust.ts:522-526',digestBinding:'packages/kernel/src/index.ts:1451-1453',
 requiredDecision:'A separately authorized frozen-architecture change or explicitly revised Catalog contract/design. Neither is performed by this worker.'};
writeFileSync('docs/phase5.1/evidence/durable-binding-blocker.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
