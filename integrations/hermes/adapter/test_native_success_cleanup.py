"""Run the existing real-native success assertions, then inspect after exit."""
import contextlib
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest

CANARIES = (b'offline-test-not-a-secret', b'SYNTHETIC_DEBUG_CANARY_not_a_credential')


def child(root):
    import test_native_runtime as runtime
    # Keep the request root alive through interpreter atexit. Only this test's
    # tempfile reference is replaced; upstream and stdlib behavior is unchanged.
    runtime.tempfile = SimpleNamespace(TemporaryDirectory=lambda **kw: contextlib.nullcontext(root))
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(runtime.NativeRuntime)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        raise SystemExit(1)


class NativeSuccessCleanup(unittest.TestCase):
    def test_success_artifacts_and_parent_cleanup(self):
        root = Path(tempfile.mkdtemp(prefix='phase3-native-success-parent-'))
        try:
            run = subprocess.run([sys.executable, str(Path(__file__).resolve()),
                                  '--child', str(root)], capture_output=True,
                                 env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'), timeout=120)
            output = run.stdout + run.stderr
            for canary in CANARIES:
                self.assertNotIn(canary, output, 'synthetic credential/debug canary in output')
            self.assertEqual(run.returncode, 0, output.decode(errors='replace')[-3000:])
            self.assertIn(b'fixture dispatch and inline/normal denials verified', output)
            for path in root.rglob('*'):
                if path.is_file():
                    data = path.read_bytes()
                    for canary in CANARIES:
                        self.assertNotIn(canary, data, 'synthetic canary in child artifact')
            self.assertEqual(list(root.rglob('request_dump_*.json')), [])
            with sqlite3.connect(root / 'offline-test-ledger.sqlite') as db:
                self.assertEqual(db.execute('SELECT used FROM grant_state').fetchone(), (2,))
        finally:
            shutil.rmtree(root)
            self.assertFalse(root.exists())
        print('PASS native/success: existing real loop assertions, two MOCK sends, post-exit artifact scan, parent cleanup')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--child':
        child(sys.argv[2])
    else:
        unittest.main(verbosity=2)
