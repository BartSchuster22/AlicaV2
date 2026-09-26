// Trusted isolated Cell/control-plane process ONLY, never a candidate process.
import tls from 'node:tls';
import { createHash } from 'node:crypto';
import config from './g7-owner-ingress-config.mjs';
const MAX_FRAME = 2048, MAX_RECORDS = 64;
const purpose = 'historical rotation pins only';
const anchors = 'genesis/latest/expected independently established';
const grammar = /^explicit owner confirmation\nCellID=([A-Za-z0-9][A-Za-z0-9_-]{0,127})\nSHA256=(sha256:[0-9a-f]{64})\npurpose=historical rotation pins only\ngenesis\/latest\/expected independently established$/;
function transportIdentity(socket) {
  // Identity comes from the established TLS session, NEVER the frame.
  if (!(socket instanceof tls.TLSSocket) || !socket.encrypted ||
      !socket.authorized || socket.isSessionReused()) throw Error('unauthenticated transport');
  const raw = socket.getPeerCertificate(true)?.raw;
  if (!Buffer.isBuffer(raw) || !raw.length) throw Error('missing peer certificate');
  return createHash('sha256').update(raw).digest('hex');
}
// Factory is a trusted composition seam, not an exposed candidate API. Tests
// explicitly inject a mock identity reader; production singleton never does.
export function createIngress(trustedConfig, identify = transportIdentity) {
  const records = new Map();
  let active = 0;
  const valid = trustedConfig && typeof trustedConfig.gatewayCertificateSHA256 === 'string' &&
    trustedConfig.gatewayCertificateSHA256.length === 64 && /^[0-9a-f]{64}$/.test(trustedConfig.gatewayCertificateSHA256) &&
    Number.isSafeInteger(trustedConfig.gatewayUID) && trustedConfig.gatewayUID >= 0 &&
    Number.isSafeInteger(trustedConfig.receiverUID) && trustedConfig.receiverUID >= 0 &&
    typeof process.getuid === 'function' && process.getuid() === trustedConfig.receiverUID &&
    Number.isSafeInteger(trustedConfig.candidateUID) && trustedConfig.candidateUID >= 0 &&
    new Set([trustedConfig.gatewayUID, trustedConfig.receiverUID, trustedConfig.candidateUID]).size === 3;
  // UID declarations don't prove isolation; deployment must enforce them. TLS
  // identity and protected credential/code custody are both prerequisites.
  const pin = valid ? trustedConfig.gatewayCertificateSHA256 : null;
  const read = (cellId, digest) => pin ? records.get(cellId + '\n' + digest) : undefined;
  const handle = (socket) => {
    let ended = false, data = Buffer.alloc(0);
    const close = () => { if (!ended) { ended = true; active--; socket.destroy(); } };
    if (!pin || active >= 1) { socket.destroy(); return; }
    active++;
    try { if (identify(socket) !== pin) { close(); return; } } catch { close(); return; }
    socket.setTimeout(2000, close);
    socket.on('error', close); socket.on('close', close);
    socket.on('data', chunk => {
      if (ended) return;
      if (!Buffer.isBuffer(chunk) || data.length + chunk.length > MAX_FRAME + 4) { close(); return; }
      data = Buffer.concat([data, chunk]);
      if (data.length >= 4 && (data.readUInt32BE(0) === 0 || data.readUInt32BE(0) > MAX_FRAME ||
          data.length > data.readUInt32BE(0) + 4)) close();
    });
    // One length-prefixed ASCII message, committed only on TLS EOF. No JSON
    // authority, batches, trailing frames, partial messages, durable storage.
    socket.on('end', () => {
      if (ended) return;
      try {
        if (identify(socket) !== pin || data.length < 4 || data.length !== data.readUInt32BE(0) + 4) return;
        const body = data.subarray(4);
        if (body.some(b => b > 127)) return;
        const m = grammar.exec(body.toString('ascii'));
        // JS $ also matches before a final newline: require exact full length.
        if (!m || m[0].length !== body.length) return;
        const [ , cellId, checkpointDigest ] = m;
        const key = cellId + '\n' + checkpointDigest;
        if (!records.has(key) && records.size >= MAX_RECORDS) return;
        records.set(key, Object.freeze({ authority: 'owner', channel: 'designated-owner-telegram-chat',
          cellId, checkpointDigest, purpose, independentAnchors: anchors,
          confirmationEvidence: 'explicit owner confirmation\nCellID=' + cellId + '\nSHA256=' + checkpointDigest + '\npurpose=' + purpose }));
      } finally { close(); }
    });
  };
  const createServer = (credentials) => {
    if (!pin || !credentials?.key || !credentials?.cert || !credentials?.ca)
      throw Error('OWNER_INGRESS_UNCONFIGURED');
    // Trusted existing credentials only; no keygen/signing, no bind/listen here.
    // Closed TLS options: callers cannot relax mutual peer authentication.
    const server = tls.createServer({ key: credentials.key, cert: credentials.cert,
      ca: credentials.ca, requestCert: true, rejectUnauthorized: true,
      minVersion: 'TLSv1.2', handshakeTimeout: 2000 }, handle);
    server.maxConnections = 1;
    return server;
  };
  return Object.freeze({ handle, read, createServer });
}
const ingress = createIngress(config);
// Deployment TLS server secureConnection callback must use this handler. TLS
// server must requestCert/rejectUnauthorized and protect key/config/code custody.
export const receiveOwnerCheckpointConnection = ingress.handle;
export const lookupOwnerCheckpointConfirmation = ingress.read;

export function createOwnerCheckpointReceiver() {
  return ingress.createServer(config?.tlsCredentials);
}
