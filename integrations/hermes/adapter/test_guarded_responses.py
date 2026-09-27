"""Offline boundary tests, NOT AIAgent/H12 acceptance."""
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from types import SimpleNamespace as NS

from guarded_responses import GuardedResponses
from request_budget import BudgetDenied, initialize

DONE = NS(type='response.completed', response=NS(status='completed'))


class Raw:
    def __init__(self, events):
        self.events = iter(events)
        self.closed = False

    def __iter__(self):
        return self

    def __next__(self):
        event = next(self.events)
        if isinstance(event, BaseException):
            raise event
        return event

    def close(self):
        self.closed = True


class BoundaryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.ledger = Path(self.tmp.name) / 'grant.sqlite'
        initialize(self.ledger)
        self.calls = []
        self.events = [DONE]
        self.failure = None
        self.now = 1
        self.sdk = NS(max_retries=0, base_url='https://example.invalid',
                      responses=NS(create=self.send), close=lambda: None)
        self.boundary = GuardedResponses(self.sdk, self.ledger,
                                        deadline=121, clock=lambda: self.now)
        self.addCleanup(self.boundary.close)

    def used(self):
        with closing(sqlite3.connect(self.ledger)) as db:
            return db.execute('SELECT used FROM grant_state').fetchone()[0]

    def send(self, **kwargs):
        # Real persistent reservation must precede even this fake wire.
        self.assertEqual(self.used(), len(self.calls) + 1)
        self.calls.append(kwargs)
        if self.failure:
            raise self.failure
        return Raw(self.events)

    def create(self, **kwargs):
        return self.boundary.responses.create(model='gpt-5.6-sol', stream=True, **kwargs)

    def test_pinned_correlation_headers_stripped(self):
        with self.create(extra_headers={'session_id': 'offline',
                                        'x-client-request-id': 'offline'}) as stream:
            list(stream)
        self.assertNotIn('extra_headers', self.calls[0])

    def test_authorization_header_denied(self):
        with self.assertRaises(BudgetDenied):
            self.create(extra_headers={'Authorization': 'not-a-secret'})
        self.assertEqual(self.used(), 0)

    def test_correlation_header_newline_denied(self):
        with self.assertRaises(BudgetDenied):
            self.create(extra_headers={'session_id': 'bad\nheader'})
        self.assertEqual(self.used(), 0)

    def test_configured_timeout_can_only_shorten_deadline(self):
        with self.create(timeout=10) as stream:
            list(stream)
        self.assertEqual(self.calls[0]['timeout'], 10)

    def test_each_dispatch_clamps_to_remaining_deadline(self):
        with self.create(timeout=120) as stream:
            list(stream)
        self.now = 101
        with self.create(timeout=120) as stream:
            list(stream)
        self.assertEqual([c['timeout'] for c in self.calls], [120, 20])

    def test_oversized_timeout_still_denied(self):
        with self.assertRaises(BudgetDenied):
            self.create(timeout=1800.0)
        self.assertEqual(self.used(), 0)

    def test_transport_secret_not_in_formatted_exception(self):
        import traceback
        marker = 'SYNTHETIC_SECRET_CANARY_not_a_credential'
        self.failure = ConnectionError(marker)
        try:
            self.create()
        except BudgetDenied:
            self.assertNotIn(marker, traceback.format_exc())
        else:
            self.fail('transport failure was not rejected')
        self.assertTrue(self.boundary._guard.poisoned)

    def test_followups_share_durable_cap(self):
        for _ in range(3):
            with self.create() as stream:
                self.assertEqual(list(stream), [DONE])
        with self.assertRaises(BudgetDenied):
            self.create()
        self.assertEqual(len(self.calls), 3)
        self.assertTrue(all('max_output_tokens' not in c for c in self.calls))
        self.assertTrue(all(c['timeout'] == 120 for c in self.calls))

    def test_unsupported_output_cap_rejected_before_wire(self):
        with self.assertRaises(BudgetDenied):
            self.create(max_output_tokens=1024)
        self.assertEqual((len(self.calls), self.used()), (0, 0))

    def test_send_failure_poison_blocks_upstream_retry(self):
        self.failure = ConnectionError('offline')
        with self.assertRaises(BudgetDenied):
            self.create()
        with self.assertRaises(BudgetDenied):
            self.create()
        self.assertEqual((len(self.calls), self.used()), (1, 1))

    def test_lazy_failure_poison_blocks_upstream_retry(self):
        self.events = [NS(type='response.created'), ConnectionError('offline')]
        with self.create() as stream:
            next(stream)
            with self.assertRaises(BudgetDenied):
                next(stream)
        with self.assertRaises(BudgetDenied):
            self.create()
        self.assertEqual((len(self.calls), self.used()), (1, 1))

    def test_eof_without_terminal_is_failure(self):
        self.events = []
        with self.create() as stream:
            with self.assertRaises(BudgetDenied):
                list(stream)
        with self.assertRaises(BudgetDenied):
            self.create()
        self.assertEqual(len(self.calls), 1)

    def test_incomplete_response_poison(self):
        self.events = [NS(type='response.incomplete')]
        with self.create() as stream:
            with self.assertRaises(BudgetDenied):
                list(stream)
        with self.assertRaises(BudgetDenied):
            self.create()

    def test_early_close_prevents_followup(self):
        self.create().close()
        with self.assertRaises(BudgetDenied):
            self.create()

    def test_concurrent_create_rejected_before_wire(self):
        self.create()
        with self.assertRaises(BudgetDenied):
            self.create()
        self.assertEqual(len(self.calls), 1)

    def test_deadline_prevents_wire(self):
        self.now = 121
        with self.assertRaises(BudgetDenied):
            self.create()
        self.assertEqual(self.used(), 0)

    def test_sdk_retries_rejected(self):
        self.sdk.max_retries = 1
        with self.assertRaises(BudgetDenied):
            GuardedResponses(self.sdk, self.ledger, deadline=121, clock=lambda: 1)

    def test_raw_overrides_rejected(self):
        with self.assertRaises(BudgetDenied):
            self.create(extra_body={'model': 'other'})
        self.assertEqual(self.used(), 0)

    def test_iterator_setup_failure_closes_raw_and_poison(self):
        class Broken(Raw):
            def __iter__(self):
                raise ConnectionError('offline setup')
        raw = Broken([])
        self.boundary._guard.send = lambda **kwargs: raw
        with self.assertRaises(BudgetDenied):
            self.create()
        self.assertTrue(raw.closed)
        with self.assertRaises(BudgetDenied):
            self.create()
        self.assertEqual(self.used(), 1)

    def test_deadline_during_iteration_poison(self):
        with self.create() as stream:
            self.now = 121
            with self.assertRaises(BudgetDenied):
                next(stream)
        with self.assertRaises(BudgetDenied):
            self.create()
        self.assertEqual(len(self.calls), 1)

    def test_alternate_client_routes_absent(self):
        for name in ('chat', 'embeddings', 'with_options', 'copy'):
            with self.assertRaises(AttributeError):
                getattr(self.boundary, name)


if __name__ == '__main__':
    unittest.main()
