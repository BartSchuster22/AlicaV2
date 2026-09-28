"""Reconcile installed pre-code documents against reviewed evidence; no product imports."""
import hashlib
import json
import pathlib
import re
import subprocess

root = pathlib.Path(__file__).resolve().parents[2]
docs = root / 'docs/phase5.1'
plan_hash = '90edb11b36cb008799ebebfa869fb0edeaa3024c099063cc9f4fbd222d4482c2'
expected = json.loads((docs / 'precode-document-hashes.json').read_text())
for relative, sha in expected.items():
    assert hashlib.sha256((root / relative).read_bytes()).hexdigest() == sha, relative
assert plan_hash in (docs / 'CHARTER.md').read_text()
sources = {
    'phase51/spike/neutral.py': 'ac2d73f335b8f35149ca71792bbdad1e05bc4943613377e6e94ce37b29cb3599',
    'phase51/spike/provider.mjs': 'e778b1e5c6d66ec50369ecebd528f3ff1eca442728c57e606d6250be9ea623f3',
    'phase51/spike/test.mjs': '28c30b886999f050f3828ccec61e934eb6cda6f3b01b447b3672a3a2a609417c',
    'docs/phase5.1/evidence/m3-spike.log': '5788d7a200d706515b526dcc154a4515b302848108c3162d3b194422601d666c',
}
for relative, sha in sources.items():
    assert hashlib.sha256((root / relative).read_bytes()).hexdigest() == sha, relative
log = (docs / 'evidence/m3-spike.log').read_text()
for label, count in [('tests', 5), ('pass', 5), ('fail', 0), ('cancelled', 0), ('skipped', 0)]:
    assert re.search(r'\b' + label + r'\s+' + str(count) + r'\b', log), label
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip() == '94570dd322f07e2860016b89c1e81356cc8b65cc'
subprocess.run(['git', 'diff', '--exit-code', 'HEAD', '--', 'packages', 'service-foundation', 'services/decision'], cwd=root, check=True)
result = {
    'status': 'M0_M3_PASS',
    'basis': 'Bounded owner-authorized charter; selected B baseline/classified drift; explicit governance mapping; executed neutral public Host/Python authority/error/lifetime proof. Document reconciliation is not independent review or product qualification.',
    'planSha256': plan_hash,
    'sourceBaseline': '6111107fa709826c0642651f7f256c0c7fe3116a',
    'frozenBase': '94570dd322f07e2860016b89c1e81356cc8b65cc',
    'documentSha256': expected,
    'evidenceSha256': sources,
    'M0': 'PASS bounded charter authorized by owner; no production mutation',
    'M1': 'PASS developed baseline selected; runtime/document drift classified; production DB versions uninspected by authorization boundary',
    'M2': 'PASS governance ownership/enforcement mapped, no proposed Store/HTTP bypass',
    'M3': 'PASS neutral public binding proof, five executed tests',
    'catalogAdmission': False,
    'productQualification': False,
    'ownerAcceptance': False,
}
(docs / 'evidence/precode-gates.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, sort_keys=True))
