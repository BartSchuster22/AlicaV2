"""REVIEW MODEL ONLY: no SDK adapter, socket, process or native qualification."""
from dataclasses import dataclass

class Fault(Exception):
    pass

@dataclass(frozen=True)
class Endpoint:
    session: str
    generation: int
    context: str
    scopes: frozenset
    purpose: str = 'invoke'

@dataclass
class Resource:
    owner: tuple
    scope: str
    scope_generation: int
    callback: str
    state: str = 'OWNED'
    result: str | None = None
    endpoint: Endpoint | None = None
    wire: int | None = None
    deadline: int | None = None
    runs: int = 0

class Ledger:
    """Finite reference transition system. Time is a supplied model clock."""
    def __init__(self, limit=4096, other_effects=0):
        if not 1 <= limit <= 4096 or not 0 <= other_effects <= limit:
            raise Fault('INVALID_ARGUMENT')
        self.limit, self.other_effects = limit, other_effects
        self.resources = {}
        self.scopes = {'root': (1, 'OPEN'), 'child': (1, 'OPEN'), 'sibling': (1, 'OPEN')}
        self.callbacks = set()
        self.failed = False
        self.reaped = False
        self.restart_required = False
        self.completed = self.timed_out = 0
        self.errors = []

    @staticmethod
    def owner(endpoint):
        return endpoint.session, endpoint.generation

    def register(self, endpoint, scope, generation, callback, accepting=True):
        if self.failed:
            raise Fault('UNAVAILABLE')
        if scope not in endpoint.scopes:
            raise Fault('PERMISSION_DENIED')
        if self.scopes.get(scope) != (generation, 'OPEN') or not accepting:
            raise Fault('FAILED_PRECONDITION')
        key = self.owner(endpoint), callback
        if key in self.callbacks:
            raise Fault('PROTOCOL_ERROR')
        if len(self.resources) + self.other_effects >= self.limit:
            raise Fault('RESOURCE_EXHAUSTED')
        rid = f'e{len(self.resources) + 1}'
        self.resources[rid] = Resource(self.owner(endpoint), scope, generation, callback)
        self.callbacks.add(key)
        return rid

    def owned(self, endpoint, rid):
        resource = self.resources.get(rid)
        if resource is None or resource.owner != self.owner(endpoint) or resource.scope not in endpoint.scopes:
            raise Fault('PERMISSION_DENIED')
        return resource

    def select(self, rid, endpoint, wire, now, cleanup_ms, outer_deadline=None, depth=1):
        resource = self.owned(endpoint, rid)
        if self.failed:
            raise Fault('UNAVAILABLE')
        if resource.state != 'OWNED':
            return resource.result  # Same cached completion; no new callback.
        if depth > 8:
            raise Fault('RESOURCE_EXHAUSTED')
        if not 1 <= cleanup_ms <= 30000:
            raise Fault('INVALID_ARGUMENT')
        resource.state = 'SELECTED'
        resource.endpoint, resource.wire = endpoint, wire
        resource.deadline = min(now + cleanup_ms, outer_deadline) if outer_deadline is not None else now + cleanup_ms
        return None

    def dispatch(self, rid, now, lifecycle_busy=False, inline=False):
        resource = self.resources[rid]
        if resource.state != 'SELECTED':
            raise Fault('PROTOCOL_ERROR')
        if now >= resource.deadline:
            self.timeout(rid)
            return False
        if lifecycle_busy and not inline:
            return False  # No new context/descriptor; original selected clock remains.
        resource.state = 'RUNNING'
        resource.runs += 1
        return True

    def finish(self, endpoint, rid, wire, now, error=None):
        resource = self.owned(endpoint, rid)
        # Retired exact-context duplicate is discarded, never another success.
        if resource.endpoint != endpoint or resource.wire != wire:
            raise Fault('PROTOCOL_ERROR')
        if resource.state == 'TERMINAL':
            return False
        if resource.state != 'RUNNING':
            raise Fault('PROTOCOL_ERROR')
        if now >= resource.deadline:
            self.timeout(rid)
            return False
        resource.state = 'TERMINAL'
        resource.result = error or 'OK'
        if error:
            self.errors.append(error)
            self.restart_required = True
        else:
            self.completed += 1
        return True

    def timeout(self, rid):
        resource = self.resources[rid]
        if resource.state == 'TERMINAL':
            return
        resource.state, resource.result = 'TERMINAL', 'DEADLINE_EXCEEDED'
        self.timed_out += 1
        self.errors.append('DEADLINE_EXCEEDED')
        self.restart_required = True
        self.fail_physical()

    def fail_physical(self):
        self.failed = True
        self.restart_required = True
        for resource in self.resources.values():
            if resource.state != 'TERMINAL':
                resource.state, resource.result = 'TERMINAL', 'UNAVAILABLE'
        # Retain charged ledger/physical capacity until observed reap.

    def observe_reap(self):
        self.reaped = True
        self.resources.clear()
        self.callbacks.clear()

    def close_scope(self, scope):
        generation, _ = self.scopes[scope]
        self.scopes[scope] = generation, 'CLOSING'
        return [rid for rid, r in reversed(list(self.resources.items())) if r.scope == scope]

class WorkerCallbacks:
    """Model the cross-endpoint registration-reply/cleanup race, not native auth."""
    def __init__(self):
        self.callbacks = {}
        self.effects = {}

    def reserve(self, callback):
        if callback in self.callbacks:
            raise Fault('PROTOCOL_ERROR')
        if len(self.callbacks) >= 4096:
            raise Fault('RESOURCE_EXHAUSTED')
        self.callbacks[callback] = None

    def bind(self, callback, effect):
        if callback not in self.callbacks:
            raise Fault('PROTOCOL_ERROR')
        previous = self.callbacks[callback]
        if previous not in (None, effect) or self.effects.get(effect, callback) != callback:
            raise Fault('PROTOCOL_ERROR')
        self.callbacks[callback] = effect
        self.effects[effect] = callback


class Pending:
    """Operation kind and receiver endpoint are part of correlation, not JSON authority."""
    def __init__(self):
        self.items = {}
        self.high = {}

    def add(self, endpoint, origin, wire, expected):
        bucket = endpoint, origin
        if wire <= self.high.get(bucket, 0):
            raise Fault('PROTOCOL_ERROR')
        if len(self.items) >= 64:
            raise Fault('RESOURCE_EXHAUSTED')
        self.high[bucket] = wire
        self.items[bucket + (wire,)] = expected

    def reply(self, endpoint, origin, wire, kind):
        key = endpoint, origin, wire
        if self.items.get(key) != kind:
            raise Fault('PROTOCOL_ERROR')
        del self.items[key]

    def retire_endpoint(self, endpoint):
        self.items = {k: v for k, v in self.items.items() if k[0] != endpoint}
        self.high = {k: v for k, v in self.high.items() if k[0] != endpoint}


def admit(subscriptions, queue_limit):
    """Matches Host.emit's admission point, not later delivery/handler success."""
    count = 0
    for sub in subscriptions:
        if not all(sub.get(k, True) for k in ('live', 'matching', 'active', 'visible')):
            continue
        if sub['queued'] >= queue_limit:
            sub['live'], sub['queued'] = False, 0
            continue
        sub['queued'] += 1
        count += 1
    return {'admitted': count}
