import os,sys,json,time,socket,subprocess,secrets,traceback
from pathlib import Path
import httpx
out=Path('/evidence')
status=Path('/proc/self/status').read_text()
assert os.getuid()==65534 and 'CapEff:\t0000000000000000' in status and 'CapBnd:\t0000000000000000' in status
assert 'NoNewPrivs:\t1' in status
assert not Path('/root').exists() and not Path('/home/alica-dev').exists() and not Path('/srv').exists()
assert not list(Path('/home').iterdir()) and not list(Path('/state').iterdir())
assert not any(k for k in os.environ if 'KEY' in k or 'TOKEN' in k or 'PROXY' in k)
try:
 socket.create_connection(('1.1.1.1',443),timeout=1)
 raise AssertionError('egress reachable')
except OSError: pass
print('PRELAUNCH_ISOLATION_PASS',json.dumps({'uid':os.getuid(),'net':os.readlink('/proc/self/ns/net'),'pid':os.readlink('/proc/self/ns/pid'),'mount':os.readlink('/proc/self/ns/mnt'),'routes':Path('/proc/net/route').read_text(),'processes':[p.name for p in Path('/proc').iterdir() if p.name.isdigit()]}),flush=True)
Path('/state/user').mkdir()
h=Path('/state/hermes'); h.mkdir()
(h/'config.yaml').write_text('kanban:\n  dispatch_in_gateway: false\n  notify_in_gateway: false\n  auto_decompose: false\n  review_dispatch: false\n  dispatch_profiles: []\n  auto_subscribe_on_create: false\nlocal_runtime:\n  enabled: false\nmcp:\n  enabled: false\nplugins:\n  enabled: [kanban]\ntelemetry:\n  enabled: false\n')
token=secrets.token_urlsafe(32)
env=dict(os.environ,HERMES_DASHBOARD_SESSION_TOKEN=token)
import shutil
shutil.copytree('/opt/npm-cache','/state/npm-cache')
Path('/state/tools').mkdir(); Path('/state/tools/npm-cache').symlink_to('/state/npm-cache')
env.update(PATH='/opt/node/bin:/opt/venv/bin:/usr/bin:/bin',npm_config_cache='/state/npm-cache',npm_config_offline='true')

log=(out/'qualification-backend.log').open('w')
command=[sys.executable,'-m','hermes_cli.main','serve','--isolated','--host','127.0.0.1','--port','19119']
def launch(): return subprocess.Popen(command,env=env,stdout=log,stderr=log,cwd='/state/user')
def ready(p):
 deadline=time.monotonic()+45
 while time.monotonic()<deadline:
  if p.poll() is not None:raise RuntimeError('server exited')
  try:
   if httpx.get('http://127.0.0.1:19119/api/plugins/kanban/board',timeout=1,trust_env=False).status_code==401:return
  except httpx.ConnectError:pass
  time.sleep(.1)
 raise RuntimeError('server readiness timeout')
def stop(p):
 p.terminate()
 try:p.wait(timeout=10)
 except subprocess.TimeoutExpired:p.kill();p.wait()
p=launch();result={'kind':'PHASE5K_REAL_NORMAL_BACKEND_CONFORMANCE','passed':False}
try:
 ready(p)
 subprocess.run(['/opt/node/bin/node','--experimental-vm-modules','--test','--test-concurrency=1','--test-timeout=30000','adapters/hermes-kanban/tests/conformance.test.mjs'],cwd='/opt/alica',env=env,check=True,timeout=180)
 stop(p);p=launch();ready(p)
 subprocess.run(['/opt/node/bin/node','--experimental-vm-modules','adapters/hermes-kanban/tests/restart.mjs'],cwd='/opt/alica',env=env,check=True,timeout=30)
 with httpx.Client(base_url='http://127.0.0.1:19119/api/plugins/kanban',headers={'Authorization':'Bearer '+token},trust_env=False) as c:
  board=c.get('/board',params={'board':'default'});board.raise_for_status();tasks=[t for col in board.json()['columns'] for t in col['tasks']]
  assert tasks and all(t['status']=='triage' and t['assignee'] is None and t['worker_pid'] is None and t['current_run_id'] is None for t in tasks)
  for t in tasks:
   response=c.get('/tasks/'+t['id'],params={'board':'default'});response.raise_for_status();assert not response.json()['runs']
  print('K6_POST_MUTATION_NO_WORKERS_RUNS_PASS',len(tasks),flush=True)
 result['passed']=True
except Exception as e:
 result['error']=str(e);traceback.print_exc()
finally:
 stop(p);log.close()
 text=(out/'qualification-backend.log').read_text(errors='replace').replace(token,'[REDACTED_FIXTURE_TOKEN]');(out/'qualification-backend.log').write_text(text)
 (out/'qualification.json').write_text(json.dumps(result,indent=2)+'\n');print('QUALIFICATION_RESULT',json.dumps(result),flush=True)
sys.exit(0 if result['passed'] else 1)
