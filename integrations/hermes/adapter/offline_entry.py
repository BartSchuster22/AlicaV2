"""Native Hermes process entrypoint with SYNTHETIC model traffic; not live H12."""
import contextlib
import json
import sys
import time
from pathlib import Path
import httpx
from openai import OpenAI
from native_binding import ENDPOINT, FIXTURE, FIXTURE_TASK, MODEL, TOOL, bind_native, prepare_offline_child
from request_budget import initialize


def main():
    root = Path(sys.argv[1])
    incoming = json.loads(sys.stdin.read(32769))
    if incoming != {'task': FIXTURE_TASK}:
        raise ValueError('INVALID_ARGUMENT')
    workspace, denied = prepare_offline_child(root)
    ledger = root / 'offline-only.sqlite'
    initialize(ledger)  # NEVER the live grant; unique disposable offline request root
    sends = []

    def send(request):
        body = json.loads(request.content)
        sends.append(body)
        assert body['model'] == MODEL and 'max_output_tokens' not in body
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

    client = OpenAI(api_key='offline-not-a-secret',base_url=ENDPOINT,max_retries=0,
                    http_client=httpx.Client(transport=httpx.MockTransport(send),
                                             trust_env=False,follow_redirects=False))
    with contextlib.redirect_stdout(sys.stderr):
        agent, guard, calls = bind_native(client,ledger,workspace,deadline=time.monotonic()+115)
        try:
            result = agent.run_conversation(incoming['task'])
            assert calls == [TOOL] and len(sends) == 2
            assert result['final_response'] == FIXTURE['value']
        finally:
            agent.close()
            guard.close()
    print(json.dumps({'text':result['final_response']}))


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        # Never serialize raw native/SDK exceptions.
        sys.stderr.write('OFFLINE_NATIVE_FAILED\n')
        sys.exit(1)
