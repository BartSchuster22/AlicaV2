"""One-shot live native entrypoint. Never provisions or resets the original grant.

Only the original directory is accepted by main. Tests inject disposable state
into helpers, never into the executable CLI. Credentials are a minimal temporary
JSON file, consumed/unlinked before importing Hermes; no profile is copied.
"""
import contextlib
import json
import logging
import os
from pathlib import Path
import signal
import stat
import sys
import threading
import time

import httpx
from live_authority import ORIGINAL_DIRECTORY, claim_original_attempt
from native_binding import ENDPOINT, FIXTURE, FIXTURE_TASK, TOOL, bind_native, prepare_offline_child
from request_budget import BudgetDenied

AUTH_NAME = 'temporary-codex-auth.json'


def consume_auth(directory):
    path = Path(directory) / AUTH_NAME
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600
                or info.st_size > 16384):
            raise BudgetDenied('PERMISSION_DENIED')
        with os.fdopen(fd, 'r', encoding='utf-8') as stream:
            fd = None
            value = json.load(stream)
        if (type(value) is not dict or set(value) != {'access_token', 'account_id'}
                or any(type(v) is not str or not v or len(v) > 12000
                       or any(ord(c) < 33 or ord(c) > 126 for c in v) for v in value.values())):
            raise BudgetDenied('PERMISSION_DENIED')
        return value
    finally:
        if fd is not None:
            os.close(fd)
        path.unlink()  # no restart credential; operator also checks cleanup


class EndpointTransport(httpx.BaseTransport):
    """Socket permission exists only during fixed-endpoint transport I/O.

    No redirects, proxies, retries, alternate origins, or auxiliary requests.
    Trusted process boundary, not isolation against arbitrary Python mutation.
    """
    def __init__(self, inner=None):
        self.inner = inner if inner is not None else httpx.HTTPTransport(retries=0, trust_env=False)
        self.local = threading.local()

    def socket_permitted(self):
        return getattr(self.local, 'active', False)

    @contextlib.contextmanager
    def io(self):
        old = self.socket_permitted()
        self.local.active = True
        try:
            yield
        finally:
            self.local.active = old

    def handle_request(self, request):
        if (request.method != 'POST' or str(request.url) != ENDPOINT + '/responses'
                or request.headers.get('host') != 'chatgpt.com'):
            raise BudgetDenied('PERMISSION_DENIED')
        with self.io():
            response = self.inner.handle_request(request)
        if 300 <= response.status_code < 400:
            with self.io():
                response.close()
            raise BudgetDenied('PERMISSION_DENIED')
        response.stream = PermittedStream(self, response.stream)
        return response

    def close(self):
        with self.io():
            self.inner.close()


class PermittedStream(httpx.SyncByteStream):
    def __init__(self, owner, stream):
        self.owner, self.stream = owner, stream

    def __iter__(self):
        iterator = iter(self.stream)
        while True:
            try:
                with self.owner.io():
                    chunk = next(iterator)
            except StopIteration:
                return
            yield chunk

    def close(self):
        with self.owner.io():
            self.stream.close()


def main():
    from openai import OpenAI
    started = time.monotonic()
    # Hard local ceiling includes input, initialization and native cleanup.
    def expire(*_):
        raise BudgetDenied('DEADLINE_EXCEEDED')
    signal.signal(signal.SIGALRM, expire)
    signal.setitimer(signal.ITIMER_REAL, 120)
    incoming = json.loads(sys.stdin.read(32769))
    if len(sys.argv) != 2 or incoming != {'task': FIXTURE_TASK}:
        raise BudgetDenied('INVALID_ARGUMENT')
    ledger = claim_original_attempt()  # durable, no-restart, BEFORE auth access
    auth = consume_auth(ORIGINAL_DIRECTORY)
    transport = EndpointTransport()
    # Suppress native/SDK logs altogether; never rely on secret pattern matching.
    logging.disable(logging.CRITICAL)
    client = OpenAI(api_key=auth.pop('access_token'), base_url=ENDPOINT,
                    default_headers={'ChatGPT-Account-Id': auth.pop('account_id')},
                    max_retries=0, http_client=httpx.Client(transport=transport,
                    trust_env=False, follow_redirects=False, timeout=30))
    auth.clear()
    agent = guard = None
    with open(os.devnull, 'w') as sink, contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
        try:
            workspace, denied = prepare_offline_child(Path(sys.argv[1]), _live_transport=transport)
            agent, guard, calls = bind_native(client, ledger, workspace, deadline=started + 119)
            result = agent.run_conversation(incoming['task'])
            if calls != [TOOL] or result.get('final_response') != FIXTURE['value']:
                raise BudgetDenied('FAILED_PRECONDITION')
        finally:
            try:
                if agent is not None:
                    agent.close()
            finally:
                if guard is not None:
                    guard.close()
                else:
                    client.close()
    # Success is emitted only after native/SDK cleanup has succeeded.
    print(json.dumps({'text': result['final_response']}))


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        sys.stderr.write('LIVE_NATIVE_FAILED\n')
        sys.exit(1)
