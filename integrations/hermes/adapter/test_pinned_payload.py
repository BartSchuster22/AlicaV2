"""Offline compatibility with the actual pinned Hermes transform helper.

HERMES_PHASE3_SOURCE points to the external pinned checkout (or inspected source
bundle locally). This is NOT an AIAgent/DEV/live-inference certification.
"""
import importlib.util
import os
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from types import SimpleNamespace as NS

from guarded_responses import GuardedResponses
from request_budget import BudgetDenied, initialize


class PinnedPayloadTests(unittest.TestCase):
    def setUp(self):
        root = Path(os.environ['HERMES_PHASE3_SOURCE'])
        spec = importlib.util.spec_from_file_location(
            'phase3_pinned_sdk_transform', root / 'agent/sdk_transform_bypass.py')
        self.upstream = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.upstream)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.ledger = Path(self.tmp.name) / 'offline.sqlite'
        initialize(self.ledger)
        self.calls = []
        self.client = NS(max_retries=0, base_url='https://example.invalid',
                         responses=NS(create=self.send), close=lambda: None)
        self.boundary = GuardedResponses(self.client, self.ledger,
                                        deadline=121, clock=lambda: 1)
        self.addCleanup(self.boundary.close)

    def send(self, **kwargs):
        self.calls.append(kwargs)
        class Stream:
            def __iter__(self):
                return iter([NS(type='response.completed', response=NS(status='completed'))])
            def close(self):
                pass
        return Stream()

    def used(self):
        with closing(sqlite3.connect(self.ledger)) as db:
            return db.execute('SELECT used FROM grant_state').fetchone()[0]

    def test_real_pinned_transform_payload_preserved_without_unsupported_cap(self):
        request = dict(model='gpt-5.6-sol', stream=True,
                       input=[{'role': 'user', 'content': 'offline fixture'}],
                       tools=[{'type': 'function', 'name': 'phase3_fixture'}])
        transformed = self.upstream.bypass_sdk_request_transform(request)
        self.assertIn('extra_body', transformed)
        with self.boundary.create(**transformed) as stream:
            list(stream)
        self.assertEqual(self.calls[0]['input'], request['input'])
        self.assertEqual(self.calls[0]['tools'], request['tools'])
        self.assertNotIn('extra_body', self.calls[0])
        self.assertNotIn('max_output_tokens', self.calls[0])
        self.assertEqual(self.used(), 1)

    def test_bulk_collision_rejected_before_reservation(self):
        with self.assertRaises(BudgetDenied):
            self.boundary.create(model='gpt-5.6-sol', stream=True,
                                 input=[], extra_body={'input': []})
        self.assertEqual(self.used(), 0)

    def test_bulk_token_override_rejected_before_reservation(self):
        with self.assertRaises(BudgetDenied):
            self.boundary.create(model='gpt-5.6-sol', stream=True,
                                 extra_body={'input': [], 'max_output_tokens': 9999})
        self.assertEqual(self.used(), 0)

    def test_bulk_wrong_shape_rejected_before_reservation(self):
        with self.assertRaises(BudgetDenied):
            self.boundary.create(model='gpt-5.6-sol', stream=True,
                                 extra_body={'tools': 'not a tool list'})
        self.assertEqual(self.used(), 0)


if __name__ == '__main__':
    unittest.main()
