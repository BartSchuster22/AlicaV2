import pathlib, subprocess, json, hashlib, sys, time
root=pathlib.Path('/home/herman/g7-implementation')
base=root/'evidence/g7/recovery-completion'
ssh=['ssh','-i','/home/herman/.ssh/alica_v2_vps_ed25519','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=/home/herman/.ssh/alica_v2_known_hosts','alica-dev@167.233.135.142']
files=['tools/g7-cell.mjs','tests/g7/serving-driver.mjs','tests/g7/serving-continuation.test.mjs','tools/g7-runtime-dependencies.mjs','tests/g7/runtime-dependencies.test.mjs','docs/g7/R1-RECOVERY-COMPLETION.md','docs/g7/R1-RECOVERY-COMPLETION-EXECUTION.md']
name=sys.argv[1]; out=base/name; out.mkdir(parents=True,exist_ok=False)
def hashes(): return {p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files}
(out/'allowlist.json').write_text(json.dumps(files,indent=2)+'\n')
(out/'local-before.json').write_text(json.dumps(hashes(),indent=2)+'\n')
archive=out/'input.tar'
subprocess.run(['tar','-cf',str(archive),'-C',str(root),*files],check=True)
remote='/home/alica-dev/AlicaV2'
with archive.open('rb') as f:
 subprocess.run(ssh+[f'cd {remote} && test "$(git rev-parse HEAD)" = a314e56a17958fa7befa0d07b90b8327c8e2fd0c && tar -xf -'],stdin=f,check=True)
command=sys.argv[2]
rdir='evidence/g7/recovery-completion/'+name
script=f'''cd {remote} && export PATH="$PWD/.tools/node/bin:$PATH" && mkdir -p evidence/g7/recovery-completion && mkdir {rdir} && sha256sum {' '.join(files)} > {rdir}/remote-before.sha256 && export G7_SERVING_EVIDENCE="$PWD/{rdir}/artifacts" G7_DEPENDENCY_EVIDENCE="$PWD/{rdir}/dependencies" G7_CROSS_EVIDENCE="$PWD/{rdir}/cross" G7_LIFECYCLE_EVIDENCE="$PWD/{rdir}/lifecycle" G7_OWNED_EVIDENCE="$PWD/{rdir}/owned" G7_ADMIN_EVIDENCE="$PWD/{rdir}/admin" && ( {command} ) > {rdir}/run.log 2>&1; result=$?; printf '%s\\n' "$result" > {rdir}/exit.txt; sha256sum {' '.join(files)} > {rdir}/remote-after.sha256; exit "$result"'''
(out/'command.txt').write_text(script+'\n')
start=time.time(); result=subprocess.run(ssh+[script]); end=time.time()
(out/'execution.json').write_text(json.dumps({'start':start,'end':end,'exit':result.returncode},indent=2)+'\n')
with (out/'returned.tar').open('wb') as f:
 subprocess.run(ssh+[f'cd {remote} && tar -cf - {rdir}'],stdout=f,check=True)
# Extract in separate receipt directory; never overwrite local source/evidence.
returned=out/'returned'; returned.mkdir()
subprocess.run(['tar','-xf',str(out/'returned.tar'),'-C',str(returned)],check=True)
(out/'local-after.json').write_text(json.dumps(hashes(),indent=2)+'\n')
print(json.dumps({'run':name,'exit':result.returncode,'receipts':str(returned)}),flush=True)
sys.exit(result.returncode)
