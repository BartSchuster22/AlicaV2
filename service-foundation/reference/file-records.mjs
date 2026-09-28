// Native operator resource; not a Kernel filesystem API or generic storage broker.
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {AcapError} from '@alica/acap-contracts';
export function fileRecords(directory){
 const file=join(directory,'records.json'),temporary=join(directory,'records.pending');
 let data,opened=false,closing=false,queue=Promise.resolve();
 const check=()=>{if(!opened||closing)throw new AcapError('UNAVAILABLE');};
 const valid=x=>x&&x.schema===1&&Array.isArray(x.records)&&x.records.length<=32&&new Set(x.records.map(r=>r.key)).size===x.records.length&&x.records.every(r=>typeof r.key==='string'&&r.key.length>=1&&r.key.length<=64&&typeof r.value==='string'&&r.value.length<=4096);
 return {
  async open(){if(opened)throw new AcapError('FAILED_PRECONDITION');try{await mkdir(directory,{recursive:true});let text;try{text=await readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}if(text===undefined)data={schema:1,records:[]};else{try{data=JSON.parse(text);if(!valid(data))throw new Error('invalid state');}catch{throw new AcapError('FAILED_PRECONDITION');}}closing=false;opened=true;}catch(e){throw e instanceof AcapError?e:new AcapError('UNAVAILABLE');}}, 
  async put(key,value){check();if(typeof key!=='string'||!key.length||key.length>64||typeof value!=='string'||value.length>4096)throw new AcapError('INVALID_ARGUMENT');
   const work=queue.then(async()=>{const next=structuredClone(data),old=next.records.find(r=>r.key===key);if(old)old.value=value;else {if(next.records.length>=32)throw new AcapError('RESOURCE_EXHAUSTED');next.records.push({key,value});}
    try{await writeFile(temporary,JSON.stringify(next)+'\n',{mode:0o600});await rename(temporary,file);}catch{throw new AcapError('UNAVAILABLE');}data=next;
   });queue=work.catch(()=>{});return work;
  },
  async get(key){check();await queue;return data.records.find(r=>r.key===key)?.value;},
  async close(){closing=true;await queue;opened=false;data=undefined;}
 };
}
