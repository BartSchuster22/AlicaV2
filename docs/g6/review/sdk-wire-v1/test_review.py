"""Executable review checks only; no production runtime qualification."""
from pathlib import Path
from copy import deepcopy
import hashlib
import json
import sys
import unittest

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '.tools/python'))
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from build_candidate import build, encoded, FEATURES
from review_model import Ledger, Endpoint, Fault, Pending, WorkerCallbacks, admit

SCHEMA = build()
BASE = json.loads((ROOT / 'docs/g6/draft/frames.schema.json').read_text())
RESOURCES = [json.loads(p.read_text()) for p in (ROOT / 'specs/schemas').glob('*.json')] + [SCHEMA, BASE]
REGISTRY = Registry().with_resources((s['$id'], Resource.from_contents(s)) for s in RESOURCES)

def validator(direction=None, baseline=False):
    schema = deepcopy(BASE if baseline else SCHEMA)
    if direction:
        schema['$ref'] = '#/$defs/' + direction
    return Draft202012Validator(schema, registry=REGISTRY)

def frame(tag, body):
    return dict(schemaVersion='acap.ipc/v1', tag=tag, sessionId='a'*64,
                generation=1, sequence=1, contextId='ctx1', body=body)

SAMPLES = [
    ('published', 'workToProvider', frame('response', dict(kind='control', wireId=1, value=dict(kind='published', admitted=2)))),
    ('register', 'workToBroker', frame('request', dict(kind='effect-register', wireId=2, scopeId='child', scopeGeneration=1, callbackId='cb1'))),
    ('registered', 'workToProvider', frame('response', dict(kind='control', wireId=2, value=dict(kind='effect-registered', effectId='e1')))),
    ('release', 'workToBroker', frame('request', dict(kind='effect-release', wireId=3, effectId='e1'))),
    ('cleanup', 'workToProvider', frame('request', dict(kind='effect-cleanup', wireId=4, effectId='e1', callbackId='cb1', remainingMs=100))),
    ('cleaned', 'workToBroker', frame('response', dict(kind='effect-cleaned', wireId=4, effectId='e1'))),
    ('cleanup-error', 'workToBroker', frame('response', dict(kind='effect-cleanup-error', wireId=4, effectId='e1', error=dict(code='UNAVAILABLE', message='unavailable', retryable=False, correlationId='c1')))),
    ('released', 'workToProvider', frame('response', dict(kind='control', wireId=3, value=dict(kind='effect-released', effectId='e1')))),
]

class SchemaTests(unittest.TestCase):
    def test_meta_schema_and_deterministic_snapshot(self):
        Draft202012Validator.check_schema(SCHEMA)
        self.assertEqual((HERE / 'frames.schema.json').read_text(), encoded())

    def test_protected_baseline_hashes(self):
        manifest = json.loads((HERE / 'baseline.sha256.json').read_text())
        self.assertGreater(len(manifest), 20)
        for path, expected in manifest.items():
            with self.subTest(path=path):
                self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(), expected)

    def test_added_shapes_are_closed_directional_and_rejected_by_baseline(self):
        for name, direction, sample in SAMPLES:
            with self.subTest(name=name):
                errors = [e.message for e in validator(direction).iter_errors(sample)]
                self.assertEqual(errors, [])
                self.assertTrue(validator().is_valid(sample))
                self.assertTrue(validator(direction.replace('workTo', 'to')).is_valid(sample))
                opposite = 'workToBroker' if direction == 'workToProvider' else 'workToProvider'
                self.assertFalse(validator(opposite).is_valid(sample))
                self.assertFalse(validator(baseline=True).is_valid(sample))
                control = deepcopy(sample); control['contextId'] = 'control'
                for lane in ('controlToBroker', 'controlToProvider', 'workToBroker', 'workToProvider'):
                    self.assertFalse(validator(lane).is_valid(control), (name, lane))
                for level in ('envelope', 'body', 'value'):
                    bad = deepcopy(sample)
                    target = bad if level == 'envelope' else bad['body'] if level == 'body' else bad['body'].get('value')
                    if target is not None:
                        target['caller'] = {'claimed': True}
                        self.assertFalse(validator(direction).is_valid(bad))
                for key in sample['body']:
                    bad = deepcopy(sample); del bad['body'][key]
                    self.assertFalse(validator(direction).is_valid(bad), (name, key))

    def test_limits_types_and_no_numeric_fd_or_scope_spoof(self):
        for name, direction, sample in SAMPLES:
            for key, value in [('wireId', 0), ('wireId', 1.5), ('wireId', 9007199254740992), ('fd', 5), ('parentWireId', 1)]:
                bad = deepcopy(sample); bad['body'][key] = value
                self.assertFalse(validator(direction).is_valid(bad), (name, key))
        for value in (-1, 0.1, True, '2', 9007199254740992):
            bad = deepcopy(SAMPLES[0][2]); bad['body']['value']['admitted'] = value
            self.assertFalse(validator('workToProvider').is_valid(bad))
        for value in (0, 9007199254740991):
            good = deepcopy(SAMPLES[0][2]); good['body']['value']['admitted'] = value
            self.assertTrue(validator('workToProvider').is_valid(good))
        for value in (0, 30001, -1):
            bad = deepcopy(SAMPLES[4][2]); bad['body']['remainingMs'] = value
            self.assertFalse(validator('workToProvider').is_valid(bad))
        for key, value in [('scopeGeneration', 0), ('callbackId', ''), ('scopeId', '../other')]:
            bad = deepcopy(SAMPLES[1][2]); bad['body'][key] = value
            self.assertFalse(validator('workToBroker').is_valid(bad))

    def test_handshake_requires_minor_features_and_host_effect_limit(self):
        samples = json.loads((ROOT / 'docs/g6/draft/examples.json').read_text())
        for tag, field, direction in [('hello', 'requiredFeatures', 'controlToBroker'), ('accepted', 'negotiatedFeatures', 'controlToProvider')]:
            sample = deepcopy(samples[tag])
            self.assertFalse(validator(direction).is_valid(sample))
            sample['body']['protocolMinor'] = 1
            sample['body'][field] = list(FEATURES)
            if tag == 'accepted': sample['body']['effectLimit'] = 4096
            self.assertTrue(validator(direction).is_valid(sample))
            self.assertFalse(validator(direction, baseline=True).is_valid(sample))
            for feature in FEATURES:
                bad = deepcopy(sample); bad['body'][field].remove(feature)
                self.assertFalse(validator(direction).is_valid(bad))
            duplicate = deepcopy(sample); duplicate['body'][field].append(FEATURES[0])
            self.assertFalse(validator(direction).is_valid(duplicate))
            if tag == 'accepted':
                for value in (0, 4097, 1.5):
                    bad = deepcopy(sample); bad['body']['effectLimit'] = value
                    self.assertFalse(validator(direction).is_valid(bad))

    def test_existing_nonhandshake_examples_and_r2_limits_unchanged(self):
        for name, sample in json.loads((ROOT / 'docs/g6/draft/examples.json').read_text()).items():
            if name not in ('hello', 'accepted'):
                self.assertEqual(validator().is_valid(sample), validator(baseline=True).is_valid(sample))
        self.assertEqual(SCHEMA['$defs']['limits'], BASE['$defs']['limits'])
        for direction in ('controlToBroker', 'controlToProvider'):
            self.assertEqual(SCHEMA['$defs'][direction], BASE['$defs'][direction])

class ModelTests(unittest.TestCase):
    def setUp(self):
        self.e = Endpoint('worker-a', 1, 'ctx1', frozenset({'root', 'child', 'sibling'}))
        self.ledger = Ledger()

    def register(self, callback='cb1', scope='child'):
        return self.ledger.register(self.e, scope, 1, callback)

    def run_cleanup(self, rid, wire=1, error=None):
        self.ledger.select(rid, self.e, wire, 0, 100)
        self.assertTrue(self.ledger.dispatch(rid, 1))
        return self.ledger.finish(self.e, rid, wire, 2, error)

    def test_publication_zero_mixed_admission_overload_and_later_failure(self):
        self.assertEqual(admit([], 2), {'admitted': 0})
        subscriptions = [{'queued': 0}, {'queued': 2}, {'queued': 0, 'live': False},
                         {'queued': 0, 'matching': False}, {'queued': 1, 'visible': False},
                         {'queued': 0, 'active': False}, {'queued': 1, 'delivery_will_fail': True}]
        receipt = admit(subscriptions, 2)
        self.assertEqual(receipt, {'admitted': 2})
        self.assertFalse(subscriptions[1]['live'])
        self.assertEqual(subscriptions[1]['queued'], 0)
        subscriptions[-1]['live'] = False  # Later revocation/error never changes receipt.
        self.assertEqual(receipt['admitted'], 2)

    def test_pending_operation_endpoint_generation_and_origin_are_binding(self):
        pending = Pending(); pending.add(self.e, 'worker', 1, 'published')
        for endpoint, origin, wire, kind in [
            (self.e, 'worker', 1, 'ack'), (self.e, 'broker', 1, 'published'),
            (self.e, 'worker', 2, 'published'),
            (Endpoint('worker-a', 2, 'ctx1', self.e.scopes), 'worker', 1, 'published'),
            (Endpoint('worker-a', 1, 'ctx2', self.e.scopes), 'worker', 1, 'published')]:
            with self.assertRaises(Fault): pending.reply(endpoint, origin, wire, kind)
        pending.add(self.e, 'broker', 1, 'effect-cleaned')
        pending.reply(self.e, 'worker', 1, 'published')
        pending.reply(self.e, 'broker', 1, 'effect-cleaned')
        with self.assertRaises(Fault): pending.reply(self.e, 'worker', 1, 'published')
        with self.assertRaises(Fault): pending.add(self.e, 'worker', 1, 'published')
        pending.retire_endpoint(self.e)
        self.assertEqual((pending.items, pending.high), ({}, {}))

    def test_sdk_pending_bound_and_no_partial_reservation(self):
        pending = Pending()
        for wire in range(1, 65): pending.add(self.e, 'worker', wire, 'published')
        with self.assertRaisesRegex(Fault, 'RESOURCE_EXHAUSTED'): pending.add(self.e, 'worker', 65, 'published')
        self.assertEqual(len(pending.items), 64)
        self.assertEqual(pending.high[(self.e, 'worker')], 64)

    def test_effect_capacity_matches_host_and_counts_retired_and_other_resources(self):
        self.ledger = Ledger(limit=2, other_effects=1)
        rid = self.register(); self.run_cleanup(rid)
        with self.assertRaisesRegex(Fault, 'RESOURCE_EXHAUSTED'): self.register('cb2')
        self.assertEqual(len(self.ledger.resources), 1)
        self.assertEqual(self.ledger.completed, 1)

    def test_duplicate_callback_registration_rejected_without_ownership_change(self):
        self.register()
        with self.assertRaisesRegex(Fault, 'PROTOCOL_ERROR'): self.register()
        self.assertEqual(len(self.ledger.resources), 1)

    def test_wrong_scope_generation_closed_scope_and_late_registration(self):
        for endpoint, scope, generation, accepting in [
            (Endpoint('worker-a', 1, 'narrow', frozenset({'root'})), 'child', 1, True),
            (self.e, 'child', 2, True), (self.e, 'child', 1, False)]:
            with self.assertRaises(Fault): self.ledger.register(endpoint, scope, generation, 'cb', accepting)
        self.ledger.close_scope('child')
        with self.assertRaisesRegex(Fault, 'FAILED_PRECONDITION'): self.register()
        self.assertEqual(self.ledger.resources, {})

    def test_child_scope_reverse_order_preserves_unrelated_callbacks(self):
        a = self.register('a'); b = self.register('b'); c = self.register('c', 'sibling')
        self.assertEqual(self.ledger.close_scope('child'), [b, a])
        for wire, rid in enumerate([b, a], 1): self.run_cleanup(rid, wire)
        self.assertEqual(self.ledger.resources[c].state, 'OWNED')
        self.assertFalse(self.ledger.failed)

    def test_failed_acquisition_rollback_reverse_and_shared_cleanup_join(self):
        acquired = [self.register('a'), self.register('b')]
        order = []
        for wire, rid in enumerate(reversed(acquired), 1):
            order.append(rid); self.run_cleanup(rid, wire)
            self.assertEqual(self.ledger.select(rid, self.e, wire+10, 3, 100), 'OK')
            self.assertEqual(self.ledger.resources[rid].runs, 1)
        self.assertEqual(order, acquired[::-1])
        self.assertEqual(self.ledger.completed, 2)

    def test_release_cannot_retarget_other_session_generation_or_scope(self):
        rid = self.register()
        for endpoint in [Endpoint('worker-b', 1, 'ctx1', self.e.scopes),
                         Endpoint('worker-a', 2, 'ctx1', self.e.scopes),
                         Endpoint('worker-a', 1, 'ctx2', frozenset({'sibling'}))]:
            with self.assertRaisesRegex(Fault, 'PERMISSION_DENIED'):
                self.ledger.select(rid, endpoint, 1, 0, 100)
        self.assertEqual(self.ledger.resources[rid].state, 'OWNED')

    def test_cleanup_response_context_and_wire_are_exact(self):
        rid = self.register(); self.ledger.select(rid, self.e, 4, 0, 100); self.ledger.dispatch(rid, 1)
        for endpoint, wire in [(self.e, 5), (Endpoint('worker-a', 1, 'ctx2', self.e.scopes), 4)]:
            with self.assertRaises(Fault): self.ledger.finish(endpoint, rid, wire, 2)
        self.assertTrue(self.ledger.finish(self.e, rid, 4, 2))
        self.assertFalse(self.ledger.finish(self.e, rid, 4, 3))
        self.assertEqual(self.ledger.completed, 1)

    def test_cleanup_error_is_not_success_or_physical_reap(self):
        a = self.register('a'); b = self.register('b')
        self.run_cleanup(a, error='UNAVAILABLE'); self.run_cleanup(b, wire=2)
        self.assertEqual(self.ledger.errors, ['UNAVAILABLE'])
        self.assertEqual(self.ledger.completed, 1)
        self.assertTrue(self.ledger.restart_required)
        self.assertFalse(self.ledger.failed)
        self.assertFalse(self.ledger.reaped)

    def test_lifecycle_slot_occupancy_does_not_reset_selected_deadline(self):
        rid = self.register(); self.ledger.select(rid, self.e, 1, 0, 100)
        self.assertFalse(self.ledger.dispatch(rid, 50, lifecycle_busy=True))
        self.assertEqual(self.ledger.resources[rid].deadline, 100)
        self.assertFalse(self.ledger.dispatch(rid, 100, lifecycle_busy=True))
        self.assertTrue(self.ledger.failed)
        self.assertEqual(self.ledger.resources[rid].runs, 0)

    def test_inline_rollback_and_lifecycle_cleanup_do_not_wait_for_own_slot(self):
        rid = self.register(); self.ledger.select(rid, self.e, 1, 0, 100, outer_deadline=50)
        self.assertTrue(self.ledger.dispatch(rid, 10, lifecycle_busy=True, inline=True))
        self.assertEqual(self.ledger.resources[rid].deadline, 50)
        self.ledger.finish(self.e, rid, 1, 20)
        self.assertFalse(self.ledger.failed)

    def test_depth_eight_admitted_nine_rejected_without_partial_transition(self):
        a = self.register('a'); b = self.register('b')
        self.ledger.select(a, self.e, 1, 0, 100, depth=8)
        with self.assertRaisesRegex(Fault, 'RESOURCE_EXHAUSTED'):
            self.ledger.select(b, self.e, 2, 0, 100, depth=9)
        self.assertEqual(self.ledger.resources[b].state, 'OWNED')

    def test_timeout_shared_failure_late_reply_and_quarantine_until_actual_reap(self):
        a = self.register('a'); b = self.register('b', 'sibling')
        self.ledger.select(a, self.e, 1, 0, 10); self.ledger.dispatch(a, 1)
        self.assertFalse(self.ledger.finish(self.e, a, 1, 10))
        self.assertEqual(self.ledger.resources[a].result, 'DEADLINE_EXCEEDED')
        self.assertEqual(self.ledger.resources[b].result, 'UNAVAILABLE')
        self.assertFalse(self.ledger.finish(self.e, a, 1, 11))
        self.assertEqual(self.ledger.completed, 0)
        self.assertEqual(self.ledger.timed_out, 1)
        self.assertEqual(len(self.ledger.resources), 2)
        self.assertFalse(self.ledger.reaped)
        self.ledger.observe_reap()
        self.assertTrue(self.ledger.reaped)
        self.assertEqual(self.ledger.resources, {})

    def test_cross_endpoint_cleanup_can_precede_registration_reply(self):
        for order in ('cleanup-first', 'reply-first'):
            worker = WorkerCallbacks(); worker.reserve('cb1')
            # Both authenticated broker messages assert the same binding.
            worker.bind('cb1', 'e1'); worker.bind('cb1', 'e1')
            self.assertEqual(worker.effects, {'e1': 'cb1'}, order)
            with self.assertRaises(Fault): worker.bind('cb1', 'e2')
            worker.reserve('cb2')
            with self.assertRaises(Fault): worker.bind('cb2', 'e1')
            with self.assertRaises(Fault): worker.bind('unknown', 'e3')

    def test_unknown_registration_outcome_fails_session_not_replayed(self):
        self.register(); self.ledger.fail_physical()
        with self.assertRaisesRegex(Fault, 'UNAVAILABLE'): self.register('cb2')
        self.assertEqual(len(self.ledger.resources), 1)
        self.assertTrue(self.ledger.restart_required)

if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print(json.dumps({'level': 'REVIEW-SCHEMA-AND-MODEL-ONLY', 'runtimeQualification': False,
                      'tests': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors)}))
    sys.exit(not result.wasSuccessful())
