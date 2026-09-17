// Operator-selected fault dispatcher, never a package/public SDK import.
// Uses the production bootstrap and final native seal; mutations happen on real
// child-owned sockets, not calls to broker dispatch methods.
import { WorkerTransport } from '../../packages/kernel/dist/g6/worker-transport.js';
import { native } from '../../packages/kernel/dist/g6/native.js';
import { canonical } from '@alica/acap-contracts';
import { fstatSync } from 'node:fs';

const transport = new WorkerTransport();
const mode = transport.capsule.hello.instanceId;
// Stop actual recvmsg consumption, leaving SCM_RIGHTS queued in the carrier.
if (mode === 'offer-starvation') native.receiveOffer = () => null;
if (mode === 'write-stall') {
  const read = native.read;
  native.read = (lease, size) =>
    lease === transport.control.lease ? read(lease, size) : null;
}
const send = transport.control.send.bind(transport.control);
function raw(lease, value) {
  const body = Buffer.from(canonical(value));
  const bytes = Buffer.alloc(body.length + 4);
  bytes.writeUInt32BE(body.length);
  body.copy(bytes, 4);
  if (native.write(lease, bytes) !== bytes.length)
    throw Error('fault write incomplete');
}
transport.control.send = (frame) => {
  if (frame.tag === 'hello') {
    frame = structuredClone(frame);
    if (mode === 'forged-name') frame.body.providerId = 'org.alica.forged';
    if (mode === 'forged-digest')
      frame.body.packageDigest = 'sha256:' + '0'.repeat(64);
    if (mode === 'hello-contract-digest')
      frame.body.contracts[0].descriptorDigest = 'sha256:' + '0'.repeat(64);
    if (mode === 'hello-contract-duplicate')
      frame.body.contracts.push({ ...frame.body.contracts[0] });
    if (mode === 'forged-publisher') frame.body.publisher = 'org.alica.forged';
    if (mode === 'stale-challenge') frame.body.challenge = '0'.repeat(64);
    if (mode === 'stale-generation') frame.generation++;
    if (mode === 'forged-publisher') return raw(transport.control.lease, frame);
  }
  if (mode === 'heartbeat-stall' && frame.tag === 'pong') return;
  if (mode === 'offer-starvation' && frame.body?.kind === 'context-ready')
    return;
  return send(frame);
};
transport.onFailure = () => {
  process.exitCode = 1;
};
transport.onFrame = (endpoint, frame) => {
  if (frame.tag !== 'request' || frame.body.kind !== 'invoke') return;
  let fds = 0;
  let measurementError;
  // The final native seal sets hard RLIMIT_NOFILE=64. Count real open FDs,
  // not the inaccessible /proc/<non-dumpable child>/fd directory.
  for (let fd = 0; fd < 64; fd++) {
    try {
      fstatSync(fd);
      fds++;
    } catch (error) {
      if (error.code !== 'EBADF') {
        measurementError = { fd, code: error.code, message: error.message };
        break;
      }
    }
  }
  endpoint.stream.send({
    schemaVersion: 'acap.ipc/v1',
    tag: 'response',
    sessionId: transport.capsule.sessionId,
    generation: transport.capsule.generation,
    contextId: endpoint.offer.contextId,
    sequence: 1,
    body: {
      kind: 'invoke',
      wireId: frame.body.wireId,
      response: {
        requestId: frame.body.call.requestId,
        result: {
          kind: 'success',
          value: JSON.stringify({
            pid: process.pid,
            measurementError,
            fds,
            scannedFDLimit: 64,
            sentinelPresent: Object.hasOwn(
              process.env,
              'G6_SYNTHETIC_QUALIFICATION_SENTINEL',
            ),
          }),
        },
      },
    },
  });
};
transport.onOffer = attackOffer;
await transport.start();
if (mode === 'exit') process.exit(37);
if (mode === 'unresponsive') {
  for (;;) {}
}
if (mode === 'partial-control')
  native.write(transport.control.lease, Buffer.from([0, 0]));
if (mode === 'malformed-control')
  native.write(transport.control.lease, Buffer.from([0, 0, 0, 1, 123]));
if (mode === 'replayed-control') {
  const ping = {
    schemaVersion: 'acap.ipc/v1',
    tag: 'ping',
    sessionId: transport.capsule.sessionId,
    generation: transport.capsule.generation,
    contextId: 'control',
    sequence: transport.nextControlSequence(),
    body: { nonce: 'a'.repeat(64) },
  };
  raw(transport.control.lease, ping);
  raw(transport.control.lease, ping);
}
function attackOffer(endpoint) {
  if (mode === 'partial-work')
    native.write(endpoint.stream.lease, Buffer.from([0, 0]));
  if (mode === 'malformed-work')
    native.write(endpoint.stream.lease, Buffer.from([0, 0, 0, 1, 123]));
  if (mode === 'retargeted-work')
    raw(endpoint.stream.lease, {
      schemaVersion: 'acap.ipc/v1',
      tag: 'request',
      sessionId: transport.capsule.sessionId,
      generation: transport.capsule.generation,
      contextId: 'c999999',
      sequence: 1,
      body: {
        kind: 'scope-check',
        wireId: 1,
        scopeId: transport.accepted.body.rootScopeId,
        scopeGeneration: transport.accepted.body.scopeGeneration,
      },
    });
}
