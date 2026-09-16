"""Bounded known-credential pattern check, not a guarantee against all secret leakage."""
import argparse,re,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--path');args=parser.parse_args()
patterns=[rb'-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----',rb'gh[pousr]_[A-Za-z0-9]{36,}',rb'github_pat_[A-Za-z0-9_]{60,}',rb'AKIA[A-Z0-9]{16}',rb'xox[baprs]-[A-Za-z0-9-]{20,}']
files=[args.path] if args.path else subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard']).decode().split('\0')
failed=False
for f in sorted(set(files)):
 if not f or not Path(f).is_file():continue
 data=Path(f).read_bytes()
 if any(re.search(p,data) for p in patterns):print(f+': credential pattern detected (value redacted)');failed=True
if not failed:print('Secret pattern check passed')
raise SystemExit(1 if failed else 0)
