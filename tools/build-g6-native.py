"""Pinned, project-local native build. No sudo/global installs or runtime downloads."""
from pathlib import Path
import hashlib,json,os,platform,subprocess,tarfile,urllib.request
R=Path(__file__).resolve().parents[1];T=R/'.tools';N=R/'native/g6';B=N/'build';B.mkdir(parents=True,exist_ok=True)
if platform.system()!='Linux' or platform.machine()!='x86_64':raise SystemExit('G6 native profile requires Linux x86_64')
lock=json.loads((N/'toolchain.lock.json').read_text());archive=T/'g6-zig.tar.xz';T.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
if not archive.exists() or archive.stat().st_size!=lock['bytes'] or sha(archive)!=lock['sha256']:
 data=urllib.request.urlopen(lock['url'],timeout=120).read()
 if len(data)!=lock['bytes'] or hashlib.sha256(data).hexdigest()!=lock['sha256']:raise SystemExit('Native compiler archive mismatch')
 tmp=archive.with_suffix('.partial');tmp.write_bytes(data);tmp.replace(archive)
compiler=T/('zig-x86_64-linux-'+lock['version'])
if not compiler.exists():
 with tarfile.open(archive) as tar:tar.extractall(T,filter='data')
zig=compiler/'zig';version=subprocess.check_output([zig,'version'],text=True).strip()
if version!=lock['version']:raise SystemExit('Compiler version mismatch')
headers=T/'node/include/node'
if not (headers/'node_api.h').is_file():raise SystemExit('Run locked tools/bootstrap.py first; matching public Node headers required')
env={**os.environ,'ZIG_GLOBAL_CACHE_DIR':str(T/'zig-global-cache'),'ZIG_LOCAL_CACHE_DIR':str(T/'zig-local-cache')}
base=[str(zig),'cc','-target','x86_64-linux-gnu','-std=c11','-O2','-Wall','-Wextra','-Werror','-fstack-protector-strong','-D_FORTIFY_SOURCE=2']
commands=[base+['-fPIC','-shared','-Wl,-z,relro,-z,now','-DNAPI_VERSION=9','-I'+str(headers),str(N/'bridge.c'),str(N/'sandbox.c'),'-o',str(B/'bridge.node')],base+['-Wl,-z,relro,-z,now',str(N/'launcher.c'),'-o',str(B/'launcher')]]
for cmd in commands:subprocess.run(cmd,cwd=R,env=env,check=True)
inputs=[N/'toolchain.lock.json',N/'bridge.c',N/'sandbox.c',N/'launcher.c',R/'toolchain.lock.json',*sorted(headers.glob('*.h'))]
receipt={'level':'NATIVE-BUILD-ONLY','runtimeQualification':False,'compiler':version,'compilerArchiveSha256':sha(archive),'compilerExecutableSha256':sha(zig),'sources':{str(p.relative_to(R)):sha(p) for p in inputs},'artifacts':{p.name:sha(p) for p in [B/'bridge.node',B/'launcher']},'commands':commands}
(B/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k not in ['sources','commands']},indent=2))
