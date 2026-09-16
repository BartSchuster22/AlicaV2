"""Run G1 design checks with only stdlib and hash-locked local wheel dependencies."""
from pathlib import Path
import sys,unittest,json,importlib.metadata
R=Path(__file__).resolve().parents[1];P=R/'.tools/python';sys.path.insert(0,str(P))
lock=json.loads((R/'toolchain.lock.json').read_text())
installed={d.metadata['Name'].lower().replace('_','-'):d.version for d in importlib.metadata.distributions(path=[str(P)])}
for p in lock['pythonWheels']:
 if installed.get(p['name'].lower().replace('_','-'))!=p['version']:raise SystemExit('Locked Python dependency missing or wrong version: '+p['name'])
suite=unittest.defaultTestLoader.discover(str(R/'tests/design'),pattern='test_*.py');result=unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(not result.wasSuccessful())
