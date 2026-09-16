"""Executable design invariants, NOT inproc/IPC transport equivalence tests."""
import unittest
from g6_context_model import Broker, Rejected

class Design(unittest.TestCase):
    def setUp(self):
        self.b = Broker()
        for name in ['A', 'B', 'C']: self.b.worker(name)
        self.b.grants.update({('A','s1','A'),('A','s1','B'),('B','s1','A'),('B','s1','C')})
    def rejected(self, code, fn, *a, **kw):
        with self.assertRaises(Rejected) as e: fn(*a, **kw)
        self.assertEqual(e.exception.code, code)
    def test_overlap_and_independent_deadlines(self):
        a=self.b.start('A',budget=20); z=self.b.start('A',budget=100)
        self.assertEqual(self.b.counts('A')['ordinary'],2)
        self.b.tick(20);self.assertEqual(a.terminal,'DEADLINE_EXCEEDED');self.assertIs(self.b.deliver(z.endpoint),z)
    def test_state_is_shared_not_replicated(self):
        a=self.b.start('A');z=self.b.start('A')
        for c in [a,z]:self.b.workers[c.worker]['state']['counter']+=1
        self.assertEqual(self.b.workers['A']['state']['counter'],2)
    def test_successful_a_b_a_reentry(self):
        a=self.b.start('A');b=self.b.outbound(a.endpoint,'B');inner=self.b.outbound(b.endpoint,'A')
        self.b.workers[inner.worker]['state']['counter']+=1
        self.b.end(inner,'OK');self.b.end(b,'OK');self.b.end(a,'OK')
        self.assertEqual([a.terminal,b.terminal,inner.terminal],['OK']*3)
        self.assertEqual(self.b.workers['A']['state']['counter'],1)
    def test_child_budget_charged_at_admission(self):
        a=self.b.start('A',budget=50);self.b.tick(30);b=self.b.outbound(a.endpoint,'B',budget=1000)
        self.assertEqual(b.deadline,50)
    def test_caller_identity_not_inherited(self):
        a=self.b.start('A');b=self.b.outbound(a.endpoint,'B')
        self.assertEqual(b.grant,('A','s1','B'));self.assertEqual(b.observed_caller,'A')
    def test_consumer_grant_does_not_authorize_provider(self):
        self.b.grants.discard(('A','s1','B'));self.b.grants.add(('consumer','s1','B'))
        a=self.b.start('A');self.rejected('PERMISSION_DENIED',self.b.outbound,a.endpoint,'B')
    def test_claimed_parent_and_caller_rejected(self):
        a=self.b.start('A')
        for k in ['parentWireId','caller']:
            self.rejected('INVALID_ARGUMENT',self.b.outbound,a.endpoint,'B',**{k:'forged'})
    def test_endpoint_cannot_be_retargeted_by_header(self):
        a=self.b.start('A');z=self.b.start('A')
        self.rejected('UNAUTHENTICATED',self.b.deliver,a.endpoint,claimed_endpoint=z.endpoint)
    def test_foreign_scoped_handle_rejected(self):
        a=self.b.start('A');self.b.grants.add(('A','s2','B'))
        self.rejected('PERMISSION_DENIED',self.b.outbound,a.endpoint,'B',handle_scope='s2')
    def test_expired_a_not_renewed_by_live_b(self):
        a=self.b.start('A',budget=1);z=self.b.start('A',budget=100);self.b.tick(2)
        self.rejected('UNAVAILABLE',self.b.outbound,a.endpoint,'B')
        child=self.b.outbound(z.endpoint,'B');self.assertEqual(child.deadline,z.deadline)
        self.assertEqual(a.terminal,'DEADLINE_EXCEEDED')
    def test_shared_process_valid_other_capability_is_not_intent_proof(self):
        a=self.b.start('A');z=self.b.start('A',budget=2000)
        child=self.b.outbound(z.endpoint,'B',budget=2000)
        self.assertIs(child.parent,z);self.assertEqual(a.deadline,1000)
        self.assertNotIn(child,a.children)  # Explicit documented threat boundary.
    def test_cancel_descendants_not_unrelated(self):
        a=self.b.start('A');z=self.b.start('A');b=self.b.outbound(a.endpoint,'B');c=self.b.outbound(b.endpoint,'C')
        self.b.end(a,'CANCELLED');self.assertEqual(c.terminal,'CANCELLED');self.assertIsNone(z.terminal)
    def test_revocation_before_delivery_cascades(self):
        a=self.b.start('A');b=self.b.outbound(a.endpoint,'B');c=self.b.outbound(b.endpoint,'C')
        self.b.revoke(('A','s1','B'));self.rejected('UNAVAILABLE',self.b.deliver,b.endpoint)
        self.assertEqual(c.terminal,'PERMISSION_DENIED');self.assertIsNone(a.terminal)
    def test_nested_reserve_survives_ordinary_saturation(self):
        roots=[self.b.start('A') for _ in range(4)]
        self.rejected('RESOURCE_EXHAUSTED',self.b.start,'A')
        child=self.b.outbound(roots[0].endpoint,'A');self.assertEqual(child.slot,'nested')
    def test_capacity_exhaustion_not_queued_deadlock(self):
        roots=[self.b.start('A') for _ in range(4)]
        for _ in range(4):self.b.outbound(roots[0].endpoint,'A')
        self.rejected('RESOURCE_EXHAUSTED',self.b.outbound,roots[0].endpoint,'A')
        self.assertEqual(len(self.b.workers['A']['queue']),0)
    def test_max_depth(self):
        c=self.b.start('A')
        for _ in range(7):c=self.b.outbound(c.endpoint,'A')
        self.rejected('RESOURCE_EXHAUSTED',self.b.outbound,c.endpoint,'A')
    def test_queue_fifo_and_original_deadline(self):
        roots=[self.b.start('A') for _ in range(4)]
        q1=self.b.submit('A',20);q2=self.b.submit('A',80)
        self.b.tick(30);self.b.end(roots[0],'OK');self.b.dispatch('A')
        self.assertEqual(q1['terminal'],'DEADLINE_EXCEEDED');self.assertEqual(q2['context'].deadline,80)
    def test_queue_bound(self):
        for _ in range(4):self.b.start('A')
        for _ in range(64):self.b.submit('A',100)
        self.rejected('RESOURCE_EXHAUSTED',self.b.submit,'A',100)
    def test_lifecycle_reserved_capacity(self):
        roots=[self.b.start('A') for _ in range(4)]
        for _ in range(4):self.b.outbound(roots[0].endpoint,'A')
        self.b.start('A',kind='lifecycle',budget=500)
        self.rejected('RESOURCE_EXHAUSTED',self.b.start,'A',kind='lifecycle')
    def test_bytes_aggregate_across_contexts(self):
        a=self.b.start('A');z=self.b.start('A');self.b.reserve(a.endpoint,size=8388608)
        self.rejected('RESOURCE_EXHAUSTED',self.b.reserve,z.endpoint,size=1)
        self.b.end(a,'CANCELLED');self.b.reserve(z.endpoint,size=1)
    def test_frame_budget_and_exactly_once_release(self):
        a=self.b.start('A');self.b.reserve(a.endpoint,frames=64,size=100)
        self.rejected('RESOURCE_EXHAUSTED',self.b.reserve,a.endpoint)
        self.b.end(a,'CANCELLED');self.b.end(a,'OK')
        self.assertEqual(self.b.workers['A']['frames'],0);self.assertEqual(self.b.workers['A']['bytes'],0)
        self.assertEqual(a.terminal,'CANCELLED')
    def test_process_failure_shared_not_per_call_isolation(self):
        a=self.b.start('A');z=self.b.start('A');self.b.disconnect('A')
        self.assertEqual(a.terminal,z.terminal);self.assertEqual(z.terminal,'UNAVAILABLE')
    def test_restart_does_not_rebind_old_endpoint(self):
        a=self.b.start('A');self.b.disconnect('A');self.b.worker('A');fresh=self.b.start('A')
        self.rejected('UNAVAILABLE',self.b.deliver,a.endpoint);self.assertIsNone(fresh.terminal)
    def test_descriptor_offer_success_then_replay(self):
        c=self.b.start('A');lease=object();offer=self.b.offer(c,lease)
        self.assertIs(self.b.accept_offer('A',offer,c.endpoint,[lease]),c.endpoint)
        self.rejected('UNAUTHENTICATED',self.b.accept_offer,'A',offer,c.endpoint,[lease])
    def test_descriptor_offer_swap_extra_and_truncation(self):
        for mode in ['swap','extra','truncated','wrong-instance']:
            with self.subTest(mode=mode):
                self.b.worker('A')
                c=self.b.start('A');lease=object();offer=self.b.offer(c,lease)
                got=[object()] if mode=='swap' else [lease,object()] if mode=='extra' else [lease]
                self.rejected('UNAUTHENTICATED',self.b.accept_offer,'B' if mode=='wrong-instance' else 'A',offer,c.endpoint,got,truncated=mode=='truncated')
                for fd in got:self.assertIn(fd,self.b.closed_descriptors)
    def test_foreign_offer_ack_cannot_cancel_victims_context(self):
        c=self.b.start('A');lease=object();offer=self.b.offer(c,lease)
        self.rejected('UNAUTHENTICATED',self.b.accept_offer,'B',offer,c.endpoint,[object()])
        self.assertIsNone(c.terminal);self.assertIn(offer,self.b.offers)
        self.assertIs(self.b.accept_offer('A',offer,c.endpoint,[lease]),c.endpoint)
    def test_offer_timeout_releases_slot(self):
        c=self.b.start('A',budget=3000);lease=object();self.b.offer(c,lease);self.b.tick(1000)
        self.assertEqual(c.terminal,'UNAVAILABLE');self.assertEqual(self.b.counts('A')['ordinary'],0)
        self.assertIn(lease,self.b.closed_descriptors)
    def test_expired_pending_offer_retains_slot_until_consumed(self):
        c=self.b.start('A',budget=10);lease=object();token=self.b.offer(c,lease)
        self.b.tick(10);self.assertEqual(c.terminal,'DEADLINE_EXCEEDED')
        self.assertEqual(self.b.counts('A')['ordinary'],1)
        self.b.accept_offer('A',token,c.endpoint,[lease])
        self.assertEqual(self.b.counts('A')['ordinary'],0)
        self.rejected('UNAVAILABLE',self.b.deliver,c.endpoint)
    def test_unconsumed_offer_fails_shared_session_at_hard_timeout(self):
        c=self.b.start('A',budget=10);sibling=self.b.start('A',budget=3000)
        self.b.offer(c,object());self.b.tick(1000)
        self.assertEqual(sibling.terminal,'UNAVAILABLE')
        self.assertFalse(self.b.workers['A']['alive']);self.assertEqual(len(self.b.offers),0)
    def test_one_offer_per_context(self):
        c=self.b.start('A');self.b.offer(c,object())
        self.rejected('FAILED_PRECONDITION',self.b.offer,c,object())

if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(Design)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    print('G6 R2 DESIGN MODEL ONLY; runtime qualification=False; tests='+str(result.testsRun))
    raise SystemExit(not result.wasSuccessful())
