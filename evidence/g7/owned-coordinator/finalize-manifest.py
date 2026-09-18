import hashlib
import json
from pathlib import Path

E = Path('evidence/g7/owned-coordinator')
manifest = E / 'final-manifest.json'
checksum = E / 'final-manifest.sha256'
allow = json.loads((E / 'transfer-allowlist.json').read_text())
paths = {Path(p) for p in allow['source'] + allow['newDocumentation']}
paths.update(p for p in E.rglob('*') if p.is_file() and not p.is_symlink())
paths.difference_update({manifest, checksum})

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

files = {str(p): {'sha256': digest(p), 'bytes': p.stat().st_size, 'mode': p.stat().st_mode & 0o777} for p in sorted(paths)}
manifest.write_text(json.dumps({'purpose': 'delivered file integrity, not custody permission, signing or acceptance', 'scope': 'seven delivered source files, two new documents, and regular files under the owned-coordinator evidence prefix', 'excludedSelfFiles': [str(manifest), str(checksum)], 'files': files}, indent=2) + '\n')
checksum.write_text(digest(manifest) + '  ' + str(manifest) + '\n')
loaded = json.loads(manifest.read_text())
for name, item in loaded['files'].items():
    p = Path(name)
    assert digest(p) == item['sha256'] and p.stat().st_size == item['bytes'] and p.stat().st_mode & 0o777 == item['mode'], name
assert checksum.read_text().split()[0] == digest(manifest)
print('Verified final manifest:', len(files), 'regular files;', sum(item['bytes'] for item in files.values()), 'bytes')
print('Manifest SHA-256:', digest(manifest))
