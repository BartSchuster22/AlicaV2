"""Offline controls for the production entrypoint; disposable grants only."""
import io
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import httpx
import live_entry as live
from live_authority import ATTEMPT_NAME, LEDGER_NAME, claim_original_attempt
from request_budget import initialize, BudgetDenied
from native_binding import ENDPOINT, FIXTURE, FIXTURE_TASK, MODEL, TOOL

CANARY = 'SYNTHETIC_LIVE_ENTRY_TOKEN_NOT_AUTH'


def child(root, failure=None):
    root = Path(root)
    grant, request = root / 'mock-grant', root / 'request'
    grant.mkdir(mode=0o700)
    request.mkdir(mode=0o700)
    initialize(grant / LEDGER_NAME)
    os.chmod(grant / LEDGER_NAME, 0o600)
    auth = grant / live.AUTH_NAME
    auth.write_text(json.dumps({'access_token': CANARY, 'account_id': 'mock-account'}))
    auth.chmod(0o600)
    sends = []
    def send(req):
        assert transport.socket_permitted()
        body = json.loads(req.content)
        sends.append(body)
        assert body['model'] == MODEL and 'max_output_tokens' not in body
        if failure == 'http401':
            return httpx.Response(401, json={'error': {'message': CANARY}})
        if failure == 'timeout':
            raise httpx.ReadTimeout(CANARY)
        if len(sends) == 1:
            item = {'type':'function_call','id':'fc_fixture','call_id':'call_fixture',
                    'name':TOOL,'arguments':'{}','status':'completed'}
            added = dict(item, arguments='', status='in_progress')
            delta = {'type':'response.function_call_arguments.delta','item_id':item['id'],
                     'output_index':0,'delta':'{}'}
        else:
            assert len(sends) == 2 and FIXTURE['value'] in json.dumps(body)
            item = {'type':'message','id':'msg_final','role':'assistant','status':'completed',
                    'content':[{'type':'output_text','text':FIXTURE['value'],'annotations':[]}]}
            added = dict(item, content=[], status='in_progress')
            delta = {'type':'response.output_text.delta','item_id':item['id'],
                     'output_index':0,'content_index':0,'delta':FIXTURE['value']}
        frames = [{'type':'response.output_item.added','output_index':0,'item':added},delta,
                  {'type':'response.output_item.done','output_index':0,'item':item},
                  {'type':'response.completed','response':{'id':'offline','object':'response',
                   'created_at':0,'status':'completed','model':MODEL,'output':None,
                   'usage':{'input_tokens':1,'output_tokens':1,'total_tokens':2}}}]
        for n, frame in enumerate(frames):
            frame['sequence_number'] = n
        return httpx.Response(200, headers={'content-type':'text/event-stream'},
                              content=''.join('event: '+f['type']+'\ndata: '+json.dumps(f)+'\n\n' for f in frames))
    class TrackedMock(httpx.MockTransport):
        closed = False
        def close(self):
            self.closed = True
            super().close()
    wire = TrackedMock(send)
    transport = live.EndpointTransport(wire)
    # Exercise main itself, replacing only original state location and wire.
    with patch.object(live, 'ORIGINAL_DIRECTORY', grant), patch.object(live, 'claim_original_attempt', lambda: claim_original_attempt(grant)), patch.object(live, 'EndpointTransport', lambda: transport), patch.object(sys, 'argv', ['live_entry.py', str(request)]), patch.object(sys, 'stdin', io.StringIO(json.dumps({'task':FIXTURE_TASK}))):
        if failure:
            try:
                live.main()
            except BudgetDenied:
                pass
            else:
                raise AssertionError('failure accepted')
        else:
            live.main()
    signal.setitimer(signal.ITIMER_REAL, 0)
    expected = 1 if failure else 2
    assert len(sends) == expected and not auth.exists() and not transport.socket_permitted()
    assert wire.closed
    import socket
    try:
        socket.getaddrinfo('localhost', 443)
    except PermissionError:
        pass
    else:
        raise AssertionError('ambient network enabled')
    with sqlite3.connect(grant / LEDGER_NAME) as db:
        assert db.execute('SELECT used FROM grant_state').fetchone() == (expected,)
    try:
        claim_original_attempt(grant)
    except BudgetDenied:
        pass
    else:
        raise AssertionError('restart allowed')


class LiveEntry(unittest.TestCase):
    def test_native_entry_mock_wire_and_cleanup(self):
        with tempfile.TemporaryDirectory() as root:
            p = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--child', root],
                               capture_output=True, timeout=120)
            self.assertNotIn(CANARY.encode(), p.stdout + p.stderr)
            self.assertEqual(p.returncode, 0, (p.stdout+p.stderr).decode()[-3000:])
            self.assertEqual(json.loads(p.stdout), {'text':FIXTURE['value']})
            self.assertTrue((Path(root)/'mock-grant'/ATTEMPT_NAME).exists())
            self.assertFalse((Path(root)/'mock-grant'/live.AUTH_NAME).exists())
            for path in Path(root).rglob('*'):
                if path.is_file():
                    self.assertNotIn(CANARY.encode(), path.read_bytes())

    def test_native_entry_failure_cleanup(self):
        for failure in ('http401', 'timeout'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as root:
                p = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--child', root, failure],
                                   capture_output=True, timeout=120)
                self.assertNotIn(CANARY.encode(), p.stdout + p.stderr)
                self.assertEqual(p.returncode, 0, (p.stdout+p.stderr).decode()[-3000:])
                self.assertEqual(p.stdout, b'')
                self.assertTrue((Path(root)/'mock-grant'/ATTEMPT_NAME).exists())
                self.assertFalse((Path(root)/'mock-grant'/live.AUTH_NAME).exists())
                for path in Path(root).rglob('*'):
                    if path.is_file():
                        self.assertNotIn(CANARY.encode(), path.read_bytes())
            self.assertFalse(Path(root).exists())

    def test_transport_denies_alternate_routes(self):
        sends = []
        transport = live.EndpointTransport(httpx.MockTransport(lambda r: sends.append(r)))
        for method, url, headers in [('GET',ENDPOINT+'/responses',{}), ('POST',ENDPOINT+'/models',{}), ('POST','https://example.com/responses',{}), ('POST',ENDPOINT+'/responses?override=1',{}), ('POST',ENDPOINT+'/responses',{'Host':'example.com'})]:
            with self.assertRaises(BudgetDenied):
                transport.handle_request(httpx.Request(method,url,headers=headers))
        self.assertEqual(sends, [])
        self.assertFalse(transport.socket_permitted())

    def test_redirect_and_exception_revoke_permit(self):
        for failure in (False, True):
            def send(req):
                if failure:
                    raise RuntimeError('mock')
                return httpx.Response(302,headers={'Location':'https://example.com'})
            transport = live.EndpointTransport(httpx.MockTransport(send))
            with self.assertRaises((BudgetDenied, RuntimeError)):
                transport.handle_request(httpx.Request('POST',ENDPOINT+'/responses'))
            self.assertFalse(transport.socket_permitted())

    def test_auth_malformed_removed(self):
        with tempfile.TemporaryDirectory() as root:
            p = Path(root)/live.AUTH_NAME
            for value in ({'access_token':CANARY}, {'access_token':CANARY,'account_id':'bad\nheader'}):
                p.write_text(json.dumps(value)); p.chmod(0o600)
                with self.assertRaises(BudgetDenied):
                    live.consume_auth(root)
                self.assertFalse(p.exists())

    def test_auth_symlink_not_followed(self):
        with tempfile.TemporaryDirectory() as root:
            target = Path(root)/'target'
            target.write_text(CANARY)
            (Path(root)/live.AUTH_NAME).symlink_to(target)
            with self.assertRaises(OSError):
                live.consume_auth(root)
            self.assertEqual(target.read_text(), CANARY)


if __name__ == '__main__':
    if len(sys.argv) in (3, 4) and sys.argv[1] == '--child':
        child(sys.argv[2], sys.argv[3] if len(sys.argv) == 4 else None)
    else:
        unittest.main()
