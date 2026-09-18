// Explicit versioned local admin client. One attempt only; never fallback/replay.
import { connect } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse, canonical, check } from '@alica/acap-contracts';
const schema = JSON.parse(
  readFileSync(
    new URL('../docs/g7/draft/contracts.schema.json', import.meta.url),
  ),
);
const limits = JSON.parse(
  readFileSync(new URL('../docs/g7/draft/limits.json', import.meta.url)),
);
const ajv = new Ajv2020({ strict: true });
ajv.addSchema(schema);
const validators = Object.fromEntries(
  [1, 2].map((version) => [
    version,
    Object.fromEntries(
      ['Request', 'Response'].map((kind) => [
        kind,
        ajv.compile({
          $ref:
            schema.$id + '#/$defs/admin' + kind + (version === 2 ? 'V2' : ''),
        }),
      ]),
    ),
  ]),
);
export function adminRequest(root, version, request) {
  check(version === 1 || version === 2, 'INVALID_ARGUMENT');
  check(
    validators[version].Request(JSON.parse(canonical(request))),
    'INVALID_ARGUMENT',
  );
  const body = Buffer.from(canonical(request));
  check(body.length <= limits.adminFrameBytes, 'INVALID_ARGUMENT');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return new Promise((resolve, reject) => {
    const socket = connect(
      join(root, 'supervision', version === 1 ? 'admin.sock' : 'admin-v2.sock'),
    );
    let data = Buffer.alloc(0),
      settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(Object.assign(error, { outcome: 'UNKNOWN_OUTCOME' }));
      else resolve(value);
    };
    // Absolute client budget, not an inactivity timer. Server independently clocks admission.
    const timer = setTimeout(
      () => finish(new Error('admin deadline; no retry authority')),
      limits.adminTimeoutMs,
    );
    socket.on('error', (e) => finish(e));
    socket.on('connect', () => socket.end(Buffer.concat([header, body])));
    socket.on('data', (bytes) => {
      data = Buffer.concat([data, bytes]);
      if (
        data.length > limits.adminFrameBytes + 4 ||
        (data.length >= 4 &&
          (data.readUInt32BE() === 0 ||
            data.readUInt32BE() > limits.adminFrameBytes ||
            data.length > data.readUInt32BE() + 4))
      )
        finish(new Error('invalid admin frame'));
    });
    socket.on('end', () => {
      try {
        check(data.length >= 4 && data.readUInt32BE() === data.length - 4);
        const value = parse(data.subarray(4), limits.adminFrameBytes);
        check(validators[version].Response(JSON.parse(canonical(value))));
        check(
          value.requestId === request.requestId &&
            value.incarnation === request.incarnation,
        );
        finish(null, value);
      } catch (error) {
        finish(error);
      }
    });
    socket.on('close', () => {
      if (!settled)
        finish(new Error('admin closed without certified response'));
    });
  });
}
