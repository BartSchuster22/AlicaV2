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
    if any(arg.startswith(prefix) for arg in args):
        matching.append({'pid': int(directory.name), 'argv': args})
print(json.dumps({'scope': 'live argv entries under this fixture evidence prefix; diagnostic only, not reap authority or a complete descendant census', 'matching': matching}, indent=2))
