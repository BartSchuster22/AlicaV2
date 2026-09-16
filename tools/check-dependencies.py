"""Fail closed on unpinned deps, undeclared runtime deps and unapproved licenses."""
from pathlib import Path
import json,re,importlib.metadata
R=Path(__file__).resolve().parents[1]
allowed={'MIT','MIT-0','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','PSF-2.0'}
def license_ok(expression):
 tokens=set(re.findall(r'[A-Za-z0-9.+-]+',expression))-{'AND','OR'}
 return bool(tokens) and tokens<=allowed
p=json.loads((R/'package.json').read_text());lock=json.loads((R/'package-lock.json').read_text())
assert not p.get('dependencies'),'root is development-only'
for manifest_path in (R/'packages').glob('*/package.json'):
 manifest=json.loads(manifest_path.read_text())
 for name,version in manifest.get('dependencies',{}).items():
  assert name in {'@alica/acap-types','@alica/acap-contracts','ajv'},name
  assert re.fullmatch(r'\d+\.\d+\.\d+',version),name
for name,version in p['devDependencies'].items():assert re.fullmatch(r'\d+\.\d+\.\d+',version),name
for path,entry in lock['packages'].items():
 if not path.startswith('node_modules/') or entry.get('link'):continue
 assert entry.get('integrity','').startswith('sha512-'),path
 assert entry.get('resolved','').startswith('https://registry.npmjs.org/'),path
 manifest=json.loads((R/path/'package.json').read_text());assert license_ok(manifest.get('license','')),path
 assert not entry.get('hasInstallScript'),path
 print('npm',manifest['name'],manifest['version'],manifest['license'])
T=R/'.tools/python';toolchain=json.loads((R/'toolchain.lock.json').read_text())
installed={d.metadata['Name'].lower().replace('_','-'):d for d in importlib.metadata.distributions(path=[str(T)])}
for p in toolchain['pythonWheels']:
 d=installed[p['name'].lower().replace('_','-')];assert d.version==p['version']
 expression=d.metadata.get('License-Expression') or d.metadata.get('License') or ''
 assert license_ok(expression),(p['name'],expression)
 print('python',p['name'],p['version'],expression)
print('Exact dependencies and reviewed license allowlist passed; not a vulnerability scan')
