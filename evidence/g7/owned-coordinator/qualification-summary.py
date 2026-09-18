import json
import re
from pathlib import Path

E = Path('evidence/g7/owned-coordinator')
R = E / 'review-candidate'

def summaries(text):
    out = []
    current = None
    for line in text.splitlines():
        match = re.fullmatch(r'(?:ℹ |# )(tests|pass|fail|cancelled|skipped|todo|duration_ms) ([0-9.]+)', line)
        if match:
            key, value = match.groups()
            if key == 'tests':
                current = {}
                out.append(current)
            if current is not None:
                current[key] = float(value) if '.' in value else int(value)
    return out

result = {}
for phase in ('focused-final', 'full-check'):
    code = int((R / (phase + '.exit')).read_text().strip())
    text = (R / (phase + '.log')).read_text()
    result[phase] = {
        'exit': code,
        'nodeRunnerSummaries': summaries(text),
        'pythonRunnerCounts': [int(n) for n in re.findall(r'Ran ([0-9]+) tests? in ', text)],
        'failureMarkers': [line for line in text.splitlines() if '✖' in line],
    }
    assert code == 0 and not result[phase]['failureMarkers'], phase
full = (R / 'full-check.log').read_text()
result['finalRealBudgetCases'] = [line for line in full.splitlines() if line.startswith('✔ ') and any(term in line for term in ('blocked IO', 'buffered genuine CLEAN', 'blocked seal acknowledgement', 'guarded independent stopped worker'))]
result['fullStart'] = (R / 'full-start.txt').read_text().strip()
result['fullEnd'] = (R / 'full-end.txt').read_text().strip()
print(json.dumps(result, indent=2))
