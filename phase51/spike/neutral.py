"""M3 only: fixed neutral echo worker; no MemoryV4 imports/storage/network."""
import json
import os
import sys
import time

LIMIT = 16384
raw = sys.stdin.buffer.read(LIMIT + 1)
if len(raw) > LIMIT:
    sys.exit(2)
try:
    frame = json.loads(raw)
    assert set(frame) == {'v', 'text', 'authority', 'deadlineMs'} and frame['v'] == 1
    assert set(frame['authority']) == {'actor', 'scope', 'permissions'}
    assert frame['authority']['permissions'] == ['neutral.echo']
    assert frame['authority']['actor'] and frame['authority']['scope']
    if time.time() * 1000 >= frame['deadlineMs']:
        sys.exit(3)
    text = frame['text']
    assert isinstance(text, str)
    # Neutral fault injection only, not an eventual memory operation.
    if text == '__authority__':
        text = json.dumps(frame['authority'], sort_keys=True)
    if text == '__crash__':
        os._exit(9)
    if text == '__hang__':
        time.sleep(30)
    if text == '__malformed__':
        print('not-json')
    elif text == '__oversize__':
        print('x' * (LIMIT + 1))
    else:
        print(json.dumps({'text': text}, ensure_ascii=True))
except (ValueError, AssertionError, KeyError, TypeError):
    sys.exit(2)
