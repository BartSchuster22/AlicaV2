"""R2 DESIGN MODEL ONLY. Opaque objects stand in for native endpoint identity.
No authentication, OS isolation, socket adapter or production qualification here.
"""
from dataclasses import dataclass, field

class Rejected(Exception):
    def __init__(self, code): self.code = code; super().__init__(code)

@dataclass(eq=False)
class Context:
    worker: str
    scope: str
    deadline: int
    depth: int
    slot: str
    parent: object = None
    grant: object = None
    observed_caller: str = 'consumer'
    endpoint: object = field(default_factory=object)
    children: list = field(default_factory=list)
    terminal: object = None
    frames: int = 0
    size: int = 0
    offered: bool = False

class Broker:
    def __init__(self):
        self.now = 0; self.workers = {}; self.contexts = {}; self.grants = set()
        self.offers = {}; self.closed_descriptors = []

    def worker(self, name):
        self.workers[name] = {'alive': True, 'state': {'counter': 0}, 'queue': [], 'frames': 0, 'bytes': 0}

    def counts(self, worker):
        return {s: sum(c.worker == worker and (c.terminal is None or any(v['context'] is c for v in self.offers.values())) and c.slot == s for c in self.contexts.values())
                for s in ['ordinary', 'nested', 'lifecycle']}

    def live(self, endpoint):
        c = self.contexts.get(endpoint)
        if c is None or c.terminal is not None: raise Rejected('UNAVAILABLE')
        if self.now >= c.deadline:
            self.end(c, 'DEADLINE_EXCEEDED'); raise Rejected('DEADLINE_EXCEEDED')
        if c.grant is not None and c.grant not in self.grants:
            self.end(c, 'PERMISSION_DENIED'); raise Rejected('PERMISSION_DENIED')
        return c

    def start(self, worker, scope='s1', budget=1000, parent=None, grant=None, kind='ordinary'):
        if worker not in self.workers or not self.workers[worker]['alive']: raise Rejected('UNAVAILABLE')
        if not 0 < budget <= 30000: raise Rejected('INVALID_ARGUMENT')
        if grant is not None and grant not in self.grants: raise Rejected('PERMISSION_DENIED')
        if parent is not None: parent = self.live(parent.endpoint)
        depth = 1 if parent is None else parent.depth + 1
        if depth > 8: raise Rejected('RESOURCE_EXHAUSTED')
        counts = self.counts(worker)
        if kind == 'lifecycle':
            if counts['lifecycle'] >= 1: raise Rejected('RESOURCE_EXHAUSTED')
            slot = 'lifecycle'
        elif parent is not None:
            if counts['nested'] < 4: slot = 'nested'
            elif counts['ordinary'] < 4: slot = 'ordinary'
            else: raise Rejected('RESOURCE_EXHAUSTED')
        else:
            if counts['ordinary'] >= 4: raise Rejected('RESOURCE_EXHAUSTED')
            slot = 'ordinary'
        deadline = min(self.now + budget, parent.deadline if parent else self.now + budget)
        c = Context(worker, scope, deadline, depth, slot, parent, grant,
                    parent.worker if parent else 'consumer')
        self.contexts[c.endpoint] = c
        if parent: parent.children.append(c)
        return c

    def submit(self, worker, budget, scope='s1'):
        try: return self.start(worker, scope, budget)
        except Rejected as e:
            if e.code != 'RESOURCE_EXHAUSTED': raise
            queue = self.workers[worker]['queue']
            if len(queue) >= 64: raise Rejected('RESOURCE_EXHAUSTED')
            item = {'deadline': self.now + budget, 'scope': scope, 'terminal': None}
            queue.append(item); return item

    def dispatch(self, worker):
        queue = self.workers[worker]['queue']
        while queue and self.counts(worker)['ordinary'] < 4:
            item = queue.pop(0)
            if item['deadline'] <= self.now: item['terminal'] = 'DEADLINE_EXCEEDED'
            else: item['context'] = self.start(worker, item['scope'], item['deadline'] - self.now)

    def outbound(self, endpoint, target, budget=1000, handle_scope='s1', **assertions):
        if assertions: raise Rejected('INVALID_ARGUMENT')
        parent = self.live(endpoint)
        if handle_scope != parent.scope: raise Rejected('PERMISSION_DENIED')
        grant = (parent.worker, parent.scope, target)
        if grant not in self.grants: raise Rejected('PERMISSION_DENIED')
        return self.start(target, parent.scope, budget, parent, grant)

    def deliver(self, endpoint, claimed_endpoint=None):
        c = self.live(endpoint)
        if claimed_endpoint is not None and claimed_endpoint is not endpoint: raise Rejected('UNAUTHENTICATED')
        return c

    def reserve(self, endpoint, frames=1, size=1):
        c = self.live(endpoint); w = self.workers[c.worker]
        if frames < 0 or size < 0: raise Rejected('INVALID_ARGUMENT')
        if w['frames'] + frames > 64 or w['bytes'] + size > 8388608: raise Rejected('RESOURCE_EXHAUSTED')
        w['frames'] += frames; w['bytes'] += size; c.frames += frames; c.size += size

    def end(self, c, outcome):
        if c.terminal is not None: return
        c.terminal = outcome
        for child in c.children: self.end(child, outcome if outcome != 'OK' else 'CANCELLED')
        w = self.workers[c.worker]; w['frames'] -= c.frames; w['bytes'] -= c.size
        c.frames = c.size = 0
        # Unacknowledged transfers retain their slot until nonce acknowledgement
        # proves carrier consumption, or observed physical-session death.
        # The model retains terminal records for test inspection only. Production
        # must evict them using bounded pending maps/watermarks, not copy this history.

    def tick(self, ms):
        self.now += ms
        for record in list(self.offers.values()):
            if self.now >= record['deadline']: self.disconnect(record['context'].worker)
        for c in list(self.contexts.values()):
            if c.terminal is None and self.now >= c.deadline: self.end(c, 'DEADLINE_EXCEEDED')
        for worker in self.workers: self.dispatch(worker)

    def revoke(self, grant):
        self.grants.discard(grant)
        for c in list(self.contexts.values()):
            if c.grant == grant: self.end(c, 'PERMISSION_DENIED')

    def disconnect(self, worker):
        self.workers[worker]['alive'] = False
        for c in list(self.contexts.values()):
            if c.worker == worker: self.end(c, 'UNAVAILABLE')
        for item in self.workers[worker]['queue']: item['terminal'] = 'UNAVAILABLE'
        self.workers[worker]['queue'].clear()
        for token, record in list(self.offers.items()):
            if record['context'].worker == worker:
                self.closed_descriptors.append(record['descriptor']); del self.offers[token]

    def offer(self, c, descriptor):
        self.live(c.endpoint)
        if c.offered: raise Rejected('FAILED_PRECONDITION')
        if sum(v['context'].worker == c.worker for v in self.offers.values()) >= 9: raise Rejected('RESOURCE_EXHAUSTED')
        c.offered = True
        # descriptor is an abstract endpoint lease, NOT a numeric OS fd.
        token = object()
        self.offers[token] = {'context': c, 'descriptor': descriptor, 'deadline': self.now + 1000}
        return token

    def accept_offer(self, worker, token, endpoint, received, truncated=False):
        record = self.offers.get(token)
        valid = record is not None and record['context'].worker == worker and record['context'].endpoint is endpoint
        valid = valid and self.now < record['deadline']
        valid = valid and not truncated and received == [record['descriptor']]
        if not valid:
            self.closed_descriptors.extend(received)
            if record is not None and record['context'].worker == worker:
                self.disconnect(worker)
            raise Rejected('UNAUTHENTICATED')
        del self.offers[token]
        return endpoint
