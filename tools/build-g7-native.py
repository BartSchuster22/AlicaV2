"""Host ownership builder. No arguments retain the legacy development contract.
--output-directory selects isolated fresh output plus same-ELF map evidence.
Neither mode loads native code or establishes runtime qualification.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import shlex

R = Path(__file__).resolve().parents[1]
T = R / '.tools'

def sha(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda: f.read(1048576), b''):
            h.update(b)
    return h.hexdigest()

def linker_command(log, zig, output):
    """Extract one actual bare ld.lld command for exactly this output."""
    links = []
    for line in log.decode().splitlines():
        if not line.startswith('ld.lld '):
            continue
        args = shlex.split(line)
        positions = [i for i, arg in enumerate(args) if arg == '-o']
        if len(positions) != 1 or positions[0] + 1 >= len(args):
            raise SystemExit('Malformed linker output arguments')
        if args[positions[0] + 1] == str(output):
            links.append([str(zig), *args])
    if len(links) != 1:
        raise SystemExit('Expected exactly one linker command for output')
    return links[0]

def legacy_build():
    lock = json.loads((R / 'native/g6/toolchain.lock.json').read_text())
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
    command = [str(zig), 'cc', '-target', 'x86_64-linux-gnu', '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-pthread', '-fstack-protector-strong', '-D_FORTIFY_SOURCE=2', '-fPIC', '-shared', '-Wl,-z,relro,-z,now', '-DNAPI_VERSION=9', '-I' + str(headers), str(source), '-o', str(output)]
    subprocess.run(command, cwd=R, check=True, env={**os.environ, 'ZIG_GLOBAL_CACHE_DIR': str(T/'zig-global-cache'), 'ZIG_LOCAL_CACHE_DIR': str(T/'zig-local-cache')})
    inputs = [source, Path(__file__), R/'native/g6/toolchain.lock.json', R/'toolchain.lock.json', *sorted(headers.glob('*.h'))]
    receipt = {'qualification': 'HOST-OWNERSHIP-ONLY', 'command': command, 'compilerArchiveSha256': sha(archive), 'compilerExecutableSha256': sha(zig), 'inputs': {str(p.relative_to(R)): sha(p) for p in inputs}, 'outputSha256': sha(output)}
    (build/'receipt.json').write_text(json.dumps(receipt, indent=2)+'\n')
    print(json.dumps(receipt, indent=2))


def fresh_build(output_directory):
    build = output_directory.resolve(strict=True)
    if any(build.iterdir()):
        raise SystemExit('Fresh empty output required')
    lock = json.loads((R / 'native/g6/toolchain.lock.json').read_text())
    archive = T / 'g6-zig.tar.xz'
    if archive.stat().st_size != lock['bytes'] or sha(archive) != lock['sha256']:
        raise SystemExit('Pinned compiler archive mismatch')
    zig = T / ('zig-x86_64-linux-' + lock['version']) / 'zig'
    if sha(zig) != '2858dc89dbbfdd08cceda1b841e7fd0a793a1a67b49f150bc3d0d1de44ed7f51':
        raise SystemExit('Pinned installed compiler mismatch')
    headers = T / 'node/include/node'
    source = R / 'native/g7/ownership.c'
    output = build / 'ownership.node'
    mapfile = build / 'ownership.node.map'
    for name in ('cache-global', 'cache-local', 'tmp', 'home'):
        (build/name).mkdir()
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'HOME': str(build/'home'), 'TMPDIR': str(build/'tmp'), 'ZIG_LIB_DIR': str(zig.parent/'lib'), 'ZIG_GLOBAL_CACHE_DIR': str(build/'cache-global'), 'ZIG_LOCAL_CACHE_DIR': str(build/'cache-local')}
    if subprocess.check_output([zig, 'version'], text=True, env=env).strip() != lock['version']:
        raise SystemExit('Compiler mismatch')
    command = [str(zig), 'cc', '-target', 'x86_64-linux-gnu', '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-pthread', '-fstack-protector-strong', '-D_FORTIFY_SOURCE=2', '-fPIC', '-shared', '-Wl,-z,relro,-z,now', '-DNAPI_VERSION=9', '-I' + str(headers), str(source), '-o', str(output), '-v']
    inputs = [source, Path(__file__), R/'native/g6/toolchain.lock.json', R/'toolchain.lock.json', *sorted(headers.glob('*.h'))]
    before = {str(p.relative_to(R)): sha(p) for p in inputs}
    print(json.dumps({'event': 'compile-start', 'command': command, 'environment': env, 'inputs': before}), flush=True)
    proc = subprocess.Popen(command, cwd=build, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log = proc.stdout.read(65537)
    if len(log) > 65536:
        proc.kill(); proc.wait(); raise SystemExit('Compiler capture overflow')
    rc = proc.wait()
    with (build/'compiler.log').open('xb') as f:
        f.write(log)
    if rc:
        print(log.decode(errors='replace'), flush=True)
        raise SystemExit(rc)
    link = linker_command(log, zig, output)
    before_map = sha(output)
    link.append('-Map=' + str(mapfile))
    subprocess.run(link, cwd=build, check=True, env=env)
    if sha(output) != before_map:
        raise SystemExit('Map relink changed ELF bytes')
    if before != {str(p.relative_to(R)): sha(p) for p in inputs}:
        raise SystemExit('Build inputs changed')
    receipt = {'qualification': 'HOST-OWNERSHIP-ONLY', 'command': command, 'environment': env, 'compilerArchiveSha256': sha(archive), 'compilerExecutableSha256': sha(zig), 'inputs': before, 'outputSha256': sha(output), 'mapSha256': sha(mapfile), 'sourceProvenance': {'ownershipSha256': before[str(source.relative_to(R))], 'recipeSha256': before[str(Path(__file__).relative_to(R))]}, 'builderUid': os.getuid()}
    receipt.update({'mapCommand': link, 'compilerLogSha256': sha(build/'compiler.log'), 'mapRelinkSameElf': True})
    with (build/'receipt.json').open('x') as f:
        f.write(json.dumps(receipt, indent=2)+'\n')
    print(json.dumps({'event': 'compile-complete', 'receipt': receipt}), flush=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-directory', type=Path,
                        help='existing empty directory; isolated cache and same-ELF map')
    args = parser.parse_args(argv)
    if args.output_directory is None:
        legacy_build()
    else:
        fresh_build(args.output_directory)

if __name__ == '__main__':
    main()
