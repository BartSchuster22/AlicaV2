"""Linux local custodian for an initialized, never-installed Cell.
Trusted development runtime only. No service installation, restart or reconciliation.
The initiating shell may detach this process with start_new_session; no client lifetime
is used as custody. Durable supervision residue always requires operator review.
"""
import fcntl
from decimal import Decimal, DecimalException
import json
import os
from pathlib import Path
import re
import selectors
import signal
import socket
import stat
import struct
import subprocess
import sys
import time
import uuid

R = Path(__file__).resolve().parents[1]
LIMITS = json.loads((R / 'docs/g7/draft/limits.json').read_text())
SCHEMA = json.loads((R / 'docs/g7/draft/contracts.schema.json').read_text())['$defs']
FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def private_root(path):
    if not path.startswith('/') or any(p in ('', '.', '..') for p in path[1:].split('/')):
        raise ValueError('INVALID')
    fd = os.open('/', FLAGS)
    try:
        for part in path[1:].split('/'):
            new = os.open(part, FLAGS, dir_fd=fd)
            os.close(fd)
            fd = new
        s = os.fstat(fd)
        if s.st_uid != os.getuid() or stat.S_IMODE(s.st_mode) != 0o700:
            raise ValueError('DENIED')
        return fd
    except BaseException:
        os.close(fd)
        raise


def decode(data):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('INVALID')
            result[key] = value
        return result
    def invalid(_):
        raise ValueError('INVALID')
    def integer_number(text):
        try:
            number = Decimal(text)
            if not number.is_finite() or number.copy_abs() > 9007199254740991 or number != number.to_integral_value():
                raise ValueError('INVALID')
            return int(number)
        except DecimalException as error:
            raise ValueError('INVALID') from error
    value = json.loads(data.decode('utf-8', 'strict'), object_pairs_hook=pairs,
                       parse_constant=invalid, parse_float=integer_number)
    def bounded(v, depth=0):
        if depth > LIMITS['jsonDepth']:
            raise ValueError('INVALID')
        if isinstance(v, str):
            v.encode('utf-8', 'strict')
        elif type(v) is int and abs(v) > 9007199254740991:
            raise ValueError('INVALID')
        elif isinstance(v, dict):
            for k, item in v.items():
                bounded(k, depth + 1)
                bounded(item, depth + 1)
        elif isinstance(v, list):
            for item in v:
                bounded(item, depth + 1)
    bounded(value)
    return value


def request_valid(v):
    schema = SCHEMA['adminRequest']
    if type(v) is not dict or set(v) != set(schema['required']):
        return False
    for key, rule in schema['properties'].items():
        x = v[key]
        if 'const' in rule and x != rule['const']:
            return False
        if 'enum' in rule and x not in rule['enum']:
            return False
        if rule.get('type') == 'string' and (not isinstance(x, str) or
                not rule['minLength'] <= len(x) <= rule['maxLength'] or
                re.fullmatch(rule['pattern'], x) is None):
            return False
        if rule.get('type') == 'integer' and (type(x) is not int or
                not rule['minimum'] <= x <= rule['maximum']):
            return False
    return True


class Supervisor:
    def __init__(self, node, root, inputs):
        self.root = private_root(root)
        fcntl.flock(self.root, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # mkdir is exclusive. Never unlink a stale socket/marker based on a PID.
        os.mkdir('supervision', 0o700, dir_fd=self.root)
        os.fsync(self.root)
        self.directory = os.open('supervision', FLAGS, dir_fd=self.root)
        self.incarnation = str(uuid.uuid4())
        record = {'incarnation': self.incarnation, 'supervisorPid': os.getpid(),
                  'startMonotonicNs': time.monotonic_ns(),
                  'qualification': 'TRUSTED-DEVELOPMENT-COMPONENT-ONLY'}
        fd = os.open('incarnation.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                     os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=self.directory)
        with os.fdopen(fd, 'wb') as f:
            f.write(json.dumps(record).encode())
            f.flush()
            os.fsync(f.fileno())
        os.fsync(self.directory)
        self.selector = selectors.DefaultSelector()
        self.server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.server.bind('/proc/self/fd/%d/admin.sock' % self.directory)
        os.chmod('admin.sock', 0o600, dir_fd=self.directory, follow_symlinks=False)
        self.server.listen(LIMITS['adminConnections'])
        self.server.setblocking(False)
        self.selector.register(self.server, selectors.EVENT_READ, 'accept')
        self.control, child = socket.socketpair()
        self.owner = subprocess.Popen(
            [node, '--experimental-vm-modules', str(R / 'tools/g7-cell-owner.mjs'),
             root, inputs, str(self.root), str(child.fileno())],
            pass_fds=(self.root, child.fileno()), stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=None, close_fds=True)
        child.close()
        # Exact child remains unreaped until poll(), so PID cannot be recycled here.
        self.pidfd = os.pidfd_open(self.owner.pid)
        self.selector.register(self.pidfd, selectors.EVENT_READ, 'death')
        self.control.setblocking(False)
        self.selector.register(self.control, selectors.EVENT_READ, 'owner')
        self.buffer = b''
        self.clients = {}
        self.pending = None
        self.snapshot = None
        self.stopping = None
        self.uncertain = False
        self.reaped = False
        self.phase = 'verify'
        self.deadline = time.monotonic() + LIMITS['verifyTimeoutMs'] / 1000
        self.saved = None
        self.request_deadline = None
        self.stop_phase_requested = False

    def fail(self):
        if self.uncertain:
            return
        self.uncertain = True
        self.deadline = None
        self.request_deadline = None
        # No claim about descendants, even after waitpid establishes owner death.
        if not self.reaped:
            try:
                signal.pidfd_send_signal(self.pidfd, signal.SIGKILL)
            except ProcessLookupError:
                pass
        if self.snapshot is not None:
            self.snapshot = {**self.snapshot, 'status': 'NEEDS_OPERATOR'}
        self.finish('CLEANUP_UNCERTAIN')

    def close_client(self, client):
        if client in self.clients:
            try:
                self.selector.unregister(client)
            except KeyError:
                pass
            del self.clients[client]
            client.close()
        if self.pending is not None and self.pending[0] is client:
            # Disconnect is NOT cancellation. Keep operation in flight.
            self.pending = (None, self.pending[1])

    def reply(self, client, request, code):
        if client is None or client not in self.clients:
            return
        if self.snapshot is None:
            # Frozen response has no unknown-selection representation. Do not invent
            # sequence=0/null when publication may have occurred. Close fail-closed.
            self.close_client(client)
            return
        value = {'schemaVersion': 'alica.cell-admin-response/v1',
                 'requestId': request['requestId'], 'incarnation': self.incarnation,
                 **self.snapshot, 'code': code}
        if code != 'OK' and not self.reaped:
            # A cached observation is not a new public Kernel liveness report.
            value['status'] = 'NEEDS_OPERATOR'
        payload = json.dumps(value, separators=(',', ':')).encode()
        self.clients[client]['output'] = struct.pack('!I', len(payload)) + payload
        try:
            self.selector.modify(client, selectors.EVENT_WRITE, 'client')
        except KeyError:
            self.selector.register(client, selectors.EVENT_WRITE, 'client')

    def finish(self, code):
        if self.pending:
            client, request = self.pending
            self.pending = None
            self.reply(client, request, code)
        self.request_deadline = None

    def dispatch(self, client, request):
        if request['incarnation'] != self.incarnation:
            self.reply(client, request, 'DENIED')
        elif self.snapshot is None:
            self.close_client(client)
        elif request['expectedSequence'] != self.snapshot['sequence']:
            self.reply(client, request, 'CONFLICT')
        elif request['operation'] not in ('status', 'stop'):
            self.reply(client, request, 'DENIED')
        elif self.uncertain:
            self.reply(client, request, 'CLEANUP_UNCERTAIN')
        elif self.pending or self.phase != 'idle':
            self.reply(client, request, 'CONFLICT')
        elif self.reaped:
            self.reply(client, request, 'OK')
        else:
            self.pending = (client, request)
            if request['operation'] == 'stop':
                # Start before sending to a possibly blocked owner; no reset on ACK.
                self.saved = (self.phase, self.deadline)
                self.phase = 'cleanup'
                self.deadline = time.monotonic() + LIMITS['cleanupTimeoutMs'] / 1000
                self.stop_phase_requested = True
            else:
                self.request_deadline = time.monotonic() + LIMITS['adminTimeoutMs'] / 1000
            self.control.sendall((request['operation'].upper() + '\n').encode())

    def owner_message(self, v):
        if self.uncertain:
            return
        now = time.monotonic()
        if any(d is not None and now >= d for d in (self.deadline, self.request_deadline)):
            self.fail()
            return
        if set(v) == {'phase'}:
            phase = v['phase']
            if phase == 'cleanup' and self.stop_phase_requested:
                self.stop_phase_requested = False
            elif phase == 'cleanup' and self.saved is None:
                self.saved = (self.phase, self.deadline)
                self.phase = phase
                self.deadline = now + LIMITS['cleanupTimeoutMs'] / 1000
            elif phase == 'resume' and self.saved is not None:
                if self.pending and self.pending[1]['operation'] == 'stop':
                    # Keep the outer bound through final status and exact-child reap.
                    self.phase = 'idle'
                else:
                    self.phase, self.deadline = self.saved
                self.saved = None
            elif phase == 'activation' and self.phase == 'verify':
                self.phase = phase
                self.deadline = now + LIMITS['activationTimeoutMs'] / 1000
            else:
                raise ValueError('INVALID')
        elif set(v) == {'snapshot'} and self.phase in ('activation', 'idle'):
            self.snapshot = v['snapshot']
            if self.snapshot['status'] not in ('RUNNING', 'FAILED'):
                raise ValueError('INVALID')
            self.phase, self.deadline = 'idle', None
            self.finish('OK')
        elif set(v) == {'stopped'} and self.phase == 'idle' and self.pending:
            self.stopping = v['stopped']
            if self.stopping['status'] != 'STOPPED' or self.pending[1]['operation'] != 'stop':
                raise ValueError('INVALID')
            # STOPPED only becomes externally visible after exact-child waitpid.
        elif v == {'uncertain': True}:
            self.fail()
            return
        else:
            raise ValueError('INVALID')
        if self.deadline is not None and now >= self.deadline:
            self.fail()
            return
        self.control.sendall(b'ACK\n')

    def run(self):
        while True:
            now = time.monotonic()
            if any(d is not None and now >= d for d in (self.deadline, self.request_deadline)):
                self.fail()
            for client, state in list(self.clients.items()):
                if now >= state['end']:
                    self.close_client(client)
            for key, _ in self.selector.select(0.05):
                kind, obj = key.data, key.fileobj
                if kind == 'death':
                    result = self.owner.poll()  # waitpid on OUR exact child, not PID polling.
                    if result is None:
                        continue
                    self.reaped = True
                    self.selector.unregister(self.pidfd)
                    if result == 0 and self.stopping is not None and not self.uncertain:
                        self.snapshot = self.stopping
                        self.phase, self.deadline = 'idle', None
                        self.finish('OK')
                    else:
                        self.fail()
                elif kind == 'accept':
                    client, _ = self.server.accept()
                    _, uid, _ = struct.unpack('3i', client.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
                    if uid != os.getuid() or len(self.clients) >= LIMITS['adminConnections']:
                        client.close()
                        continue
                    client.setblocking(False)
                    self.clients[client] = {'data': b'', 'output': None,
                                            'end': time.monotonic() + LIMITS['adminTimeoutMs'] / 1000}
                    self.selector.register(client, selectors.EVENT_READ, 'client')
                elif kind == 'owner':
                    try:
                        data = self.control.recv(65536)
                        if not data:
                            self.selector.unregister(self.control)
                            # Await exact-child exit. EOF alone is not a death receipt.
                            if self.stopping is None:
                                self.fail()
                            continue
                        self.buffer += data
                        if len(self.buffer) > LIMITS['jsonBytes']:
                            raise ValueError('INVALID')
                        while b'\n' in self.buffer:
                            line, self.buffer = self.buffer.split(b'\n', 1)
                            self.owner_message(decode(line))
                    except (ValueError, OSError, KeyError, TypeError):
                        self.fail()
                elif isinstance(obj, socket.socket) and obj in self.clients:
                    state = self.clients[obj]
                    try:
                        if state['output'] is not None:
                            n = obj.send(state['output'])
                            state['output'] = state['output'][n:]
                            if not state['output']:
                                self.close_client(obj)
                            continue
                        data = obj.recv(LIMITS['adminFrameBytes'] + 5)
                        state['data'] += data
                        buf = state['data']
                        length = 0
                        if len(buf) >= 4:
                            length = struct.unpack('!I', buf[:4])[0]
                            if not 0 < length <= LIMITS['adminFrameBytes'] or len(buf) > length + 4:
                                raise ValueError('INVALID')
                        # EOF seals the single frame: delayed trailing bytes cannot
                        # execute a stop before being rejected. Client half-closes write.
                        if not data:
                            if len(buf) < 4 or len(buf) != length + 4:
                                raise ValueError('INVALID')
                            request = decode(buf[4:])
                            if not request_valid(request):
                                raise ValueError('INVALID')
                            self.selector.unregister(obj)
                            self.dispatch(obj, request)
                    except (ValueError, OSError, KeyError, TypeError, RecursionError):
                        self.close_client(obj)


if __name__ == '__main__':
    os.umask(0o077)
    if len(sys.argv) == 5 and sys.argv[1] == '--launch':
        child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), *sys.argv[2:]],
                                 stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL, start_new_session=True, close_fds=True)
        # Spawn receipt only; readiness remains the real public Kernel + admin status.
        print(json.dumps({'supervisorPid': child.pid, 'runtime': 'NOT_OBSERVED'}))
    elif len(sys.argv) == 4:
        Supervisor(*sys.argv[1:]).run()
    else:
        raise SystemExit('usage: g7-supervisor.py [--launch] TRUSTED_NODE ABSOLUTE_CELL PRIVATE_INPUTS')
