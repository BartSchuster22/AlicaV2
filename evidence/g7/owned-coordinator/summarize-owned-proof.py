import hashlib
import json
from pathlib import Path

E = Path('evidence/g7/owned-coordinator')
proofs = []
for path in sorted((E / 'review-candidate').rglob('maintenance-binding.json')):
    binding = json.loads(path.read_text())
    assert binding['before'] == binding['after']
    events = [json.loads(line) for line in (path.parent / 'events.jsonl').read_text().splitlines()]
    names = [event['event'] for event in events]
    owner = next(event for event in events if event['event'] == 'owner-waitpid')
    reaps = [event for event in events if event['event'] == 'normal-reap']
    assert owner['status'] == 0 and len(reaps) == 2
    assert names.index('owner-waitpid') < names.index('before-CLEAN') < names.index('after-CLEAN') < names.index('normal-reap') < names.index('before-maintenance') < len(names) - 1
    assert names[-1] == 'after-maintenance'
    assert names.index('before-maintenance') < events.index(reaps[1]) < names.index('after-maintenance')
    assert reaps[0]['pid'] == reaps[1]['pid']
    assert owner['pid'] == reaps[0]['child']
    actors = {'coordinator': reaps[0]['pid'], 'custodian': reaps[0]['child'], 'owner': owner['child'], 'stoppedWorker': reaps[1]['child']}
    assert len(set(actors.values())) == 4
    for name, value in binding['after'].items():
        copied = path.parent / 'cell' / name
        assert 'sha256:' + hashlib.sha256(copied.read_bytes()).hexdigest() == value['sha256'], str(copied)
    receipt = json.loads((path.parent.parent / 'stdout.log').read_text())
    assert receipt['status'] == 'STOPPED' and receipt['fence'] == 'RETAINED'
    proofs.append({'binding': str(path), 'actualActors': actors, 'equalBeforeAfterRegularFiles': len(binding['after']), 'returnedCopiedFileHashesMatch': True, 'receipt': receipt})
assert len(proofs) == 2
print(json.dumps({'scope': 'derived review index of actual receipts/snapshots; not a lifecycle permission', 'proofs': proofs}, indent=2))
