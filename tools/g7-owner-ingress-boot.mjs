// Trusted isolated composition ONLY. Import is inert; no endpoint/default boot.
// Same canonical singleton as g7-cell-rotation.mjs. No identity/config seams.
import { createOwnerCheckpointReceiver, stopOwnerCheckpointReceiver } from './g7-owner-ingress.mjs';
import { setTimeout, clearTimeout } from 'node:timers';
let claimed = false;
const failure = code => Object.assign(new Error(code), { code });
// One attempt per process/module lifetime, including failed/cancelled attempts.
// Caller must await ready and close; cleanup uncertainty requires process reap.
export function bootOwnerCheckpointIngress(path) {
  if (claimed) throw failure('OWNER_INGRESS_ALREADY_BOOTED');
  claimed = true; // synchronous exclusion, before construction/listen/await
  let server;
  try {
    // Null/invalid trusted config rejects before listen, even under TLS mocks.
    server = createOwnerCheckpointReceiver();
    if (typeof path !== 'string' || !path.startsWith('/') ||
        path.includes('\0') || Buffer.byteLength(path) > 104)
      throw failure('OWNER_INGRESS_ENDPOINT_INVALID');
  } catch (error) {
    stopOwnerCheckpointReceiver();
    if (server) { try { server.close(); } catch {} }
    throw error;
  }
  const abort = new AbortController();
  let terminal = false, readyDone = false, closing, bindTimer;
  let transportClosed = false, finishClose;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // An immediate close/error can precede the caller attaching its ready handler.
  ready.catch(() => {});
  const denyReady = error => {
    if (!readyDone) { readyDone = true; clearTimeout(bindTimer); rejectReady(error); }
  };
  const close = () => {
    if (closing) return closing;
    terminal = true;
    stopOwnerCheckpointReceiver(); // revoke BEFORE asynchronous transport teardown
    denyReady(failure('OWNER_INGRESS_CLOSED'));
    let resolveClose, rejectClose;
    closing = new Promise((resolve, reject) => { resolveClose = resolve; rejectClose = reject; });
    closing.catch(() => {});
    let done = false;
    const timer = setTimeout(() => finish(failure('OWNER_INGRESS_CLOSE_TIMEOUT')), 2000);
    const finish = error => {
      if (done) return;
      done = true; clearTimeout(timer);
      finishClose = undefined;
      if (error) rejectClose(error); else resolveClose();
    };
    // Completion is observed independently of close(callback): Node's signal
    // handler synchronously clears the handle, but emits close asynchronously.
    finishClose = finish;
    if (transportClosed) { finish(); return closing; }
    try {
      abort.abort(); // initiation/cancellation is NOT proof of completion
      // Normally the signal handler has already initiated close. Only request
      // an explicit close if the public state still proves a live listener.
      if (!transportClosed && server.listening)
        server.close(error => { if (error) finish(error); });
    } catch (error) { finish(error); }
    return closing;
  };
  server.on('error', error => {
    denyReady(error);
    if (closing) finishClose?.(error); else void close();
  });
  // Installed BEFORE listen/abort, including unsolicited transport completion.
  server.on('close', () => {
    transportClosed = true;
    finishClose?.();
    void close();
  });
  server.on('listening', () => {
    if (terminal) return;
    readyDone = true; clearTimeout(bindTimer); resolveReady();
  });
  bindTimer = setTimeout(() => {
    denyReady(failure('OWNER_INGRESS_BIND_TIMEOUT')); void close();
  }, 2000);
  try { server.listen({ path, signal: abort.signal }); }
  catch (error) { denyReady(error); void close(); }
  return Object.freeze({ ready, close });
}
