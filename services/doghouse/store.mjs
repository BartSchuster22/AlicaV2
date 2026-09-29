// Native bounded store resource. No systemd, sockets, subprocess or operational paths.
import {mkdirSync,openSync,closeSync,readFileSync,writeFileSync,fsyncSync,renameSync,unlinkSync,rmdirSync,existsSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {canonical,AcapError} from '@alica/acap-contracts';
import {empty,validateRecords,requireThat} from './contracts.mjs';
export class FileStore{
 constructor(directory,{checkpoint=()=>{}}={}){this.directory=resolve(directory);this.file=join(this.directory,'assurance.json');this.lock=join(this.directory,'.writer');this.checkpoint=checkpoint;this.opened=false;this.failed=false;}
 open(){
  requireThat(!this.opened,'FAILED_PRECONDITION');
  mkdirSync(this.directory,{recursive:true,mode:0o700});
  try{mkdirSync(this.lock,{mode:0o700});}catch{throw new AcapError('UNAVAILABLE');}
  this.opened=true;
  try{if(existsSync(this.file)){requireThat(statSync(this.file).size<=1048576,'RESOURCE_EXHAUSTED');this.state=validateRecords(JSON.parse(readFileSync(this.file,'utf8')),{store:true});}
   else this.state={schema:'doghouse.store/v1',generation:0,...empty()};return structuredClone(this.state);
  }catch(e){this.close();throw e instanceof AcapError?e:new AcapError('FAILED_PRECONDITION');}
 }
 commit(records){
  requireThat(this.opened&&!this.failed,'UNAVAILABLE');
  const next={...structuredClone(records),schema:'doghouse.store/v1',generation:this.state.generation+1};validateRecords(next,{store:true});
  const pending=join(this.directory,'assurance.pending');let fd,renamed=false;
  try{
   this.checkpoint('beforeWrite');fd=openSync(pending,'w',0o600);writeFileSync(fd,canonical(next)+'\n');fsyncSync(fd);closeSync(fd);fd=undefined;
   this.checkpoint('beforeRename');renameSync(pending,this.file);renamed=true;this.checkpoint('afterRename');
   fd=openSync(this.directory,'r');fsyncSync(fd);closeSync(fd);fd=undefined;this.state=next;
  }catch{
   if(fd!==undefined)try{closeSync(fd);}catch{}
   // After rename the commit outcome is uncertain. Fail closed until reopen;
   // do not serve stale in-memory state or overwrite a possibly committed result.
   if(renamed)this.failed=true;
   try{unlinkSync(pending);}catch{}
   throw new AcapError('UNAVAILABLE');
  }
 }
 close(){if(this.opened){this.opened=false;rmdirSync(this.lock);}}
}
// Crash ownership is deliberately fail-closed. A local operator, after proving
// the previous isolated writer has exited, can remove .writer offline. No PID
// probing, automatic stale-lock breaking or operational recovery is provided.
