"""Only temporary mock ledgers: never touches or renews the live grant."""
import concurrent.futures
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from request_budget import initialize, consume, BudgetDenied, DispatchGuard


def reserve(path):
    try:
        return consume(path)
    except BudgetDenied:
        return None


class BudgetTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'mock-budget.sqlite'

    def used(self):
        with closing(sqlite3.connect(self.path)) as db, db:
            return db.execute('SELECT used FROM grant_state').fetchone()[0]

    def test_initialization_closes_connection_on_success_and_failure(self):
        from unittest.mock import patch
        opened = []
        class TrackedConnection(sqlite3.Connection):
            closed = False
            def close(self):
                self.closed = True
                return super().close()
        real_connect = sqlite3.connect
        def connect(*args, **kwargs):
            db = real_connect(*args, factory=TrackedConnection, **kwargs)
            opened.append(db)
            return db
        with patch('request_budget.sqlite3.connect', side_effect=connect):
            initialize(self.path)
        self.assertTrue(opened[-1].closed)
        failed_path = self.path.with_name('failed.sqlite')
        with patch('request_budget.sqlite3.connect', side_effect=connect), \
                patch('request_budget.GRANT', None):
            with self.assertRaises(sqlite3.IntegrityError):
                initialize(failed_path)
        self.assertTrue(opened[-1].closed)
        with self.assertRaises(FileExistsError):
            initialize(failed_path)
        with self.assertRaises(BudgetDenied):
            consume(failed_path)

    def test_missing_and_corrupt_fail_closed(self):
        with self.assertRaises(BudgetDenied):
            consume(self.path)
        self.assertFalse(self.path.exists())
        self.path.write_bytes(b'corrupt')
        with self.assertRaises(BudgetDenied):
            consume(self.path)

    def test_no_reinitialize_and_restarts_keep_cap(self):
        initialize(self.path)
        self.assertEqual(os.stat(self.path).st_mode & 0o777, 0o600)
        self.assertEqual(consume(self.path), 1)
        with self.assertRaises(FileExistsError):
            initialize(self.path)
        with concurrent.futures.ProcessPoolExecutor(max_workers=1) as pool:
            self.assertEqual(pool.submit(reserve, self.path).result(), 2)
        self.assertEqual(consume(self.path), 3)
        with self.assertRaises(BudgetDenied):
            consume(self.path)
        self.assertEqual(self.used(), 3)

    def test_concurrent_processes_never_overspend(self):
        initialize(self.path)
        with concurrent.futures.ProcessPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(reserve, [self.path] * 16))
        self.assertEqual(sorted(x for x in results if x is not None), [1, 2, 3])
        self.assertEqual(self.used(), 3)

    def test_commit_precedes_wire_and_failure_not_refunded_or_retried(self):
        initialize(self.path)
        calls = []
        def wire(**kw):
            calls.append(kw)
            self.assertEqual(self.used(), 1)
            raise RuntimeError('mock transport failure')
        guard = DispatchGuard(self.path, wire)
        with self.assertRaises(RuntimeError):
            guard(model='gpt-5.6-sol')
        with self.assertRaises(BudgetDenied):
            guard(model='gpt-5.6-sol')
        self.assertEqual(len(calls), 1)
        self.assertEqual(self.used(), 1)

    def test_fixed_model_no_unsupported_token_parameters_and_followups(self):
        initialize(self.path)
        calls = []
        guard = DispatchGuard(self.path, lambda **kw: calls.append(kw) or 'ok')
        for kw in ({'model': 'other'}, *({'model': 'gpt-5.6-sol', key: 7}
                   for key in ('max_tokens', 'max_completion_tokens', 'max_output_tokens'))):
            with self.assertRaises(BudgetDenied):
                guard(**kw)
        self.assertEqual(self.used(), 0)
        for _ in range(3):
            self.assertEqual(guard(model='gpt-5.6-sol'), 'ok')
        with self.assertRaises(BudgetDenied):
            guard(model='gpt-5.6-sol')
        self.assertTrue(all('max_output_tokens' not in x for x in calls))

    def test_wrong_grant_fails_closed(self):
        initialize(self.path)
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("UPDATE grant_state SET grant_id='wrong'")
        with self.assertRaises(BudgetDenied):
            consume(self.path)
        self.assertEqual(self.used(), 0)


if __name__ == '__main__':
    unittest.main()
