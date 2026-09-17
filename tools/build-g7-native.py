"""Host-only flock bridge; reuse authenticated, already provisioned G6 compiler. No downloads."""
from pathlib import Path
import hashlib
import json
import os
import subprocess

R = Path(__file__).resolve().parents[1]
T = R / '.tools'
lock = json.loads((R / 'native/g6/toolchain.lock.json').read_text())
def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
archive = T / 'g6-zig.tar.xz'
if archive.stat().st_size != lock['bytes'] or sha(archive) != lock['sha256']:
    raise SystemExit('Pinned compiler archive mismatch')
zig = T / ('zig-x86_64-linux-' + lock['version']) / 'zig'
if subprocess.check_output([zig, 'version'], text=True).strip() != lock['version']:
    raise SystemExit('Compiler mismatch')
headers = T / 'node/include/node'
source = R / 'native/g7/ownership.c'
build = R / 'native/g7/build'
build.mkdir(parents=True, exist_ok=True)
output = build / 'ownership.node'
command = [str(zig), 'cc', '-target', 'x86_64-linux-gnu', '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-fstack-protector-strong', '-D_FORTIFY_SOURCE=2', '-fPIC', '-shared', '-Wl,-z,relro,-z,now', '-DNAPI_VERSION=9', '-I' + str(headers), str(source), '-o', str(output)]
subprocess.run(command, cwd=R, check=True, env={**os.environ, 'ZIG_GLOBAL_CACHE_DIR': str(T/'zig-global-cache'), 'ZIG_LOCAL_CACHE_DIR': str(T/'zig-local-cache')})
inputs = [source, Path(__file__), R/'native/g6/toolchain.lock.json', R/'toolchain.lock.json', *sorted(headers.glob('*.h'))]
receipt = {'qualification': 'HOST-OWNERSHIP-ONLY', 'command': command, 'compilerArchiveSha256': sha(archive), 'compilerExecutableSha256': sha(zig), 'inputs': {str(p.relative_to(R)): sha(p) for p in inputs}, 'outputSha256': sha(output)}
(build/'receipt.json').write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps(receipt, indent=2))
