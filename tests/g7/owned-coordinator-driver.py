"""Test-only syscall/protocol boundary pauses; no injected clean receipts."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import time

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('owned', root / 'tools/g7-owned-coordinator.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
mode, directory, node, cell, inputs = sys.argv[1:]
d = Path(directory)
origin = os.getpid()
owned = None

def record(event, **fields):
    with open(d / 'events.jsonl', 'a') as f:
        f.write(json.dumps({'event': event, 'pid': os.getpid(), 'parent': os.getppid(),
                            'monotonic': time.monotonic(), **fields}) + '\n')


def boundary(event):
    record(event)
    if mode == 'owner-death-' + event:
        m.signal.pidfd_send_signal(owned.pidfd, m.signal.SIGKILL)
        record('owner-killed', child=owned.owner.pid, pidfd=owned.pidfd)
    if mode == event:
        (d / 'boundary.json').write_text(json.dumps({'event': event, 'pid': os.getpid()}))
        fd = os.open(d / 'pause.fifo', os.O_RDONLY)
        os.read(fd, 1)
        os.close(fd)

send = m.send

def sending(channel, data):
    label = data.split(b' ', 1)[0].decode()
    boundary('before-' + label)
    result = send(channel, data)
    boundary('after-' + label)
    return result
m.send = sending

normal_reap = m.normal_reap

def reap(pid, pidfd, end):
    boundary('before-reap')
    result = normal_reap(pid, pidfd, end)
    record('normal-reap', child=pid, pidfd=pidfd)
    boundary('after-reap')
    return result
m.normal_reap = reap

maintenance = m.maintenance

def inspect(*args):
    boundary('before-maintenance')
    result = maintenance(*args)
    boundary('after-maintenance')
    return result
m.maintenance = inspect

fsync = m.base.os.fsync
fsync_count = 0

def sync(fd):
    global fsync_count
    if os.getpid() != origin:
        fsync_count += 1
        boundary('before-fsync')
        boundary('before-fsync-' + str(fsync_count))
    result = fsync(fd)
    if os.getpid() != origin:
        boundary('after-fsync-' + str(fsync_count))
        boundary('after-fsync')
    return result
m.base.os.fsync = sync

spawn_owner = m.base.Supervisor.spawn_owner

def spawn(self, *args):
    global owned
    result = spawn_owner(self, *args)
    owned = self
    record('owner-spawn', child=self.owner.pid, pidfd=self.pidfd)
    poll = self.owner.poll
    def observed_poll():
        status = poll()
        if status is not None:
            record('owner-waitpid', child=self.owner.pid, pidfd=self.pidfd, status=status)
        return status
    self.owner.poll = observed_poll
    return result
m.base.Supervisor.spawn_owner = spawn

m.run(node, cell, inputs)
