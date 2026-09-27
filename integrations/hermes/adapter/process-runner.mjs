// One request-scoped child. The trusted operator supplies fixed executable,
// argv/cwd/env; callers cannot select commands, profiles, models or credentials.
import {spawn} from 'node:child_process';
const failure=code=>Object.assign(new Error(code),{code});
export function createProcessRunner({executable,args,cwd,env,graceMs=50,maxOutputBytes=32768}){
 if(typeof executable!=='string'||!executable.startsWith('/')||!Array.isArray(args)||!args.every(x=>typeof x==='string')||!cwd?.startsWith('/')||!env||!Number.isInteger(graceMs)||graceMs<1||graceMs>100||!Number.isInteger(maxOutputBytes)||maxOutputBytes<1||maxOutputBytes>65536)throw failure('INVALID_ARGUMENT');
 const fixedArgs=[...args],fixedEnv={...env};let current=null,closed=false,poisoned=false;
 const kill=(child,signal)=>{try{process.kill(-child.pid,signal)}catch(e){if(e.code!=='ESRCH')throw e}};
 function execute(input,{signal,deadlineMs}){
  if(closed||poisoned)return Promise.reject(failure('UNAVAILABLE'));
  if(current)return Promise.reject(failure('RESOURCE_EXHAUSTED'));
  if(!Number.isSafeInteger(deadlineMs)||deadlineMs<=Date.now())return Promise.reject(failure('DEADLINE_EXCEEDED'));
  if(signal.aborted)return Promise.reject(failure('CANCELLED'));
  let wire;try{wire=JSON.stringify(input)+'\n';if(Buffer.byteLength(wire)>32768)throw failure('INVALID_ARGUMENT')}catch{return Promise.reject(failure('INVALID_ARGUMENT'))}
  const job={child:null,done:null,stop:null};current=job;
  job.done=new Promise((resolve,reject)=>{
   let child,output=[],bytes=0,code=null,termTimer,hardTimer,deadlineTimer,settled=false;
   const finish=()=>{if(settled)return;settled=true;clearTimeout(termTimer);clearTimeout(hardTimer);clearTimeout(deadlineTimer);signal.removeEventListener('abort',abort);if(current===job)current=null;
    if(code){reject(failure(code));return}try{const value=JSON.parse(Buffer.concat(output).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();resolve(value)}catch{reject(failure('INTERNAL'))}
   };
   const stop=reason=>{if(settled||code)return;code=reason;try{kill(child,'SIGTERM')}catch{poisoned=true}
    termTimer=setTimeout(()=>{try{kill(child,'SIGKILL')}catch{poisoned=true}},graceMs);
    hardTimer=setTimeout(()=>{poisoned=true;child.stdout.destroy();child.stderr.destroy();child.stdin.destroy();child.unref();finish()},graceMs+100);
   };
   const abort=()=>stop(Date.now()>=deadlineMs?'DEADLINE_EXCEEDED':'CANCELLED');job.stop=stop;
   try{child=spawn(executable,fixedArgs,{cwd,env:fixedEnv,stdio:['pipe','pipe','pipe'],detached:true,shell:false});job.child=child;}catch{code='UNAVAILABLE';finish();return}
   child.on('error',()=>{code='UNAVAILABLE';finish()});
   child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxOutputBytes){stop('INTERNAL');return}output.push(chunk)});
   // Bound stderr jointly; never return/log its potentially sensitive content.
   child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxOutputBytes)stop('INTERNAL')});
   child.stdin.on('error',()=>stop('UNAVAILABLE'));
   child.on('close',status=>{
    if(settled)return;
    try{kill(child,'SIGKILL')}catch{poisoned=true}
    if(status!==0&&!code)code='UNAVAILABLE';
    // A successful signal is not disappearance evidence. ESRCH is the only
    // positive group-absence observation; unreaped zombies may conservatively
    // poison this runner. Escaped sessions are outside the trusted-code model.
    const until=Date.now()+100;
    const probe=()=>{if(settled)return;try{process.kill(-child.pid,0)}catch(e){if(e.code==='ESRCH'){finish();return}poisoned=true;code ||= 'INTERNAL';finish();return}
     if(Date.now()>=until){poisoned=true;code ||= 'INTERNAL';finish();return}setTimeout(probe,5);
    };probe();
   });
   signal.addEventListener('abort',abort,{once:true});deadlineTimer=setTimeout(()=>stop('DEADLINE_EXCEEDED'),Math.min(120000,Math.max(1,deadlineMs-Date.now())));
   if(signal.aborted)abort();else child.stdin.end(wire);
  });
  return job.done;
 }
 return Object.freeze({execute,async close(){closed=true;const job=current;if(job){job.stop('CANCELLED');await job.done.catch(()=>{})}},inspect:()=>({closed,poisoned,pending:current?1:0})});
}
