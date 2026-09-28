"""Run finite MemoryV4 fixtures with empty environment in caller-owned network namespace."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
assert socket.if_nameindex() == [(1, 'lo')], 'requires isolated network namespace'
assert len(sys.argv) == 2 and sys.argv[1] in {'baseline', 'refactor', 'portable', 'qualified', 'final'}
label = sys.argv[1]
with tempfile.TemporaryDirectory(prefix='phase51-python-', dir=root / '.tools') as home:
    env = {'PATH': str(Path(sys.executable).parent) + ':/usr/bin:/bin', 'HOME': home,
           'TMPDIR': home, 'PYTHONDONTWRITEBYTECODE': '1',
           'MEMORYV4_DB_PATH': home + '/default.sqlite3',
           'PYTEST_DISABLE_PLUGIN_AUTOLOAD': '1'}
    p = subprocess.run([sys.executable, '-m', 'pytest', '-q', '--tb=short', 'tests/test_exchange.py' if label == 'portable' else 'tests'],
                       cwd=root / 'services/memoryv4', env=env,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=240)
    output = json.dumps({'networkInterfaces': socket.if_nameindex(), 'environment': 'empty plus fixture values', 'productionConfig': False, 'phase': label}) + '\n' + p.stdout
    (root / f'docs/phase5.1/evidence/python-{label}.log').write_text(output)
    print(output)
    sys.exit(p.returncode)
