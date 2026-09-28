"""Read-only source/old-packet verification, writing only new redesign evidence."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

root = Path(__file__).resolve().parents[2]
sha = lambda b: hashlib.sha256(b).hexdigest()
receipt = root / 'catalog/proposals/memory-candidates/review-receipt.json'
assert sha(receipt.read_bytes()) == 'a2437eeea121d0d241a9787b00dd6ab4a4669afdeac6afab1f3b67af3d05bfeb'
old = json.loads(receipt.read_text())['packetSha256']
for name, expected in old.items():
    assert sha((receipt.parent/name).read_bytes()) == expected, name
prior = json.loads((root/'docs/phase5.1/evidence/wip-source-hashes.json').read_text())
for name, expected in prior.items():
    assert sha((root/name).read_bytes()) == expected, name
frozen = {}
for name in ['packages/kernel/src/trust.ts','packages/kernel/src/index.ts',
             'packages/acap-contracts/src/runtime.ts','packages/plugin-sdk/src/index.ts']:
    current = (root/name).read_bytes()
    baseline = subprocess.check_output(['git','-C',str(root),'show','94570dd322f07e2860016b89c1e81356cc8b65cc:'+name])
    assert current == baseline, name
    frozen[name] = sha(current)
subprocess.run(['git','-C',str(root),'diff','--exit-code','94570dd322f07e2860016b89c1e81356cc8b65cc','--','packages','service-foundation'],check=True)
log = root/'docs/phase5.1/evidence/domain-replay-redesign.log'
text = log.read_text()
counts = {name: int(re.search(r'ℹ '+name+r' (\d+)', text).group(1)) for name in ['tests','pass','fail','cancelled','skipped']}
assert counts == {'tests':5,'pass':5,'fail':0,'cancelled':0,'skipped':0}
packet = root/'catalog/proposals/memory-candidates-v2'
paths = sorted(packet.glob('*')) + [root/'phase51/redesign'/n for n in ['prepare.mjs','provider.mjs','test.mjs','capture.py']]
result = {'status':'ADDITIVE_REDESIGN_DIAGNOSTIC_PASSED_PENDING_INDEPENDENT_REVIEW',
          'originalPacketPreserved':old,'originalReviewReceiptSha256':sha(receipt.read_bytes()),
          'frozenSourcesUnchanged':frozen,'productSourceUnchangedFromPriorWIP':prior,
          'diagnostic':{'counts':counts,'logSha256':sha(log.read_bytes()),
                        'retentionEvidence':'25h-aged fixture metadata plus source no-expiry/eviction; NOT elapsed24h soak'},
          'packetSha256':{str(p.relative_to(root)):sha(p.read_bytes()) for p in paths if p.is_file()},
          'reviewed':False,'admitted':False,'kernelChange':False,'productSwitch':False,
          'published':False,'ownerAccepted':False}
output = root/'docs/phase5.1/evidence/domain-replay-redesign.json'
output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':result['status'],'counts':counts,'evidenceSha256':sha(output.read_bytes()),'packetSha256':result['packetSha256']}))
