import hashlib
import json
from pathlib import Path

E = Path('evidence/g7/owned-coordinator')
allow = json.loads((E / 'transfer-allowlist.json').read_text())
allowed = set(allow['source'] + allow['newDocumentation'])
report = {'baseline': allow['baseline'], 'hosts': {}}
for host in ('local', 'remote'):
    before = json.loads((E / (host + '-before.json')).read_text())
    after = json.loads((E / (host + '-after.json')).read_text())
    assert before['head'] == after['head'] == allow['baseline']
    changed = [p for p, binding in before['files'].items() if after['files'].get(p) != binding]
    forbidden = [p for p in changed if p not in allowed]
    added = sorted(set(after['files']) - set(before['files']))
    forbidden_added = [p for p in added if p not in allowed]
    assert not forbidden, (host, 'changed protected source/evidence', forbidden)
    assert not forbidden_added, (host, 'non-allowlisted additions', forbidden_added)
    report['hosts'][host] = {'originalFiles': len(before['files']), 'preservedOriginalFiles': len(before['files']) - len(changed), 'authorizedChangedOriginals': changed, 'authorizedAdditions': added, 'forbiddenChanges': forbidden, 'forbiddenAdditions': forbidden_added}
local = json.loads((E / 'local-after.json').read_text())
remote = json.loads((E / 'remote-after.json').read_text())
for path in allowed:
    assert local['files'][path] == remote['files'][path], path
report['matchingDeliveredSourceAndDocumentation'] = sorted(allowed)
actual = {p: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in allow['source']}
for name in ('before-focused.sha256', 'after-focused.sha256', 'before-full.sha256', 'after-full.sha256'):
    lines = (E / 'review-candidate' / name).read_text().splitlines()
    binding = dict((line.split(None, 1)[1].strip(), line.split(None, 1)[0]) for line in lines)
    assert binding == actual, name
report['sourceMatchesAllFinalFocusedAndFullBoundaries'] = actual
for phase in ('focused-final', 'full-check', 'format-final', 'remote-diff-check'):
    assert (E / 'review-candidate' / (phase + '.exit')).read_text().strip() == '0', phase
print(json.dumps(report, indent=2))
