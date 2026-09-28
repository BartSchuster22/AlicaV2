import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileRecords} from '../reference/file-records.mjs';
import {stateless,records,consumer} from '../reference/services.mjs';
import {createTestCell} from '@alica/testkit';
import {readFileSync} from 'node:fs';
const json=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const echo=json('../../catalog/capabilities/core/echo/descriptor.json');
const record=json('../../catalog/proposals/service-records/descriptor.json');
// SDK fixture evidence only. These are NOT actual public Host qualification.
async function fixture(d,service,run){const cell=createTestCell(),p=cell.instance({id:'org.phase50.provider'}),c=cell.instance({id:'org.phase50.consumer',permissions:{capabilities:{[d.id]:d.operations.map(o=>o.name)}}}),client=consumer(d);try{await p.activate(service.plugin);await c.activate(client.plugin);assert.equal(service.health(),'READY');await run(client);}finally{for(const report of await cell.close()){assert.equal(report.state,'DISPOSED');assert.deepEqual(report.failedDisposers,[]);assert.equal(report.timedOutResources,0);}assert.equal(service.health(),'UNAVAILABLE');assert.equal(cell.inspect().providers,0);assert.equal(cell.inspect().pending,0);}}
test('stateless SDK fixture, unchanged consumer, service-owned health and cleanup',async()=>{await fixture(echo,stateless(echo),async client=>{assert.deepEqual(await client.call('echo',{text:'native-reference'}),{text:'native-reference'});});});
test('stateful SDK fixture persists across normal disposal/new instance; empty differs from absent',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'phase50-record-test-'));
 try{await fixture(record,records(record,fileRecords(directory)),async c=>{assert.deepEqual(await c.call('get',{key:'missing'}),{found:false,value:''});assert.deepEqual(await c.call('put',{key:'empty',value:''}),{stored:true});});
 await fixture(record,records(record,fileRecords(directory)),async c=>{assert.deepEqual(await c.call('get',{key:'empty'}),{found:true,value:''});});
 assert.deepEqual(await readdir(directory),['records.json']);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('native resource serializes concurrent writes; quota rejects without losing records',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'phase50-quota-')),r=fileRecords(directory);
 try{await r.open();await Promise.all(Array.from({length:32},(_,i)=>r.put('k'+i,'v'+i)));await assert.rejects(r.put('overflow','x'),{code:'RESOURCE_EXHAUSTED'});await r.put('k0','replacement');await r.close();await r.open();for(let i=0;i<32;i++)assert.equal(await r.get('k'+i),i===0?'replacement':'v'+i);await r.close();await assert.rejects(r.get('k0'),{code:'UNAVAILABLE'});}
 finally{await rm(directory,{recursive:true,force:true});}
});
test('corrupt state fails open instead of manufacturing successful EMPTY',async()=>{const directory=await mkdtemp(join(tmpdir(),'phase50-corrupt-'));try{await writeFile(join(directory,'records.json'),'{bad');await assert.rejects(fileRecords(directory).open());}finally{await rm(directory,{recursive:true,force:true});}});
