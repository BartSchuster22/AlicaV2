"""Adapter-owned Responses boundary; no upstream changes.

Use only in a request-scoped trusted worker. This facade deliberately exposes no
chat, embeddings, with_options, or client-cloning routes. It is not a sandbox.
The worker must also reject auxiliary providers before constructing AIAgent.
"""
import threading
import time
from types import SimpleNamespace

from request_budget import BudgetDenied, DispatchGuard


class GuardedResponses:
    def __init__(self, client, ledger, *, deadline, clock=time.monotonic):
        if client.max_retries != 0:
            raise BudgetDenied('FAILED_PRECONDITION')
        if not clock() < deadline <= clock() + 120:
            raise BudgetDenied('DEADLINE_EXCEEDED')
        self._client = client
        self._guard = DispatchGuard(ledger, client.responses.create)
        self._clock, self._deadline = clock, deadline
        self._lock = threading.Lock()
        self._active = None
        self.base_url = client.base_url
        self.responses = SimpleNamespace(create=self.create)

    def _deny(self, code='UNAVAILABLE'):
        self._guard.poisoned = True
        raise BudgetDenied(code)

    def create(self, **kwargs):
        with self._lock:
            if self._guard.poisoned:
                self._deny()
            if self._active is not None:
                self._deny('RESOURCE_EXHAUSTED')
            remaining = self._deadline - self._clock()
            if remaining <= 0:
                self._deny('DEADLINE_EXCEEDED')
            # Pinned Hermes sdk_transform_bypass moves only input/tools into
            # extra_body. Flatten those exact bulk fields before policy checks;
            # never forward an SDK post-validation override to the wire.
            if 'extra_body' in kwargs:
                bulk = kwargs.pop('extra_body')
                if (type(bulk) is not dict or not bulk
                        or set(bulk) - {'input', 'tools'}
                        or set(bulk).intersection(kwargs)
                        or any(type(value) is not list for value in bulk.values())):
                    self._deny('PERMISSION_DENIED')
                kwargs.update(bulk)
            # Pinned Codex transport emits only these request-correlation headers.
            # Strip them: they are unnecessary for this no-resume request, and no
            # arbitrary headers (especially authorization/host) may reach the SDK.
            if 'extra_headers' in kwargs:
                headers = kwargs.pop('extra_headers')
                if (type(headers) is not dict
                        or set(headers) - {'session_id', 'x-client-request-id'}
                        or any(type(v) is not str or len(v) > 256
                               or '\r' in v or '\n' in v for v in headers.values())):
                    self._deny('PERMISSION_DENIED')
            # Hermes may provide a configured timeout; the task deadline wins.
            if 'timeout' in kwargs:
                timeout = kwargs.pop('timeout')
                if (type(timeout) not in (int, float) or not 0 < timeout <= 120):
                    self._deny('PERMISSION_DENIED')
                remaining = min(remaining, timeout)
            # Raw SDK options can override model/token/endpoint policy. Fail closed.
            allowed = {'model', 'input', 'instructions', 'tools', 'tool_choice',
                       'parallel_tool_calls', 'reasoning', 'text', 'store',
                       'stream', 'include', 'prompt_cache_key'}
            if set(kwargs) - allowed or kwargs.get('stream') is not True:
                self._deny('PERMISSION_DENIED')
            if kwargs.get('store', False) is not False:
                self._deny('PERMISSION_DENIED')
            kwargs['timeout'] = remaining
            try:
                raw = self._guard(**kwargs)
                try:
                    self._active = _Stream(self, raw)
                except BaseException:
                    self._guard.poisoned = True
                    raw.close()
                    raise
                return self._active
            except BaseException:
                self._guard.poisoned = True
                # SDK errors can contain headers/body/credentials. Never expose
                # their text or chained exception to native recovery/artifacts.
                raise BudgetDenied('UNAVAILABLE') from None

    def close(self):
        self._guard.poisoned = True
        try:
            if self._active is not None:
                self._active.close()
        finally:
            try:
                self._client.close()
            except BaseException:
                raise BudgetDenied('UNAVAILABLE') from None


class _Stream:
    def __init__(self, owner, raw):
        self.owner, self.raw = owner, raw
        self.terminal = self.closed = False
        self.iterator = iter(raw)

    def __iter__(self):
        return self

    def __next__(self):
        if self.closed:
            raise StopIteration
        try:
            if self.owner._clock() >= self.owner._deadline:
                self.owner._deny('DEADLINE_EXCEEDED')
            event = next(self.iterator)
            kind = getattr(event, 'type', None)
            if kind in ('response.failed', 'response.incomplete', 'error'):
                self.owner._deny()
            if kind == 'response.completed':
                response = getattr(event, 'response', None)
                if getattr(response, 'status', None) != 'completed':
                    self.owner._deny()
                self.terminal = True
            return event
        except StopIteration:
            if not self.terminal:
                self.owner._guard.poisoned = True
                raise BudgetDenied('UNAVAILABLE') from None
            raise
        except BaseException:
            # Crucial: upstream may catch an iterator transport error and retry.
            # Poison BEFORE it sees that error; its next create cannot hit wire.
            self.owner._guard.poisoned = True
            raise BudgetDenied('UNAVAILABLE') from None

    def close(self):
        if self.closed:
            return
        self.closed = True
        if not self.terminal:
            self.owner._guard.poisoned = True
        try:
            self.raw.close()
        except BaseException:
            self.owner._guard.poisoned = True
            raise BudgetDenied('UNAVAILABLE') from None
        finally:
            with self.owner._lock:
                if self.owner._active is self:
                    self.owner._active = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
