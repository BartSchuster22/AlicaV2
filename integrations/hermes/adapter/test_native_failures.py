"""Offline pinned native failure paths, inspected and cleaned AFTER child exit."""
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest

CANARY = 'SYNTHETIC_ARTIFACT_CANARY_no_real_credential'
CASES = ('http401', 'http429', 'http500', 'transport', 'stream', 'incomplete')


def child(case, root):
    import httpx
    from openai import OpenAI
    from native_binding import ENDPOINT, FIXTURE_TASK, bind_native, prepare_offline_child
    from request_budget import BudgetDenied, initialize
    workspace, denied = prepare_offline_child(root)
    assert 'PHASE3_AMBIENT_CANARY' not in os.environ
    assert os.environ['HOME'] == str(Path(root) / 'home')
    for name in ('.env', 'auth.json', 'credentials.json'):
        try:
            (workspace / name).read_text()
        except BudgetDenied:
            pass
        else:
            raise AssertionError('credential access allowed')
    try:
        subprocess.run(['/usr/bin/true'], check=True)
    except PermissionError:
        pass
    else:
        raise AssertionError('subprocess allowed')
    import socket
    sock = socket.socket()
    try:
        try:
            sock.connect(('127.0.0.1', 9))
        except PermissionError:
            pass
        else:
            raise AssertionError('network allowed')
    finally:
        sock.close()
    ledger = Path(root) / 'offline-only.sqlite'
    initialize(ledger)
    sends = []

    class BrokenStream(httpx.SyncByteStream):
        def __iter__(self):
            yield b'event: response.created\ndata: {"type":"response.created","response":{"id":"synthetic"}}\n\n'
            raise httpx.ReadError(CANARY)

    def send(request):
        sends.append(1)
        if case.startswith('http'):
            return httpx.Response(int(case[4:]), json={'error': {'message': CANARY}})
        if case == 'transport':
            raise httpx.ConnectError(CANARY, request=request)
        if case == 'stream':
            return httpx.Response(200, headers={'content-type': 'text/event-stream'}, stream=BrokenStream())
        return httpx.Response(200, headers={'content-type': 'text/event-stream'}, content='')

    client = OpenAI(api_key=CANARY, base_url=ENDPOINT, max_retries=0,
                    http_client=httpx.Client(transport=httpx.MockTransport(send), trust_env=False))
    agent, guard, calls = bind_native(client, ledger, workspace, deadline=time.monotonic()+119)
    try:
        result = agent.run_conversation(FIXTURE_TASK)
        assert result.get('final_response') != 'ALICA request-scoped fixture'
        assert CANARY not in json.dumps(result)
        assert sends == [1], 'native loop retried physical dispatch'
        assert calls == []
        assert guard._guard.poisoned
        # Explicit retry after native recovery must remain unable to hit transport.
        try:
            guard.responses.create(model='gpt-5.6-sol', stream=True, input=[])
        except BudgetDenied:
            pass
        else:
            raise AssertionError('poisoned facade reopened')
        assert sends == [1]
        with sqlite3.connect(ledger) as db:
            assert db.execute('SELECT used FROM grant_state').fetchone() == (1,)
        assert denied.count('credential_or_dotenv_read') >= 3
        assert 'subprocess.Popen' in denied and 'socket.connect' in denied
    finally:
        agent.close()
        guard.close()
    print('OFFLINE_NATIVE_FAILURE_PASS ' + case)


class NativeFailures(unittest.TestCase):
    def test_failure_isolation_artifacts_and_parent_cleanup(self):
        for case in CASES:
            with self.subTest(case=case):
                root = Path(tempfile.mkdtemp(prefix='phase3-native-failure-'))
                try:
                    env = dict(os.environ, PHASE3_AMBIENT_CANARY=CANARY,
                               PYTHONDONTWRITEBYTECODE='1')
                    run = subprocess.run([sys.executable, str(Path(__file__).resolve()),
                                          '--child', case, str(root)], env=env,
                                         capture_output=True, timeout=120)
                    output = run.stdout + run.stderr
                    self.assertNotIn(CANARY.encode(), output, 'canary in process output')
                    # Only synthetic data; still emit no raw native diagnostic payload.
                    self.assertEqual(run.returncode, 0,
                                     'child failed: ' + output.decode(errors='replace')[-3000:])
                    self.assertIn(('OFFLINE_NATIVE_FAILURE_PASS ' + case).encode(), output)
                    for path in root.rglob('*'):
                        if path.is_file():
                            self.assertNotIn(CANARY.encode(), path.read_bytes(), 'canary in artifact')
                    self.assertEqual(list(root.rglob('request_dump_*.json')), [])
                finally:
                    # Child atexit/import cleanup has finished; no recreation race.
                    shutil.rmtree(root)
                    self.assertFalse(root.exists())
                print('PASS native/' + case + ': one physical send, no retry, isolation, artifact scan, parent cleanup')


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == '--child':
        child(sys.argv[2], sys.argv[3])
    else:
        unittest.main(verbosity=2)
