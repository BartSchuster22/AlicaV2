"""UNEXECUTED source candidate. Ordinary protocol/closure tests, NOT custody proof.
Adapted from owned-channel-process.py's full-module loader and boundary patching.
No real fork, pidfd, flock, signal, owner or native addon in these cases.
Future authorized command: python3 -B tests/g7/restore-composition-ordinary.py -v
"""
import importlib.util
import json
from pathlib import Path
import socket
import struct
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'restore_composition_owned', Path(__file__).resolve().parents[2] / 'tools/g7-owned-coordinator.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)  # Whole ordinary coordinator AND its real ordinary decoder.
A = 'sha256:' + 'a' * 64
B = 'sha256:' + 'b' * 64
I = 'sha256:' + 'c' * 64
SELECTION = dict(sequence=1, acceptedDigest=A, inputDigest=I)

def packet(value):
    return b'RESTORE ' + json.dumps(value).encode()

class Channel:
    def __init__(self, data=b'', pid=70, ancillary=True, flags=0):
        self.data, self.pid, self.ancillary, self.flags = data, pid, ancillary, flags
        self.sent = []
    def recvmsg(self, *_):
        credentials = [(socket.SOL_SOCKET, socket.SCM_CREDENTIALS,
                        struct.pack('3i', self.pid, m.os.getuid(), m.os.getgid()))]
        return self.data, credentials if self.ancillary else [], self.flags, None
    def send(self, data):
        self.sent.append(data)
        return len(data)
    def close(self):
        pass

class OrdinaryRestore(unittest.TestCase):
    def test_authenticated_boundary_closed_selection(self):
        # Credential BYTES are synthetic. Exercises real receive + selection,
        # not the kernel's credential provenance (existing real tests retain that).
        self.assertEqual(m.initial_selection(m.receive(Channel(packet(SELECTION)), 70)), SELECTION)
        self.assertIsNone(m.initial_selection(b'GO'))
        for channel in (Channel(packet(SELECTION), pid=71),
                        Channel(packet(SELECTION), ancillary=False),
                        Channel(packet(SELECTION), flags=1)):
            with self.subTest(channel=channel), self.assertRaises(RuntimeError):
                m.initial_selection(m.receive(channel, 70))

    def test_closed_shape_digest_sequence_rejections(self):
        bad = [[], None, {}, {**SELECTION, 'extra': True}]
        bad += [{k: v for k, v in SELECTION.items() if k != missing} for missing in SELECTION]
        for field in ('acceptedDigest', 'inputDigest'):
            bad += [{**SELECTION, field: value} for value in
                    (None, 1, '', 'sha256:' + 'A' * 64, 'sha256:' + 'a' * 63, A + '\n')]
        bad += [{**SELECTION, 'sequence': value} for value in
                (True, False, 0, -1, 1.5, '1', None, 9007199254740992)]
        for value in bad:
            with self.subTest(value=value), self.assertRaises((RuntimeError, ValueError)):
                m.initial_selection(m.receive(Channel(packet(value)), 70))
        for data in (b'RESTORE {', b'RESTORE []', b'GO ', b'RESTORE ' + b'x' * m.LIMITS['adminFrameBytes'],
                     b'RESTORE {"sequence":1,"sequence":2,"acceptedDigest":"' + A.encode() +
                     b'","inputDigest":"' + I.encode() + b'"}'):
            with self.subTest(data=data[:80]), self.assertRaises((RuntimeError, ValueError)):
                m.initial_selection(data)

    def test_real_run_closure_forwards_initial_digest_to_changed_serving_selection(self):
        calls, classes, reaps = [], [], []
        class RecordingSupervisor:
            def __init_subclass__(cls):
                classes.append(cls)
            def __init__(self, node, root, inputs):
                self.snapshot = None
                self.inputs = inputs
            def spawn_owner(self, accepted_digest=None, input_digest=None):
                calls.append((self.inputs, accepted_digest, input_digest, dict(self.snapshot)))
        outer, control, child = Channel(), Channel(), Channel()
        stopped = dict(status='STOPPED', sequence=1, acceptedDigest=A)
        successor = dict(status='STOPPED', sequence=2, acceptedDigest=B)
        clean = lambda value: b'CLEAN ' + json.dumps(value).encode()
        replies = iter([packet(SELECTION), b'READY', b'SEAL', b'SEALED', clean(stopped), b'ACK',
                        b'SERVE ' + json.dumps(dict(inputs='/changed-inputs', selection=successor)).encode(),
                        b'READY', b'SEALED', clean(successor), b'ACK', b'DONE'])
        forks = []
        def fork():
            # Execute the actual newly defined lexical override without extracting
            # its code. Synthetic parent launch skips all real custody lifecycle.
            classes[-1]().spawn_owner()
            forks.append(100 + len(forks))
            return forks[-1]
        def flock(fd, flags):
            if fd == 11:
                raise BlockingIOError()
        fake_os = SimpleNamespace(getppid=lambda: 70, getpid=lambda: 80,
            pidfd_open=lambda pid: pid + 1000, close=lambda fd: None,
            fstat=lambda fd: SimpleNamespace(st_dev=1, st_ino=1),
            listdir=lambda fd: [], fork=fork)
        fake_fcntl = SimpleNamespace(flock=flock, LOCK_EX=1, LOCK_NB=2)
        with patch.object(m.base, 'Supervisor', RecordingSupervisor), \
             patch.object(m.base, 'private_root', return_value=11), \
             patch.object(m.base, 'fcntl', fake_fcntl), patch.object(m, 'os', fake_os), \
             patch.object(m, 'guard_parent'), patch.object(m, 'pair', return_value=(control, child)), \
             patch.object(m, 'until', side_effect=lambda *args: next(replies)), \
             patch.object(m, 'normal_reap', side_effect=lambda pid, *args: reaps.append(pid)), \
             patch.object(m, 'receive', return_value=b'SEAL'), \
             patch.object(m, 'select', SimpleNamespace(select=lambda *args: ([outer], [], []))), \
             patch.object(m, 'signal', SimpleNamespace(SIGKILL=9,
                 pidfd_send_signal=lambda *args: self.fail('unexpected failure path'))):
            m.run('node', '/root', '/approved-inputs', inception=(10, outer))
        self.assertEqual(len(classes), 1)
        self.assertEqual(calls, [('/approved-inputs', A, I,
            dict(status='UNAVAILABLE', sequence=1, acceptedDigest=A)),
            ('/changed-inputs', B, I, successor)])
        self.assertEqual(reaps, forks)  # Calls to double only; NOT real normal reaps.
        self.assertEqual(outer.sent, [b'SEALING', clean(stopped), b'SERVING', clean(successor)])
        self.assertEqual(list(replies), [])

if __name__ == '__main__':
    unittest.main()
