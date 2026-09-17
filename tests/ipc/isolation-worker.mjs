// Trusted fault dispatcher: real sealed transport, no package/sandbox bypass.
import { WorkerTransport } from '../../packages/kernel/dist/g6/worker-transport.js';
import { WorkerSDKChannel } from '../../packages/kernel/dist/g6/worker-sdk-channel.js';
import { native } from '../../packages/kernel/dist/g6/native.js';

const transport = new WorkerTransport();
await transport.start();
const channel = new WorkerSDKChannel(transport, 5000);
let selected;
let raced = false;
transport.onFrame = (endpoint, frame) => {
  if (frame.tag !== 'request' || frame.body.kind !== 'invoke')
    throw Error('unexpected isolation request');
  const body = frame.body;
  const reply = (value) =>
    channel.send(endpoint, {
      tag: 'response',
      body: {
        kind: 'invoke',
        wireId: body.wireId,
        response: {
          requestId: body.call.requestId,
          result: { kind: 'success', value },
        },
      },
    });
  if (body.call.payload === 'expire') {
    selected = endpoint;
    // Deliberately put the worker clock ahead of the broker-selected deadline.
    // The real pump must abort work, but only the broker may retire its socket.
    Object.defineProperty(endpoint, 'end', { value: performance.now() - 1 });
  } else if (
    ['reply-race', 'mutation-race', 'scope-check-race'].includes(
      body.call.payload,
    )
  ) {
    selected = endpoint;
    reply('close-now');
    // Remain in this dispatch: prevent the worker pump from consuming EOF.
    // Wait for real broker closure, then exercise the actual native write race.
    const end = performance.now() + 2000;
    while (!(native.poll([endpoint.stream.lease], 2)[0] & 16)) {
      if (performance.now() >= end) throw Error('broker closure not observed');
    }
    if (body.call.payload === 'mutation-race') {
      // Unlike a terminal invocation reply, an unanswered SDK effect-release
      // must still fail the physical session through its pending-RPC ledger.
      void channel
        .run(endpoint, () =>
          channel.request(
            { kind: 'effect-release', effectId: 'unanswered-effect' },
            ['effect-released'],
            'unanswered-effect',
          ),
        )
        .catch(() => {});
    } else if (body.call.payload === 'scope-check-race') {
      let code;
      try {
        channel.run(endpoint, () =>
          channel.sync(
            {
              kind: 'scope-check',
              scopeId: transport.accepted.body.rootScopeId,
              scopeGeneration: transport.accepted.body.scopeGeneration,
            },
            ['ack'],
          ),
        );
      } catch (error) {
        code = error.code;
      }
      if (code !== 'CANCELLED')
        throw Error('scope observation was not rejected');
      raced = true;
    } else {
      reply('late');
      raced = true;
    }
  } else if (body.call.payload === 'unexpected-eof') {
    transport.closeEndpoint(endpoint, 'UNAVAILABLE');
  } else {
    reply(
      JSON.stringify({
        raced,
        aborted: selected?.controller.signal.aborted ?? false,
        reason: selected?.controller.signal.reason ?? null,
        closed: selected?.stream.closed ?? false,
        contexts: transport.contexts.size,
      }),
    );
  }
};
