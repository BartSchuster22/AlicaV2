"""One bounded private invocation; never HTTP, daemon, or caller-selected dispatcher."""
import json
import os
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.candidates import AdapterError, invoke
from app.domain import GovernedMemory
from app.storage import SqliteStore

REQUEST_LIMIT = 65536
RESPONSE_LIMIT = 2097152

def run():
    raw = sys.stdin.buffer.read(REQUEST_LIMIT + 1)
    if len(raw) > REQUEST_LIMIT:
        raise AdapterError('RESOURCE_EXHAUSTED')
    data = json.loads(raw)
    if set(data) != {'v','operation','payload','authority','key','requestId','deadlineMs'} or data['v'] != 1:
        raise AdapterError('INVALID_ARGUMENT')
    if time.time() * 1000 >= data['deadlineMs']:
        raise AdapterError('DEADLINE_EXCEEDED')
    path = Path(os.environ['MEMORYV4_DB_PATH'])
    if not path.is_absolute():
        raise AdapterError('FAILED_PRECONDITION')
    store = SqliteStore(path)
    try:
        return invoke(GovernedMemory(store), data['operation'], data['payload'],
                      data['authority'], data['key'], data['requestId'])
    finally:
        store.close()

if __name__ == '__main__':
    try:
        frame = {'v': 1, 'result': run()}
    except AdapterError as exc:
        frame = {'v': 1, 'error': str(exc)}
    except Exception:
        frame = {'v': 1, 'error': 'UNAVAILABLE'}
    raw = json.dumps(frame, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    if len(raw) > RESPONSE_LIMIT:
        raw = b'{"v":1,"error":"RESOURCE_EXHAUSTED"}'
    sys.stdout.buffer.write(raw)
