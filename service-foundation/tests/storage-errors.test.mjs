import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileRecords} from '../reference/file-records.mjs';
test('native storage errors normalize; failed write retains prior record, never absence',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'phase50-disk-'));const r=fileRecords(dir);
 try{await r.open();await r.put('k','before');await mkdir(join(dir,'records.pending'));await assert.rejects(r.put('k','after'),{code:'UNAVAILABLE'});assert.equal(await r.get('k'),'before');await r.close();const next=fileRecords(dir);await next.open();assert.equal(await next.get('k'),'before');await next.close();}finally{await r.close();await rm(dir,{recursive:true,force:true});}
});
test('corrupt JSON and malformed persisted shapes fail FAILED_PRECONDITION; IO open fails UNAVAILABLE',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'phase50-corrupt-'));
 try{for(const data of ['{','null','{"schema":1,"records":[null]}']){await writeFile(join(dir,'records.json'),data);const r=fileRecords(dir);await assert.rejects(r.open(),{code:'FAILED_PRECONDITION'});await assert.rejects(r.get('k'),{code:'UNAVAILABLE'});}
 await assert.rejects(fileRecords(join(dir,'records.json','child')).open(),{code:'UNAVAILABLE'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
