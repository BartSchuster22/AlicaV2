"""Source regression guards only; NOT native execution, ABI or Case05 proof.
Run: python3 -I -B tests/g7/test_containment_source.py
"""
from pathlib import Path
import ast
import re
import unittest

R = Path(__file__).resolve().parents[2]
C = (R / 'native/g7/ownership.c').read_text()


def function(name):
    match = re.search(r'\b' + name + r'\([^\n]*\) \{', C)
    assert match, name
    start = match.end()
    depth = 1
    for end in range(start, len(C)):
        depth += (C[end] == '{') - (C[end] == '}')
        if not depth:
            return C[start:end]
    raise AssertionError('Unclosed function')


class ContainmentSource(unittest.TestCase):
    def test_exports_and_build_flag(self):
        for name in ['armChildContainment', 'endChildContainment']:
            self.assertIn('napi_set_named_property(env, exports, "' + name + '", fn)', C)
        tree = ast.parse((R / 'tools/build-g7-native.py').read_text())
        command = next(n.value for n in tree.body if isinstance(n, ast.Assign)
                       and any(isinstance(t, ast.Name) and t.id == 'command' for t in n.targets))
        self.assertEqual(sum(isinstance(n, ast.Constant) and n.value == '-pthread'
                             for n in command.elts), 1)

    def test_failed_thread_creation_retains_finalizer_ownership(self):
        arm = function('arm_containment')
        failure = arm.split('if (pthread_create(&g->thread, NULL, contain_child, g)) {')[1].split('\n  }')[0]
        self.assertIn('close(g->child); close(g->stop); g->active = 0;', failure)
        self.assertIn('return NULL;', failure)
        for unsafe in ['napi_remove_wrap(', 'free(g)', 'goto fail']:
            self.assertNotIn(unsafe, failure)
        self.assertIn('if (!g->active) free(g);', function('containment_gc'))

    def test_descriptors_and_gc_do_not_disarm(self):
        arm = function('arm_containment')
        self.assertIn('fcntl(fd, F_DUPFD_CLOEXEC, 3)', arm)
        self.assertIn('eventfd(0, EFD_CLOEXEC | EFD_NONBLOCK)', arm)
        gc = function('containment_gc')
        for unsafe in ['write(', 'close(', 'pthread_join(', 'kill(']:
            self.assertNotIn(unsafe, gc)

    def test_death_precedence_and_fail_closed(self):
        watch = function('contain_child')
        self.assertIn('!fds[0].revents && fds[1].revents == POLLIN', watch)
        self.assertIn('poll(&child, 1, 0)', watch)
        self.assertIn('if (n == 0) return NULL;', watch)
        self.assertEqual(watch.count('errno == EINTR'), 2)
        self.assertIn('kill(getpid(), SIGKILL);', watch)
        self.assertIn('_exit(127);', watch)
        for authority in ['waitpid(', 'waitid(', 'flock(', 'napi_call_function(']:
            self.assertNotIn(authority, watch)

    def test_release_joins_before_closing(self):
        release = function('end_containment')
        self.assertIn('!tagged', release)
        self.assertIn('!g->active', release)
        self.assertLess(release.index('pthread_join('), release.index('close(g->child)'))
        self.assertIn('kill(getpid(), SIGKILL); _exit(127);', release)


if __name__ == '__main__':
    unittest.main(verbosity=2)
