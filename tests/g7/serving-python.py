"""Test-only real successor fence IO crash boundaries; no successful report substitutes."""
import json
import os
import runpy
import signal
import sys
from pathlib import Path

sys.argv.pop(0)
directory = Path(os.environ['G7_SERVING_DIR'])
mode = os.environ['G7_SERVING_MODE']
retired = False

def event(name):
    with (directory / 'events.jsonl').open('a') as out:
        out.write(json.dumps({'event': name, 'pid': os.getpid()}) + '\n')
    if mode == name:
        os.kill(os.getpid(), signal.SIGKILL)

link, unlink, sync, fdopen = os.link, os.unlink, os.fsync, os.fdopen

def linked(source, destination, *args, **kwargs):
    global retired
    successor = str(destination).startswith('retired-')
    if successor:
        event('fence-before-retire-link')
    result = link(source, destination, *args, **kwargs)
    if successor:
        retired = True
        event('fence-after-retire-link')
    return result

unlinked_count = 0

def unlinked(path, *args, **kwargs):
    global unlinked_count
    result = unlink(path, *args, **kwargs)
    if retired:
        unlinked_count += 1
        event({'incarnation.json': 'fence-after-incarnation-unlink',
               'admin.sock': 'fence-after-v1-unlink',
               'admin-v2.sock': 'fence-after-v2-unlink'}.get(str(path), 'unrelated-unlink'))
    return result


def synced(fd):
    result = sync(fd)
    if retired:
        path = os.readlink('/proc/self/fd/' + str(fd))
        if path.endswith('/supervision') and unlinked_count == 0:
            event('fence-after-retire-fsync')
        if path.endswith('/supervision/incarnation.json'):
            event('fence-after-new-incarnation-fsync')
    return result

os.link, os.unlink, os.fsync = linked, unlinked, synced
runpy.run_path(sys.argv[0], run_name='__main__')
