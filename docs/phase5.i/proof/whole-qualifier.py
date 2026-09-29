import os,sys,json,time,socket,subprocess,secrets,traceback
from pathlib import Path
import httpx
mode=sys.argv[1];assert mode in ['write','read'];out=Path('/evidence');status=Path('/proc/self/status').read_text()
assert os.getuid()!=0 and 'CapEff:\t0000000000000000' in status and 'CapBnd:\t0000000000000000' in status and 'NoNewPrivs:\t1' in status
assert not Path('/root').exists() and not Path('/srv').exists() and not Path('/home/alica-dev/.ssh').exists() and not Path('/home/alica-dev/.hermes').exists()
assert Path('/state/restart-proof.json').is_file()
assert not any(k for k in os.environ if 'KEY' in k or 'TOKEN' in k or 'PROXY' in k)
routes=Path('/proc/net/route').read_text();assert len(routes.strip().splitlines())==1
print('K_PRELAUNCH_ISOLATION_PASS',json.dumps({'uid':os.getuid(),'routeRows':0,'capabilities':0,'noNewPrivileges':True,'net':os.readlink('/proc/self/ns/net'),'pid':os.readlink('/proc/self/ns/pid'),'processes':[p.name for p in Path('/proc').iterdir() if p.name.isdigit()]}),flush=True)
h=Path('/state/hermes')
(h/'config.yaml').write_text('kanban:\n  dispatch_in_gateway: false\n  notify_in_gateway: false\n  auto_decompose: false\n  review_dispatch: false\n  dispatch_profiles: []\n  auto_subscribe_on_create: false\nlocal_runtime:\n  enabled: false\nmcp:\n  enabled: false\nplugins:\n  enabled: [kanban]\ntelemetry:\n  enabled: false\n')
token=secrets.token_urlsafe(32);env=dict(os.environ,HERMES_DASHBOARD_SESSION_TOKEN=token,npm_config_cache='/state/npm-cache',npm_config_offline='true')
log=(out/('whole-'+mode+'-backend.log')).open('w');command=[sys.executable,'-m','hermes_cli.main','serve','--isolated','--host','127.0.0.1','--port','19119']
def launch():return subprocess.Popen(command,env=env,stdout=log,stderr=log,cwd='/state/user')
def ready(p):
 deadline=time.monotonic()+45
 while time.monotonic()<deadline:
  if p.poll() is not None:raise RuntimeError('reference backend exited during startup')
  try:
   if httpx.get('http://127.0.0.1:19119/api/plugins/kanban/board',timeout=1,trust_env=False).status_code==401:return
  except httpx.ConnectError:pass
  time.sleep(.1)
 raise RuntimeError('reference readiness timeout')
def stop(p):
 if p.poll() is None:
  p.terminate()
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:p.kill();p.wait()
p=launch();result={'stage':'WHOLE_REFERENCE','mode':mode,'functional':False,'productionCredentialRead':False,'freshFixtureCredential':True,'dispatch':0,'assignment':0,'workers':None,'runs':None,'termination':0}
try:
 ready(p)
 subprocess.run(['/node/bin/node','--experimental-vm-modules','/work/phase5i/domain-cycle.mjs',mode],cwd='/work',env=env,check=True,timeout=60)
 subprocess.run(['/node/bin/node','--experimental-vm-modules','/external/operator/phase5i-cycle.mjs','hold' if mode=='write' else 'recover'],cwd='/work',env=env,check=True,timeout=30)
 henv=dict(os.environ,HOME='/tmp/h-home',HERMES_HOME='/tmp/h-home/.hermes',TMPDIR='/tmp/h-tmp',PATH='/home/alica-dev/phase5i/upstream-H/.venv/bin:/usr/bin:/bin')
 subprocess.run(['/home/alica-dev/phase5i/upstream-H/.venv/bin/hermes','profile','list'],env=henv,check=True,timeout=30)
 files=[str(p) for p in sorted(Path('/work/services/decision/tests').rglob('*.test.mjs'))]
 subprocess.run(['/node/bin/node','--experimental-vm-modules','--test',*files],cwd='/work',env=env,check=True,timeout=120)

 stop(p);p=launch();ready(p)
 subprocess.run(['/node/bin/node','--experimental-vm-modules','adapters/hermes-kanban/tests/restart.mjs'],cwd='/work',env=env,check=True,timeout=30)
 with httpx.Client(base_url='http://127.0.0.1:19119/api/plugins/kanban',headers={'Authorization':'Bearer '+token},trust_env=False) as c:
  board=c.get('/board',params={'board':'default'});board.raise_for_status();tasks=[t for col in board.json()['columns'] for t in col['tasks']]
  assert tasks and all(t['status']=='triage' and t['assignee'] is None and t['worker_pid'] is None and t['current_run_id'] is None for t in tasks)
  for t in tasks:
   response=c.get('/tasks/'+t['id'],params={'board':'default'});response.raise_for_status();assert not response.json()['runs']
  result.update(functional=True,workers=0,runs=0,taskCount=len(tasks),realBackendRestart=True,continuity='UNKNOWN')
  print('K_POST_MUTATION_NO_WORKERS_RUNS_PASS',len(tasks),flush=True)
except Exception as ex:result['error']=str(ex);traceback.print_exc()
finally:
 stop(p);log.close();p=out/('whole-'+mode+'-backend.log');p.write_text(p.read_text(errors='replace').replace(token,'[REDACTED_FIXTURE_TOKEN]'));(out/('whole-'+mode+'-result.json')).write_text(json.dumps(result,indent=2)+'\n');print('K_FUNCTIONAL_RESULT',json.dumps(result),flush=True)
sys.exit(0 if result['functional'] else 1)
