// Runs only in the qualification chroot/network namespace prepared by isolate.py.
import assert from 'node:assert/strict';
import {existsSync,readdirSync,lstatSync,readlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createConnection} from 'node:net';
import {networkInterfaces} from 'node:os';
const entries=[];
function walk(path){for(const name of readdirSync(path)){const full=(path==='/'?'':path)+'/'+name,st=lstatSync(full);assert(!st.isSocket(),'unexpected socket '+full);if(st.isDirectory())walk(full);else {assert(!['docker','podman','dockerd','containerd','crictl','nerdctl'].includes(name),'container executable '+full);if(st.isSymbolicLink())assert(!readlinkSync(full).startsWith('/'),'absolute symlink '+full);entries.push(full);}}}
walk('/');
for(const binary of ['docker','podman'])assert.equal(spawnSync(binary,['--version']).error?.code,'ENOENT');
for(const path of ['/var/run/docker.sock','/run/docker.sock','/run/podman/podman.sock','/run/containerd/containerd.sock'])assert.equal(existsSync(path),false);
for(const key of ['DOCKER_HOST','CONTAINER_HOST','DOCKER_CONTEXT','XDG_RUNTIME_DIR'])assert.equal(process.env[key],undefined);
assert.equal(Object.values(networkInterfaces()).flat().filter(x=>!x.internal).length,0);
const unreachable=await new Promise((resolve,reject)=>{const socket=createConnection({host:'192.0.2.1',port:2375});socket.setTimeout(500,()=>{socket.destroy();resolve('TIMEOUT_BLOCKED');});socket.once('connect',()=>{socket.destroy();reject(Error('unexpected remote endpoint access'));});socket.once('error',e=>resolve(e.code));});
assert(['ENETUNREACH','EHOSTUNREACH','TIMEOUT_BLOCKED'].includes(unreachable));
console.log(JSON.stringify({kind:'NATIVE_ENVIRONMENT_OBSERVATION',node:process.version,uid:process.getuid(),docker:'UNAVAILABLE',podman:'UNAVAILABLE',socketScan:'NONE',remoteEndpoint:unreachable,nonLoopbackInterfaces:0,containerStartups:0,imageDownloads:0,containerDependency:0,claim:'native-first only, not deployment equivalence',filesScanned:entries.length}));
const files=readdirSync('/work/service-foundation/tests').filter(p=>p.endsWith('.test.mjs')).sort().map(p=>'/work/service-foundation/tests/'+p);
const result=spawnSync(process.execPath,['--experimental-vm-modules','--test','--test-timeout=15000',...files],{cwd:'/work',encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024});
process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');if(result.error)throw result.error;assert.equal(result.status,0,'native functional tests failed');
const external=spawnSync(process.execPath,['--experimental-vm-modules','/work/service-foundation/conformance/external-run.mjs'],{encoding:'utf8',timeout:45000,maxBuffer:2*1024*1024});process.stdout.write(external.stdout??'');process.stderr.write(external.stderr??'');assert.equal(external.status,0,'external author/crash-restart failed');
console.log(JSON.stringify({kind:'EXECUTED',status:'PASS',source:'working-tree candidate, not committed-public reproduction',catalogRecords:'EXPERIMENTAL_LOCAL_SNAPSHOT_CHECKED_BY_EXTERNAL_OPERATOR',externalAuthor:'PASS'}));
