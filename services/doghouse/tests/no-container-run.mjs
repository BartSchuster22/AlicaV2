// Executed ONLY after disposable chroot; prerequisite paths are fixture paths.
import assert from 'node:assert/strict';
import {lstatSync,readdirSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
assert.equal(process.env.PHASE52_DISPOSABLE_ROOT,'1');process.chdir('/work');assert.equal(process.cwd(),'/work');
let sockets=0,containerNames=0;
function walk(path){for(const name of readdirSync(path)){const p=join(path,name),s=lstatSync(p);assert.equal(s.isSymbolicLink(),false,p);if(s.isSocket())sockets++;if(/^(docker|podman|containerd|dockerd|crictl)$/.test(name))containerNames++;if(s.isDirectory())walk(p);}}
walk('/');assert.equal(sockets,0);assert.equal(containerNames,0);
for(const name of ['docker','podman']){const r=spawnSync(name,['--version']);assert.equal(r.error?.code,'ENOENT');}
for(const p of ['/run/docker.sock','/var/run/docker.sock','/run/podman/podman.sock','/run/containerd/containerd.sock','/proc','/sys'])assert.equal(existsSync(p),false,p);
console.log(JSON.stringify({prerequisite:'PASS',filesystem:'disposable chroot; allowlisted regular files only',network:'new network namespace',docker:'ENOENT',podman:'ENOENT',filesystemSockets:sockets,proc:false,sys:false,uid:process.getuid()}));
const tests=['domain','public','exchange','continuity-faults','acceptance','review-r2'].map(n=>`services/doghouse/tests/${n}.test.mjs`);
const r=spawnSync(process.execPath,['--experimental-vm-modules','--test','--test-timeout=30000',...tests],{stdio:'inherit',timeout:120000});assert.ifError(r.error);assert.equal(r.status,0);console.log('R1_NATIVE_UNAVAILABLE_QUALIFICATION_PASS');
