import https from 'node:https';
import { constants, openSync, closeSync, fstatSync, lstatSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { reserved, reservedDiagnostic } from './ledger.mjs';
import { diagnosticBody } from './discovery-diagnostic.mjs';
// Explicit owner-authorized slot2 only, never selected by ordinary send().
export async function runDiscoveryDiagnostic({keyFile,ledgerFile,signal,deadlineMs,beforeSend,requestImpl=https.request}) {
  try {
    if(typeof beforeSend!=='function')invalid('FAILED_PRECONDITION');
    if(signal?.aborted)invalid('CANCELLED');
    if(!Number.isFinite(deadlineMs)||deadlineMs<=Date.now())invalid('DEADLINE_EXCEEDED');
    const key=readKey(keyFile);
    return await reservedDiagnostic(ledgerFile,async()=>{
      await beforeSend();
      const text=await boundedHTTPS({method:'GET',key,signal,deadlineMs},requestImpl);
      return diagnosticBody(text,value=>value.includes(key));
    });
  }catch(e){invalid(allowedCodes.has(e?.code)?e.code:'UNAVAILABLE');}
}
import { invalid } from '../../provider/decimal.mjs';
const allowedCodes = new Set(['UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','INVALID_ARGUMENT','CONTRACT_MISMATCH','RESOURCE_EXHAUSTED','UNAVAILABLE','CANCELLED','DEADLINE_EXCEEDED','FAILED_PRECONDITION']);
const failure = code => Object.assign(new Error(code), { code });
function readKey(file) {
  try {
    const dir = lstatSync(dirname(file));
    if (!dir.isDirectory() || dir.uid !== process.getuid() || (dir.mode & 0o777) !== 0o700) invalid();
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    let key;
    try {
      const s = fstatSync(fd);
      if (!s.isFile() || s.uid !== process.getuid() || (s.mode & 0o777) !== 0o600 || s.size < 1 || s.size > 4096) invalid();
      key = readFileSync(fd, 'utf8').trim();
    } finally { closeSync(fd); }
    if (!/^[\x21-\x7e]{1,4096}$/.test(key)) invalid();
    return key;
  } catch { invalid('UNAUTHENTICATED'); }
}
export function statusCode(status) {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'PERMISSION_DENIED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 400 || status === 422) return 'INVALID_ARGUMENT';
  if (status === 429) return 'RESOURCE_EXHAUSTED';
  return 'UNAVAILABLE';
}
// Node HTTPS performs exactly one request; no redirect handler, fetch layer,
// retry agent or pooled socket replay. Injection is solely a fixture seam for
// Node's request primitive, not a request-controlled endpoint option.
export function boundedHTTPS({ method, body, key, signal, deadlineMs }, requestImpl = https.request) {
  return new Promise((resolve, reject) => {
    const remaining = Math.min(30000, deadlineMs - Date.now());
    if (!Number.isFinite(remaining) || remaining <= 0) { reject(failure('DEADLINE_EXCEEDED')); return; }
    if (signal?.aborted) { reject(failure('CANCELLED')); return; }
    if (!['GET','POST'].includes(method) || (method === 'POST' && (typeof body !== 'string' || Buffer.byteLength(body) > 131072))) { reject(failure('INVALID_ARGUMENT')); return; }
    let req, res, timer, done = false;
    const finish = (code, text) => {
      if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (code) { res?.destroy(); req?.destroy(); reject(failure(code)); } else resolve(text);
    };
    const abort = () => finish('CANCELLED');
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish('DEADLINE_EXCEEDED'), remaining);
    try {
      req = requestImpl({ protocol: 'https:', hostname: 'api.typesafe.ai', port: 443,
        path: method === 'GET' ? '/v1/models' : '/v1/systemone', method, agent: false,
        headers: { authorization: 'Bearer ' + key, accept: 'application/json',
          ...(method === 'POST' ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}) } }, response => {
        res = response;
        if (done) { res.destroy(); return; }
        res.on('error', () => finish('UNAVAILABLE'));
        res.on('aborted', () => finish('UNAVAILABLE'));
        if (res.statusCode !== 200) { finish(statusCode(res.statusCode)); return; }
        if (!/^application\/json(?:\s*;|$)/i.test(String(res.headers['content-type'] || ''))) { finish('CONTRACT_MISMATCH'); return; }
        const chunks = []; let bytes = 0;
        res.on('data', chunk => {
          if (done) return; bytes += chunk.length;
          if (bytes > 131072) { finish('CONTRACT_MISMATCH'); return; }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (done) return;
          try { finish(null, new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
          catch { finish('CONTRACT_MISMATCH'); }
        });
      });
      req.on('error', () => finish('UNAVAILABLE'));
      req.end(method === 'POST' ? body : undefined);
    } catch { finish('UNAVAILABLE'); }
  });
}
export function createTransport({ keyFile, ledgerFile, requestImpl = https.request }) {
  if (typeof keyFile !== 'string' || typeof ledgerFile !== 'string') invalid('INVALID_ARGUMENT');
  return Object.freeze({
    async send({ kind, body, signal, deadlineMs }) {
      try {
        if (signal?.aborted) invalid('CANCELLED');
        if (!Number.isFinite(deadlineMs) || deadlineMs <= Date.now()) invalid('DEADLINE_EXCEEDED');
        // Secret reference read here, inside the request process only. No export,
        // cache, subprocess argument, logger, error cause or evidence retains it.
        const key = readKey(keyFile);
        return await reserved(ledgerFile, kind, () => boundedHTTPS({ method: kind === 'discovery' ? 'GET' : 'POST', body, key, signal, deadlineMs }, requestImpl));
      } catch (e) { invalid(allowedCodes.has(e?.code) ? e.code : 'UNAVAILABLE'); }
    },
  });
}
