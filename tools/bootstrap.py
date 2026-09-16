"""Install locked development tools locally; no sudo, global packages or services."""
from pathlib import Path
import hashlib,json,os,subprocess,sys,tarfile,urllib.request
R=Path(__file__).resolve().parents[1];os.chdir(R);lock=json.loads((R/'toolchain.lock.json').read_text())
if sys.version_info[:2]!=(3,12):raise SystemExit('Python 3.12 required by locked wheel profile')
T=R/'.tools';T.mkdir(exist_ok=True)
def fetch(url,digest,target):
 if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest()!=digest:
  data=urllib.request.urlopen(url,timeout=120).read()
  if hashlib.sha256(data).hexdigest()!=digest:raise SystemExit('Download digest mismatch')
  target.write_bytes(data)
 return target
n=lock['node'];archive=fetch(n['url'],n['sha256'],T/'node.tar.xz')
node=T/('node-'+n['version']+'-linux-x64')
if not node.exists():
 with tarfile.open(archive) as tar:tar.extractall(T,filter='data')
link=T/'node'
if not link.exists():link.symlink_to(node.name,target_is_directory=True)
p=lock['pipBootstrap'];wheel=fetch(p['url'],p['sha256'],T/'pip-bootstrap.whl')
env={**os.environ,'PYTHONPATH':str(wheel),'PYTHONNOUSERSITE':'1','PIP_DISABLE_PIP_VERSION_CHECK':'1'}
subprocess.run([sys.executable,'-m','pip','--isolated','install','--only-binary=:all:','--require-hashes','--no-compile','--upgrade','--target',str(T/'python'),'-r','requirements-design.txt'],env=env,check=True)
print('Use: export PATH="$PWD/.tools/node/bin:$PATH"; npm ci --ignore-scripts; npm run check')
