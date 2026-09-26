// Test-only exact-artifact early crash/resource qualification. No production authority.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const [mode, artifactArg, workArg, boundary = ''] = process.argv.slice(2);
const artifact = resolve(artifactArg), work = resolve(workArg), signed = resolve(artifact, '..');
const self = fileURLToPath(import.meta.url);
const hash = b => createHash('sha256').update(b).digest('hex');
const archiveHash = 'be77a4de178fbd4d6236e4efde17dbbd1df2320f5720cb1cf4da1aaaffac5d71';
const inventoryHash = '5d66815fb7d715ae69324464ad0f36ef4642ff9c4711645e157ab8222648cc82';
const load = p => JSON.parse(fs.readFileSync(p));
const input = load(join(signed, 'input.json')), floor = load(join(signed, 'floor.json'));
const fixedNow = Math.max(floor.lastWallMs, input.trust.policy.issuedAtMs, input.trust.revocation.issuedAtMs) + 1000;
assert(fixedNow < input.trust.policy.expiresAtMs && fixedNow < input.trust.revocation.expiresAtMs);
const moduleURL = name => pathToFileURL(join(artifact, 'runtime/tools', name));
const save = (p, value) => fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n', {flag:'wx', mode:0o600});
if (mode !== 'run') {
  if (mode !== 'expired') Date.now = () => fixedNow;
  const original = { fsyncSync: fs.fsyncSync, linkSync: fs.linkSync, renameSync: fs.renameSync, writeSync: fs.writeSync };
  const pause = () => { original.writeSync(1, 'BOUNDARY\n'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); };
  if (boundary) {
    fs.fsyncSync = fd => {
      original.fsyncSync(fd);
      const p = fs.readlinkSync('/proc/self/fd/' + fd);
      if (p.includes('/transactions/') && fs.fstatSync(fd).isDirectory()) {
        const n = fs.readdirSync('/proc/self/fd/' + fd).filter(n => /^\d{6}\.json$/.test(n)).length;
        if ((boundary === 'staging-durable' && n === 1) || (boundary === 'verified-durable' && n === 2)) pause();
      }
    };
    fs.linkSync = (a,b) => { original.linkSync(a,b); if(boundary === 'journal-link' && b.endsWith('/000001.json')) pause(); };
    fs.renameSync = (a,b) => { original.renameSync(a,b); if(boundary === 'floor-rename' && b.endsWith('/floor.json')) pause(); };
    syncBuiltinESMExports();
  }
  if (mode === 'resource') {
    // RLIMIT_FSIZE is imposed by the external Python launcher, not a mocked syscall.
    process.on('SIGXFSZ', () => {});
    const {openPrivateRoot, durableWrite} = await import(moduleURL('g7-durable.mjs'));
    const fd = openPrivateRoot(work);
    try { durableWrite(fd, 'bounded.bin', Buffer.alloc(8192, 65)); throw new Error('resource write unexpectedly succeeded'); }
    catch(e) { assert.equal(e.code, 'EFBIG'); assert(!fs.existsSync(join(work,'bounded.bin'))); console.log(JSON.stringify({status:'DENIED', code:e.code, published:false, residueRetained:fs.readdirSync(work).some(n=>n.startsWith('next-'))})); }
    finally { fs.closeSync(fd); }
  } else {
    const {CellPreparation} = await import(moduleURL('g7-cell.mjs'));
    let cell;
    try {
      cell = new CellPreparation(work);
      const result = mode === 'initialize' ? await cell.initialize(input.trust, floor)
        : mode === 'stage' || mode === 'expired' ? await cell.stage(input.archive, input.trust, input.authorization)
        : mode === 'recover' ? await cell.recover(input.trust) : cell.status();
      console.log(JSON.stringify(result));
    } catch(e) { console.error(JSON.stringify({status:'DENIED', code:e.code ?? e.name})); process.exitCode=1; }
    finally { if(cell) { await cell.shutdown(); cell.close(); } }
  }
} else {
  fs.mkdirSync(work, {mode:0o700}); fs.mkdirSync(join(work,'public'), {mode:0o700});
  const pub = join(work,'public'), results=[];
  function verify() {
    assert.equal(hash(fs.readFileSync(join(signed,'assembled-candidate.tar'))),archiveHash);
    const bytes=fs.readFileSync(join(artifact,'docs/runtime-inventory.json')); assert.equal(hash(bytes),inventoryHash);
    for(const e of JSON.parse(bytes).inventory) { const b=fs.readFileSync(join(artifact,e.path)); assert.equal(b.length,e.bytes,e.path); assert.equal(hash(b),e.sha256,e.path); }
  }
  verify();
  // Diagnostic collection only: NOT workload admission or aggregate QA enforcement.
  function capture(command, args, timeout, crashBoundary = '') {
    return new Promise((resolve, reject) => {
      const limit = 65536, out = [], err = [];
      let bytes = 0, failure, closed = false, stopping = false, seen = false;
      let suffix = '', watchdog, cleanup;
      const child = spawn(command, args, {stdio:['ignore','pipe','pipe']});
      function dispose() {
        clearTimeout(watchdog); clearTimeout(cleanup);
        child.removeListener('error', onError); child.removeListener('close', onClose);
        child.stdout.removeListener('data', onOut); child.stderr.removeListener('data', onErr);
        // destroy() may emit an error asynchronously before close. Keep our
        // error handler until that stream is closed, even after rejection.
        for (const pipe of [child.stdout, child.stderr]) {
          const drained = () => pipe.removeListener('error', onError);
          if (pipe.closed) drained(); else pipe.once('close', drained);
          pipe.destroy();
        }
      }
      function stop() {
        if (stopping || closed) return;
        stopping = true;
        clearTimeout(watchdog);
        // One absolute cleanup window; further failures never restart it.
        cleanup = setTimeout(() => {
          closed = true;
          dispose();
          reject(new Error('child cleanup timeout; termination uncertain', {cause:failure}));
        }, 5000);
        try {
          if (child.exitCode === null && child.signalCode === null && !child.kill('SIGKILL'))
            failure ??= new Error('SIGKILL request failed; termination uncertain');
        } catch (e) { failure ??= e; }
      }
      function fail(e) { failure ??= e; stop(); }
      function onError(e) { fail(e); }
      function collect(b, parts, isOut) {
        if (closed || failure) return;
        // Pipes stay in Buffer mode. Check combined byte count BEFORE retention.
        if (b.length > limit - bytes) {
          fail(new Error('diagnostic output exceeds combined 65536-byte limit'));
          return;
        }
        bytes += b.length;
        parts.push(Buffer.from(b));
        if (isOut && crashBoundary && !seen) {
          const text = suffix + b.toString('latin1');
          seen = text.includes('BOUNDARY');
          suffix = text.slice(-7);
          if (seen) stop();
        }
      }
      function onOut(b) { collect(b, out, true); }
      function onErr(b) { collect(b, err, false); }
      function onClose(status, signal) {
        if (closed) return;
        closed = true;
        dispose();
        if (crashBoundary && !seen) failure ??= new Error('premature boundary exit '+crashBoundary);
        if (crashBoundary && signal !== 'SIGKILL') failure ??= new Error('boundary did not exit via SIGKILL');
        if (failure) { reject(failure); return; }
        resolve({status, signal, stdout:Buffer.concat(out).toString('utf8'), stderr:Buffer.concat(err).toString('utf8')});
      }
      child.on('error', onError);
      child.stdout.on('error', onError); child.stderr.on('error', onError);
      child.stdout.on('data', onOut); child.stderr.on('data', onErr);
      child.once('close', onClose);
      watchdog = setTimeout(() => fail(new Error(crashBoundary ? 'boundary timeout '+crashBoundary : 'child timeout')), timeout);
    });
  }
  async function run(operation, root, name, expected=0) {
    const p=await capture(process.execPath,['--experimental-vm-modules',self,operation,artifact,root],300000);
    save(join(pub,name+'.json'),{exit:p.status,signal:p.signal,stdout:p.stdout,stderr:p.stderr,error:p.error?.message});
    assert.equal(p.status,expected,name+': '+p.stderr); return p;
  }
  const expiryRoot=join(work,'real-clock-expiry'); fs.mkdirSync(expiryRoot,{mode:0o700});
  await run('initialize',expiryRoot,'expiry-fixture-initialize');
  const identity=hash(fs.readFileSync(join(expiryRoot,'identity.json')));
  assert(Date.now()>input.trust.policy.expiresAtMs,'expiry case requires genuinely expired fixture');
  await run('expired',expiryRoot,'real-clock-expiry-denial',1);
  assert.equal(hash(fs.readFileSync(join(expiryRoot,'identity.json'))),identity);
  assert(!fs.existsSync(join(expiryRoot,'accepted.json')));
  results.push({name:'real-clock-expiry-denial',passed:true,clock:'real'});
  for(const point of ['staging-durable','verified-durable','journal-link','floor-rename']) {
    const root=join(work,point); fs.mkdirSync(root,{mode:0o700}); await run('initialize',root,point+'-initialize');
    const before=hash(fs.readFileSync(join(root,'identity.json')));
    const death=await capture(process.execPath,['--experimental-vm-modules',self,'stage',artifact,root,point],300000,point);
    save(join(pub,point+'-death.json'),{code:death.status,signal:death.signal,stdout:death.stdout,stderr:death.stderr,boundary:point,killIsNotCleanReap:true});
    const r=await run('recover',root,point+'-recover',point==='journal-link'?1:0);
    let states=[];
    if(point!=='journal-link') { const status=JSON.parse(r.stdout); states=status.transactions.map(t=>t.state); assert(states.every(s=>s==='ABORTED')); if(point!=='floor-rename') assert(states.length>0); }
    assert.equal(hash(fs.readFileSync(join(root,'identity.json'))),before); assert(!fs.existsSync(join(root,'accepted.json')));
    results.push({name:point,passed:true,states,clock:'fixed disposable fixture clock',accepted:false,scope:'No provider ever activated; no detached activated-runtime reap claim'});
  }
  const resourceRoot=join(work,'resource');fs.mkdirSync(resourceRoot,{mode:0o700});
  const py='import os,resource,sys; resource.setrlimit(resource.RLIMIT_FSIZE,(1024,1024)); os.execv(sys.argv[1],sys.argv[1:])';
  const r=await capture('/usr/bin/python3',['-I','-B','-c',py,process.execPath,self,'resource',artifact,resourceRoot],30000);
  save(join(pub,'resource.json'),{exit:r.status,signal:r.signal,stdout:r.stdout,stderr:r.stderr}); assert.equal(r.status,0,r.stderr); assert.equal(JSON.parse(r.stdout).residueRetained,true);
  results.push({name:'real-RLIMIT_FSIZE-EFBIG',passed:true,scope:'durableWrite actual short write/EFBIG; no filesystem exhaustion or ENOSPC claim'});
  verify();
  const report={status:'PASS',archiveSha256:archiveHash,inventorySha256:inventoryHash,driverSha256:hash(fs.readFileSync(self)),fixedNow,realNow:Date.now(),results,unchangedArtifact:true,fullCrashMatrix:false,postActivationReconciliation:false,backupRestore:false};
  save(join(pub,'result.json'),report);
  save(join(pub,'public-manifest.json'),{scope:'Public results only; private Cell trees excluded',files:fs.readdirSync(pub).sort().map(path=>{const b=fs.readFileSync(join(pub,path));return{path,bytes:b.length,sha256:hash(b)};})});
  console.log(JSON.stringify(report,null,2));
}
