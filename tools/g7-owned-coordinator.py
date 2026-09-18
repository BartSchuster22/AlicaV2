"""CLI-owned lifecycle, never a detached-custodian adoption API.

Only run() creates the fork/channel/lock relationship. No supplied fd, PID,
clean flag, socket path or persisted receipt can construct an owned lifecycle.
The first offline action is read-only stopped release verification, NOT reinstall.
Supervision residue is deliberately never retired, even on success.
"""
import ctypes
import importlib.util
import json
import os
from pathlib import Path
import select
import signal
import socket
import struct
import subprocess
import sys
import time

R = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('g7_supervisor', R / 'tools/g7-supervisor.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
LIMITS = base.LIMITS


def guard_parent(expected):
    # Linux kills even a child blocked in synchronous userspace IO on parent loss.
    # An uninterruptible syscall is not thereby undone or certified complete.
    if expected <= 1 or os.getppid() != expected:
        raise RuntimeError('parent unavailable')
    if ctypes.CDLL(None, use_errno=True).prctl(1, signal.SIGKILL, 0, 0, 0):
        raise OSError(ctypes.get_errno(), 'parent guard')
    if os.getppid() != expected:
        raise RuntimeError('parent lost')


def pair():
    a, b = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
    for s in (a, b):
        s.setsockopt(socket.SOL_SOCKET, socket.SO_PASSCRED, 1)
        s.setblocking(False)
    return a, b


def receive(channel, expected):
    # SO_PEERCRED on a pre-fork pair identifies its creator, NOT the child.
    # Per-message SCM_CREDENTIALS binds every receipt to the actual exact child.
    data, ancillary, flags, _ = channel.recvmsg(LIMITS['adminFrameBytes'], socket.CMSG_SPACE(12))
    if flags or not data or len(ancillary) != 1:
        raise RuntimeError('channel unavailable')
    level, kind, credentials = ancillary[0]
    if (level, kind) != (socket.SOL_SOCKET, socket.SCM_CREDENTIALS) or len(credentials) != 12:
        raise RuntimeError('unauthenticated channel')
    pid, uid, gid = struct.unpack('3i', credentials)
    if pid != expected or uid != os.getuid() or gid != os.getgid():
        raise RuntimeError('unowned sender')
    return data


def send(channel, data):
    if channel.send(data) != len(data):
        raise RuntimeError('incomplete packet')


def until(channel, child_pid, pidfd, end):
    while True:
        remaining = end - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('custody deadline')
        readable, _, _ = select.select([channel, pidfd], [], [], remaining)
        if time.monotonic() >= end:
            raise TimeoutError('late custody receipt')
        if channel in readable:
            packet = receive(channel, child_pid)
            if time.monotonic() >= end:
                raise TimeoutError('late authenticated receipt')
            return packet
        if pidfd in readable:
            raise RuntimeError('child died without receipt')


def normal_reap(pid, pidfd, end):
    if not select.select([pidfd], [], [], max(0, end - time.monotonic()))[0]:
        raise TimeoutError('reap deadline')
    if time.monotonic() >= end:
        raise TimeoutError('late reap')
    actual, status = os.waitpid(pid, os.WNOHANG)
    if time.monotonic() >= end:
        raise TimeoutError('late exact waitpid result')
    if actual != pid or not os.WIFEXITED(status) or os.WEXITSTATUS(status) != 0:
        raise RuntimeError('not a normal exact child reap')


def run(node, root, inputs):
    parent = os.getppid()
    parent_fd = os.pidfd_open(parent)
    guard_parent(parent)
    held = base.private_root(root)
    base.fcntl.flock(held, base.fcntl.LOCK_EX | base.fcntl.LOCK_NB)
    # No adopting an arbitrary detached supervisor, even if it is already stopped.
    if 'supervision' in os.listdir(held):
        raise RuntimeError('existing custody is not owned')
    control, child_control = pair()
    creator = os.getpid()

    # The subclass/captured authority is minted here, not from CLI/API fd inputs.
    class OwnedCustodian(base.Supervisor):
        def acquire_root(self, path):
            if os.getppid() != creator:
                raise RuntimeError('not owned from inception')
            checked = base.private_root(path)
            try:
                if (os.fstat(checked).st_dev, os.fstat(checked).st_ino) != (os.fstat(held).st_dev, os.fstat(held).st_ino):
                    raise RuntimeError('root changed')
                try:
                    base.fcntl.flock(checked, base.fcntl.LOCK_EX | base.fcntl.LOCK_NB)
                except BlockingIOError:
                    pass
                else:
                    raise RuntimeError('custody lost')
            finally:
                os.close(checked)
            base.fcntl.flock(held, base.fcntl.LOCK_EX | base.fcntl.LOCK_NB)
            return held

        def __init__(self):
            self.sealed = False
            self.ready_sent = False
            self.seal_end = None
            self.failed_sent = False
            super().__init__(node, root, inputs)

        def dispatch(self, client, request):
            if self.sealed:
                self.reply(client, request, 'DENIED')
            else:
                super().dispatch(client, request)

        def lifecycle_tick(self):
            now = time.monotonic()
            if any(d is not None and now >= d for d in (self.deadline, self.request_deadline, self.seal_end)):
                self.fail()
            if self.uncertain:
                # No clean receipt or normal exit. Keep the lock until parent loss.
                if not self.failed_sent:
                    send(child_control, b'UNCERTAIN')
                    self.failed_sent = True
                return False
            try:
                message = receive(child_control, creator)
            except BlockingIOError:
                message = None
            if message is not None:
                if message != b'SEAL' or self.sealed or not self.ready_sent:
                    self.fail()
                    return False
                self.sealed = True
                self.seal_end = now + LIMITS['cleanupTimeoutMs'] / 1000
                # Seal ALL admission, including accepted/unsealed v1/v2 requests.
                # This is not an admin stop semantic change.
                for server in self.servers:
                    self.selector.unregister(server)
                    server.close()
                for client in list(self.clients):
                    self.close_client(client)
                send(child_control, b'SEALED')
            if self.sealed:
                if self.clean_start and self.reaped and self.stopping is not None and self.snapshot == self.stopping:
                    if time.monotonic() >= self.seal_end:
                        self.fail()
                        return False
                    self.clean_start = False
                    send(child_control, b'CLEAN ' + json.dumps(self.stopping, separators=(',', ':')).encode())
                    return True
                if self.pending is None and self.phase == 'idle' and not self.reaped:
                    super().dispatch(None, {'incarnation': self.incarnation,
                                           'expectedSequence': self.snapshot['sequence'],
                                           'operation': 'stop'})
            elif not self.ready_sent and self.snapshot is not None and self.phase == 'idle':
                send(child_control, b'READY')
                self.ready_sent = True
            return False

    pid = os.fork()
    if pid == 0:
        try:
            control.close()
            os.close(parent_fd)
            guard_parent(creator)
            # Parent holds a pidfd before allowing any Cell effects.
            if until(child_control, creator, os.pidfd_open(creator),
                     time.monotonic() + LIMITS['adminTimeoutMs'] / 1000) != b'GO':
                raise RuntimeError('invalid inception')
            OwnedCustodian().run()
            os._exit(0)
        except BaseException:
            os._exit(1)
    child_control.close()
    pidfd = os.pidfd_open(pid)  # Unreaped exact child cannot have its PID recycled.
    try:
        inception_end = time.monotonic() + LIMITS['verifyTimeoutMs'] / 1000
        send(control, b'GO')
        if until(control, pid, pidfd, inception_end) != b'READY':
            raise RuntimeError('not ready')
        end = time.monotonic() + LIMITS['cleanupTimeoutMs'] / 1000
        send(control, b'SEAL')
        if until(control, pid, pidfd, end) != b'SEALED':
            raise RuntimeError('not sealed')
        result = until(control, pid, pidfd, end)
        if not result.startswith(b'CLEAN '):
            raise RuntimeError('not clean')
        stopped = base.decode(result[6:])
        if set(stopped) != {'status', 'sequence', 'acceptedDigest'} or stopped['status'] != 'STOPPED':
            raise RuntimeError('invalid clean receipt')
        normal_reap(pid, pidfd, end)
        # Custodian plus its actual prior owner are now normally reaped. This
        # lexical path alone reaches maintenance; no serialized clean flag API.
        verification = maintenance(node, root, inputs, held)
        if (set(verification) != {'sequence', 'acceptedDigest', 'release'} or
                any(verification[k] != stopped[k] for k in ('sequence', 'acceptedDigest'))):
            raise RuntimeError('selection changed')
        print(json.dumps({'operation': 'verify-stopped', 'status': 'STOPPED',
                          'verification': verification, 'fence': 'RETAINED'}), flush=True)
    except BaseException:
        # Sticky uncertainty, including setup, blocked IO, invalid/late receipts.
        # Killing OUR child is containment only, never a cleanup certificate.
        try:
            signal.pidfd_send_signal(pidfd, signal.SIGKILL)
        except ProcessLookupError:
            pass
        print(json.dumps({'status': 'NEEDS_OPERATOR', 'fence': 'RETAINED'}), flush=True)
        while True:
            select.select([parent_fd], [], [])
    finally:
        control.close()
        os.close(pidfd)
        os.close(held)
        os.close(parent_fd)


def maintenance(node, root, inputs, held):
    # Read-only worker. It has no clean/reinstall permission and cannot retire a
    # fence. The coordinator alone can certify the stopped maintenance result.
    end = time.monotonic() + LIMITS['verifyTimeoutMs'] / 1000
    control, child = socket.socketpair()
    worker = subprocess.Popen([node, '--experimental-vm-modules',
                               str(R / 'tools/g7-stopped-verify.mjs'), root, inputs,
                               str(held), str(child.fileno())],
                              pass_fds=(held, child.fileno()), stdin=subprocess.DEVNULL,
                              stdout=subprocess.PIPE, stderr=None, close_fds=True)
    child.close()
    pidfd = os.pidfd_open(worker.pid)
    data = b''
    os.set_blocking(worker.stdout.fileno(), False)
    try:
        while True:
            remaining = end - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('verification deadline')
            readable, _, _ = select.select([worker.stdout, pidfd], [], [], remaining)
            if time.monotonic() >= end:
                raise TimeoutError('late verification')
            if worker.stdout in readable:
                chunk = os.read(worker.stdout.fileno(), LIMITS['jsonBytes'] + 1)
                data += chunk
                if len(data) > LIMITS['jsonBytes']:
                    raise RuntimeError('oversized verification')
                if not chunk:
                    break
        normal_reap(worker.pid, pidfd, end)
        worker.returncode = 0
        result = base.decode(data)
        if time.monotonic() >= end:
            raise TimeoutError('late decoded verification')
        return result
    except BaseException:
        try:
            signal.pidfd_send_signal(pidfd, signal.SIGKILL)
        except ProcessLookupError:
            pass
        raise
    finally:
        worker.stdout.close()
        control.close()
        os.close(pidfd)


if __name__ == '__main__':
    os.umask(0o077)
    if len(sys.argv) != 5 or sys.argv[1] != 'run-verify-stopped':
        raise SystemExit('usage: g7-owned-coordinator.py run-verify-stopped TRUSTED_NODE ABSOLUTE_INITIALIZED_CELL PRIVATE_INPUTS')
    run(*sys.argv[2:])
