import json
from pathlib import Path

prefix = '/home/alica-dev/AlicaV2/evidence/g7/owned-coordinator/'
matching = []
for directory in Path('/proc').iterdir():
    if not directory.name.isdecimal():
        continue
    try:
        args = (directory / 'cmdline').read_bytes().decode(errors='replace').split('\0')
    except (FileNotFoundError, ProcessLookupError, PermissionError):
        continue
    owned_programs = {'tools/g7-owned-coordinator.py', 'tests/g7/owned-coordinator-driver.py', 'tests/g7/owned-channel-process.py', 'tools/g7-stopped-verify.mjs'}
    if any(arg.startswith(prefix) or arg.startswith('/tmp/g7-owned-') or arg in owned_programs or any(arg.endswith('/' + p) for p in owned_programs) for arg in args):
        matching.append({'pid': int(directory.name), 'argv': args})
print(json.dumps({'scope': 'live argv entries naming this implementation/test programs, /tmp/g7-owned- fixtures or evidence prefix; diagnostic only, not reap authority or a complete descendant census', 'matching': matching}, indent=2))
