"""Disposable MOCK state only. Never touches ORIGINAL_DIRECTORY."""
from contextlib import closing
import concurrent.futures
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from live_authority import ATTEMPT_NAME, LEDGER_NAME, claim_original_attempt, inspect_original
from request_budget import BudgetDenied, consume, initialize


class LiveAuthorityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='phase3-mock-live-policy-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.ledger = self.root / LEDGER_NAME

    def provision_mock(self):
        initialize(self.ledger)

    def test_missing_never_initializes(self):
        with self.assertRaises(BudgetDenied):
            claim_original_attempt(self.root)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_claim_never_consumes_and_followups_share_budget(self):
        self.provision_mock()
        self.assertEqual(claim_original_attempt(self.root), self.ledger)
        self.assertEqual([consume(self.ledger) for _ in range(3)], [1, 2, 3])
        with self.assertRaises(BudgetDenied):
            consume(self.ledger)
        with self.assertRaises(BudgetDenied):
            claim_original_attempt(self.root)

    def test_claim_blocks_restart_even_without_dispatch(self):
        self.provision_mock()
        claim_original_attempt(self.root)
        with self.assertRaises(BudgetDenied):
            claim_original_attempt(self.root)

    def test_previous_consumption_blocks_new_attempt(self):
        self.provision_mock()
        consume(self.ledger)
        with self.assertRaises(BudgetDenied):
            claim_original_attempt(self.root)
        self.assertFalse((self.root / ATTEMPT_NAME).exists())

    def test_conflicting_identity(self):
        self.provision_mock()
        with closing(sqlite3.connect(self.ledger)) as db, db:
            db.execute("UPDATE grant_state SET grant_id='conflicting-grant'")
        with self.assertRaises(BudgetDenied):
            inspect_original(self.root)

    def test_corrupt_ledger(self):
        self.ledger.write_bytes(b'not sqlite')
        self.ledger.chmod(0o600)
        with self.assertRaises(BudgetDenied):
            inspect_original(self.root)
        self.assertEqual(self.ledger.read_bytes(), b'not sqlite')

    def test_insecure_modes(self):
        self.provision_mock()
        self.ledger.chmod(0o644)
        with self.assertRaises(BudgetDenied):
            inspect_original(self.root)
        self.ledger.chmod(0o600)
        self.root.chmod(0o755)
        with self.assertRaises(BudgetDenied):
            inspect_original(self.root)

    def test_symlink_and_hardlink(self):
        self.provision_mock()
        alias = self.root / 'alias'
        os.link(self.ledger, alias)
        with self.assertRaises(BudgetDenied):
            inspect_original(self.root)
        alias.unlink()
        saved = self.root / 'saved'
        self.ledger.rename(saved)
        self.ledger.symlink_to(saved)
        with self.assertRaises(BudgetDenied):
            inspect_original(self.root)

    def test_dangling_attempt_marker_blocks(self):
        self.provision_mock()
        (self.root / ATTEMPT_NAME).symlink_to(self.root / 'absent')
        with self.assertRaises(BudgetDenied):
            claim_original_attempt(self.root)

    def test_exclusive_claim_race(self):
        self.provision_mock()
        def claim(_):
            try:
                claim_original_attempt(self.root)
                return True
            except BudgetDenied:
                return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            self.assertEqual(sum(pool.map(claim, range(8))), 1)

    def test_durability_failure_never_reopens(self):
        self.provision_mock()
        with patch('live_authority.os.fsync', side_effect=OSError('simulated')):
            with self.assertRaises(BudgetDenied):
                claim_original_attempt(self.root)
        self.assertTrue((self.root / ATTEMPT_NAME).exists())
        with self.assertRaises(BudgetDenied):
            claim_original_attempt(self.root)


if __name__ == '__main__':
    unittest.main()
