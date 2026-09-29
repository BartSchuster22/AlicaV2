import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture,error} from './fixture.mjs';
import {nativeAssurance} from '../native.mjs';
import {validate,localJSON} from '../../../service-foundation/tooling/validate.mjs';
import {readFileSync} from 'node:fs';
test('D8 repeated against actual admitted snapshot; separate execution record not inferred from schema',()=>{
 const root=new URL('../../../catalog/proposals/assurance-incidents/',import.meta.url),get=n=>JSON.parse(readFileSync(new URL(n,root))),design=new URL('../../../docs/phase5.2/design/',import.meta.url).pathname;
 const snapshot=get('snapshot.json'),admission=get('admission.json');assert.equal(admission.accepted.metadata.maturity,'experimental');assert.equal(admission.evidence.review.state,'proposed');
 const r=validate(get('service.json'),{snapshot,pin:snapshot.digest,readJSON:n=>localJSON(design,n),configuration:{directory:'operator-explicit'}});assert.equal(r.structural.status,'PASS');assert.equal(r.semantic.status,'PASS');assert.equal(r.executed.status,'NOT_TESTED');
});
test('D13 native composition validates closed configuration before touching store',async()=>{
 assert.throws(()=>nativeAssurance({directory:'unused',credentials:'forbidden'}),error('INVALID_ARGUMENT'));
 const dir=mkdtempSync(join(tmpdir(),'phase52-compose-'));try{const {domain}=nativeAssurance({directory:dir});domain.open();assert.equal(domain.selfHealth().state,'DEGRADED');await domain.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
test('D17 incident capacity64 refuses next without changing history',async t=>{
 const f=fixture(t);for(let n=0;n<64;n++){await f.domain.ingest(f.signal('f'+n,'FAIL',n*2),'observer');await f.domain.ingest(f.signal('r'+n,'RECOVER',n*2+1),'observer');}
 const before=f.domain.export();await assert.rejects(f.domain.ingest(f.signal('next','FAIL',129),'observer'),error('RESOURCE_EXHAUSTED'));assert.equal(f.domain.export(),before);
});
test('D17 retained observation/dedupe capacity256 rejects atomically',async t=>{
 const f=fixture(t);for(let n=0;n<64;n++){for(let k=0;k<3;k++)await f.domain.ingest(f.signal('f'+n+'-'+k,'FAIL',n*4+k),'observer');await f.domain.ingest(f.signal('r'+n,'RECOVER',n*4+3),'observer');}
 assert.equal(f.domain.data.observations.length,256);const before=f.domain.export();await assert.rejects(f.domain.ingest(f.signal('next','FAIL',257),'observer'),error('RESOURCE_EXHAUSTED'));assert.equal(f.domain.export(),before);
});
test('D17 acknowledgement replay capacity16 and late correlation window fail closed',async t=>{
 const f=fixture(t),r=await f.domain.ingest(f.signal(),'observer');for(let n=0;n<16;n++)await f.domain.operation('acknowledge',{scope:'scopeA',id:r.incidentId,requestId:'a'+n},f.context());
 await assert.rejects(f.domain.operation('acknowledge',{scope:'scopeA',id:r.incidentId,requestId:'overflow'},f.context()),error('RESOURCE_EXHAUSTED'));
 f.clock.wall+=86400001;await assert.rejects(f.domain.ingest(f.signal('late'),'observer'),error('FAILED_PRECONDITION'));assert.equal(f.domain.data.incidents[0].status,'ACKNOWLEDGED');
});
