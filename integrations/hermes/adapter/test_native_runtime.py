"""OFFLINE real pinned constructor/loop/dispatch qualification, not live H12.

Run in a fresh DEV interpreter with the pinned upstream on PYTHONPATH. No real
credential is read; MockTransport supplies explicitly synthetic model events.
"""
import json
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest

from native_binding import CONTEXT_LENGTH, ENDPOINT, FIXTURE, FIXTURE_TASK, MODEL, TOOL, bind_native, prepare_offline_child
from request_budget import BudgetDenied, initialize


class NativeRuntime(unittest.TestCase):
    def test_real_constructor_loop_and_dispatch(self):
        # Imports of transport libraries happen before permanent audit lockdown.
        import httpx
        from openai import OpenAI
        with tempfile.TemporaryDirectory(prefix='phase3-native-') as root:
            workspace, denied = prepare_offline_child(root)
            ledger = Path(root) / 'offline-test-ledger.sqlite'
            initialize(ledger)  # isolated TEST ledger, never the production grant
            sent = []

            def send(request):
                body = json.loads(request.content)
                sent.append(body)
                self.assertEqual(body['model'], MODEL)
                self.assertNotIn('max_output_tokens', body)
                if len(sent) == 1:
                    output = [{'type': 'function_call', 'id': 'fc_fixture',
                               'call_id': 'call_fixture', 'name': TOOL,
                               'arguments': '{}', 'status': 'completed'}]
                else:
                    self.assertIn(FIXTURE['value'], json.dumps(body))
                    output = [{'type': 'message', 'id': 'msg_final',
                               'role': 'assistant', 'status': 'completed',
                               'content': [{'type': 'output_text',
                                            'text': FIXTURE['value'],
                                            'annotations': []}]}]
                event = {'type': 'response.completed', 'sequence_number': 1,
                         'response': {'id': 'resp_offline', 'object': 'response',
                                      'created_at': 0, 'status': 'completed',
                                      'model': MODEL, 'output': output,
                                      'usage': {'input_tokens': 1, 'output_tokens': 1,
                                                'total_tokens': 2}}}
                # Pinned codex_runtime assembles from item events, NEVER from
                # terminal response.output (which real Codex may leave null).
                item = output[0]
                added = dict(item, status='in_progress')
                if item['type'] == 'function_call':
                    added['arguments'] = ''
                    delta = {'type': 'response.function_call_arguments.delta',
                             'item_id': item['id'], 'output_index': 0, 'delta': '{}'}
                else:
                    added['content'] = []
                    delta = {'type': 'response.output_text.delta',
                             'item_id': item['id'], 'output_index': 0,
                             'content_index': 0, 'delta': FIXTURE['value']}
                events = [
                    {'type': 'response.output_item.added', 'output_index': 0, 'item': added},
                    delta,
                    {'type': 'response.output_item.done', 'output_index': 0, 'item': item},
                    event,
                ]
                event['response']['output'] = None
                for sequence, frame in enumerate(events):
                    frame['sequence_number'] = sequence
                return httpx.Response(200, headers={'content-type': 'text/event-stream'},
                                      content=''.join('event: ' + frame['type'] + '\ndata: ' +
                                                      json.dumps(frame) + '\n\n'
                                                      for frame in events))

            client = OpenAI(api_key='offline-test-not-a-secret', base_url=ENDPOINT,
                            max_retries=0,
                            http_client=httpx.Client(transport=httpx.MockTransport(send),
                                                     trust_env=False, follow_redirects=False))
            agent, guard, calls = bind_native(client, ledger, workspace,
                                              deadline=time.monotonic()+119)
            try:
                self.assertEqual(agent.context_compressor.context_length, CONTEXT_LENGTH)
                # Both inline and ordinary denied tools must fail BEFORE any
                # native execution; a valid call before a denied call is atomic.
                for name in ('todo', 'memory', 'terminal', 'read_file', 'delegate_task'):
                    batch = SimpleNamespace(tool_calls=[
                        SimpleNamespace(function=SimpleNamespace(name=TOOL, arguments='{}')),
                        SimpleNamespace(function=SimpleNamespace(name=name, arguments='{}'))])
                    with self.assertRaises(BudgetDenied):
                        agent._execute_tool_calls(batch, [], 'offline-denied')
                self.assertEqual(calls, [])
                for retried in (False, True):
                    self.assertEqual(agent._recover_with_credential_pool(
                        status_code=429, has_retried_429=retried), (False, retried))
                original_create = guard.responses.create
                def inspect_create(**kwargs):
                    # Offline metadata only: never repr arbitrary objects or payloads.
                    value = kwargs.get('timeout')
                    numeric = type(value) in (int, float)
                    print('OFFLINE timeout metadata:', json.dumps({
                        'field': 'timeout', 'numeric': numeric,
                        'value': value if numeric else None}))
                    return original_create(**kwargs)
                guard.responses.create = inspect_create
                self.assertEqual(agent._resolved_api_call_timeout(), 120)
                canary = 'SYNTHETIC_DEBUG_CANARY_not_a_credential'
                self.assertIsNone(agent._dump_api_request_debug(
                    {'input': canary}, reason='offline-test', error=ValueError(canary)))
                self.assertEqual(list(Path(root).rglob('request_dump_*.json')), [])
                result = agent.run_conversation(FIXTURE_TASK)
                self.assertEqual(result['final_response'], FIXTURE['value'])
                self.assertEqual(calls, [TOOL])
                self.assertEqual(len(sent), 2)
                self.assertFalse(guard._guard.poisoned)
            finally:
                agent.close()
                guard.close()
                # Do not print denied paths/arguments or model request payloads.
            print('OFFLINE real AIAgent loop: fixture dispatch and inline/normal denials verified')


if __name__ == '__main__':
    unittest.main(verbosity=2)
