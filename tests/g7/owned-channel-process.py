"""Real Unix process/credential/pidfd negative qualification."""
import importlib.util
import os
import select
from pathlib import Path
import signal
import socket
import time
import unittest

spec = importlib.util.spec_from_file_location('owned', Path(__file__).resolve().parents[2] / 'tools/g7-owned-coordinator.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


from unittest.mock import patch


class Channels(unittest.TestCase):
    def test_actual_guarded_parent_death_contains_child_with_held_pidfd(self):
        reader, writer = os.pipe()
        creator = os.getpid()
        parent = os.fork()
        if parent == 0:
            os.close(reader)
            m.guard_parent(creator)
            ready_read, ready_write = os.pipe()
            child = os.fork()
            if child == 0:
                os.close(writer)
                os.close(ready_read)
                m.guard_parent(os.getppid())
                os.write(ready_write, b'R')
                os.close(ready_write)
                signal.pause()
                os._exit(2)
            os.close(ready_write)
            if os.read(ready_read, 1) != b'R':
                os._exit(2)
            os.close(ready_read)
            os.write(writer, str(child).encode())
            os.close(writer)
            signal.pause()
            os._exit(2)
        os.close(writer)
        parent_fd = os.pidfd_open(parent)
        child_fd = None
        try:
            self.assertTrue(select.select([reader], [], [], 2)[0])
            child_fd = os.pidfd_open(int(os.read(reader, 64)))
            signal.pidfd_send_signal(parent_fd, signal.SIGKILL)
            self.assertTrue(select.select([child_fd], [], [], 2)[0])
            # Exit-readiness proves containment, never normal-reap authority.
        finally:
            try:
                signal.pidfd_send_signal(parent_fd, signal.SIGKILL)
            except ProcessLookupError:
                pass
            os.waitpid(parent, 0)
            os.close(parent_fd)
            os.close(reader)
            if child_fd is not None:
                try:
                    signal.pidfd_send_signal(child_fd, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                os.close(child_fd)

    def test_syscall_return_late_normal_reap_is_not_permission(self):
        pid = os.fork()
        if pid == 0:
            os._exit(0)
        fd = os.pidfd_open(pid)
        select.select([fd], [], [], 2)
        original = m.os.waitpid
        def delayed(*args):
            result = original(*args)
            time.sleep(0.03)
            return result
        try:
            with patch.object(m.os, 'waitpid', delayed):
                with self.assertRaises(TimeoutError):
                    m.normal_reap(pid, fd, time.monotonic() + 0.01)
        finally:
            os.close(fd)
            try:
                os.waitpid(pid, 0)
            except ChildProcessError:
                pass

    def test_authenticated_receive_return_late_is_not_permission(self):
        parent, child = m.pair()
        pid = os.fork()
        if pid == 0:
            parent.close()
            m.send(child, b'CLEAN')
            time.sleep(0.1)
            os._exit(0)
        child.close()
        fd = os.pidfd_open(pid)
        select.select([parent], [], [], 2)
        original = m.receive
        def delayed(*args):
            result = original(*args)
            time.sleep(0.03)
            return result
        try:
            with patch.object(m, 'receive', delayed):
                with self.assertRaises(TimeoutError):
                    m.until(parent, pid, fd, time.monotonic() + 0.01)
        finally:
            os.waitpid(pid, 0)
            os.close(fd)
            parent.close()
    def test_real_child_credentials_and_held_pidfd_normal_reap(self):
        parent, child = m.pair()
        pid = os.fork()
        if pid == 0:
            parent.close()
            m.send(child, b'CHILD')
            os._exit(0)
        child.close()
        pidfd = os.pidfd_open(pid)
        try:
            self.assertEqual(m.until(parent, pid, pidfd, time.monotonic() + 2), b'CHILD')
            m.normal_reap(pid, pidfd, time.monotonic() + 2)
            with self.assertRaises(ChildProcessError):
                m.normal_reap(pid, pidfd, time.monotonic() + 2)
        finally:
            os.close(pidfd)
            parent.close()

    def test_socketpair_creator_is_not_actual_child_credential(self):
        a, b = m.pair()
        pid = os.fork()
        if pid == 0:
            os._exit(0)
        pidfd = os.pidfd_open(pid)
        try:
            # Even with both genuine inherited endpoints, a same-UID parent
            # writing a forged child receipt has its OWN actual SCM credentials.
            m.send(b, b'CLEAN {}')
            with self.assertRaisesRegex(RuntimeError, 'unowned sender'):
                m.receive(a, pid)
        finally:
            os.waitpid(pid, 0)
            os.close(pidfd)
            a.close()
            b.close()

    def test_plain_inherited_stream_fd_and_closed_channel_are_not_credentials(self):
        a, b = socket.socketpair()
        b.sendall(b'CLEAN {}')
        with self.assertRaises(RuntimeError):
            m.receive(a, os.getpid())
        b.close()
        with self.assertRaises(RuntimeError):
            m.receive(a, os.getpid())
        a.close()

    def test_forced_child_exit_is_never_normal_reap(self):
        pid = os.fork()
        if pid == 0:
            signal.pause()
            os._exit(0)
        pidfd = os.pidfd_open(pid)
        signal.pidfd_send_signal(pidfd, signal.SIGKILL)
        try:
            with self.assertRaisesRegex(RuntimeError, 'not a normal'):
                m.normal_reap(pid, pidfd, time.monotonic() + 2)
        finally:
            os.close(pidfd)

    def test_late_real_normal_exit_is_not_a_reap_permit(self):
        pid = os.fork()
        if pid == 0:
            os._exit(0)
        pidfd = os.pidfd_open(pid)
        try:
            with self.assertRaises(TimeoutError):
                m.normal_reap(pid, pidfd, time.monotonic() - 1)
        finally:
            os.waitpid(pid, 0)
            os.close(pidfd)

    def test_non_parent_guard_is_rejected(self):
        with self.assertRaises(RuntimeError):
            m.guard_parent(os.getpid())


if __name__ == '__main__':
    unittest.main()
