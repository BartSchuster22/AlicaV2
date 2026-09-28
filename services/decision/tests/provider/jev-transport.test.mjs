import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, symlinkSync, mkdirSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { initializeLedger, inspectLedger, reserved } from '../../providers/typesafe-jev/ledger.mjs';
import { createTransport, boundedHTTPS } from '../../providers/typesafe-jev/transport.mjs';
const secret = 'DISPOSABLE_SECRET_CANARY', state = 'DISPOSABLE_STATE_CANARY';
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'phase4-disposable-')); chmodSync(dir, 0o700);
  const keyFile = join(dir, 'fixture-key'), ledgerFile = join(dir, 'ledger.jsonl');
  writeFileSync(keyFile, secret + '\n', { mode: 0o600 }); initializeLedger(ledgerFile);
  return { dir, keyFile, ledgerFile, close: () => rmSync(dir, { recursive: true, force: true }) };
}
function primitive({ status = 200, text = '{}', mode, type = 'application/json' } = {}) {
  const calls = [];
  const requestImpl = (options, callback) => {
    const req = new EventEmitter(); req.destroy = () => { req.destroyed = true; };
    req.end = body => {
      calls.push({ options, body });
      queueMicrotask(() => {
        if (mode === 'wait') return;
        if (mode === 'network') { req.emit('error', new Error(secret + state)); return; }
        const res = new EventEmitter(); res.statusCode = status; res.headers = { 'content-type': type, location: 'https://never-follow.invalid/' };
        res.destroy = () => { res.destroyed = true; };
        callback(res);
        if (res.destroyed) return;
        if (mode === 'aborted') { res.emit('aborted'); return; }
        res.emit('data', Buffer.from(text)); res.emit('end');
      });
    };
    return req;
  };
  return { calls, requestImpl };
}
const ctx = () => ({ signal: new AbortController().signal, deadlineMs: Date.now() + 1000 });
function privateError(code) { return e => { assert.equal(e.code, code); assert(!String(e.stack).includes(secret)); assert(!String(e.stack).includes(state)); assert.equal(e.cause, undefined); return true; }; }
test('J14/J18 ledger is explicit, fail-closed, durable before dispatch and never replenished', async () => {
  const f = fixture();
  try {
    assert.throws(() => initializeLedger(f.ledgerFile), { code: 'FAILED_PRECONDITION' });
    for (const kind of ['discovery','noul','choice','score','mixed','validation']) {
      await reserved(f.ledgerFile, kind, async ({ slot }) => {
        assert.equal(inspectLedger(f.ledgerFile).consumed, slot); // disk read before simulated send
        assert.equal(inspectLedger(f.ledgerFile).attempts.at(-1).outcome, 'AMBIGUOUS_OR_PENDING');
      });
    }
    assert.equal(inspectLedger(f.ledgerFile).remaining, 0);
    await assert.rejects(reserved(f.ledgerFile, 'noul', () => assert.fail('No dispatch')), { code: 'RESOURCE_EXHAUSTED' });
    assert.equal(inspectLedger(f.ledgerFile).consumed, 6);
  } finally { f.close(); }
});
test('J18 ambiguity consumes slot, repeated matrix kind blocked; missing/corrupt ledgers fail closed', async () => {
  const f = fixture();
  try {
    await assert.rejects(reserved(f.ledgerFile, 'noul', () => { throw new Error(secret + state); }), privateError('UNAVAILABLE'));
    assert.equal(inspectLedger(f.ledgerFile).consumed, 1);
    assert.equal(inspectLedger(f.ledgerFile).attempts[0].outcome, 'UNAVAILABLE');
    await assert.rejects(reserved(f.ledgerFile, 'noul', () => assert.fail()), { code: 'RESOURCE_EXHAUSTED' });
    await assert.rejects(reserved(join(f.dir, 'missing'), 'noul', () => assert.fail()), { code: 'FAILED_PRECONDITION' });
    appendFileSync(f.ledgerFile, '{broken');
    assert.throws(() => inspectLedger(f.ledgerFile), { code: 'FAILED_PRECONDITION' });
  } finally { f.close(); }
});
test('J14/J18 singleflight retains lock during whole request; stale lock never auto-cleared', async () => {
  const f = fixture();
  try {
    let release; const first = reserved(f.ledgerFile, 'noul', () => new Promise(r => { release = r; }));
    await assert.rejects(reserved(f.ledgerFile, 'choice', () => assert.fail()), { code: 'RESOURCE_EXHAUSTED' });
    release(); await first; assert.equal(inspectLedger(f.ledgerFile).consumed, 1);
    mkdirSync(f.ledgerFile + '.lock', { mode: 0o700 });
    await assert.rejects(reserved(f.ledgerFile, 'choice', () => assert.fail()), { code: 'RESOURCE_EXHAUSTED' });
    assert.equal(inspectLedger(f.ledgerFile).consumed, 1);
  } finally { f.close(); }
});
test('J14/J16/J22 exact endpoint/Bearer/JSON, key reference scoped to request, no secret/state in ledger', async () => {
  const f = fixture(), p = primitive({ text: '{"ok":true}' });
  try {
    const transport = createTransport({ ...f, requestImpl: p.requestImpl });
    assert.equal(await transport.send({ kind: 'noul', body: JSON.stringify({ state }), ...ctx() }), '{"ok":true}');
    assert.equal(await transport.send({ kind: 'discovery', ...ctx() }), '{"ok":true}');
    assert.equal(p.calls.length, 2);
    const o = p.calls[0].options;
    assert.equal(o.hostname, 'api.typesafe.ai'); assert.equal(o.path, '/v1/systemone');
    assert.equal(o.method, 'POST'); assert.equal(o.agent, false);
    assert.equal(o.headers.authorization, 'Bearer ' + secret);
    assert.equal(p.calls[1].options.path, '/v1/models'); assert.equal(p.calls[1].options.method, 'GET');
    const ledger = readFileSync(f.ledgerFile, 'utf8'); assert(!ledger.includes(secret)); assert(!ledger.includes(state));
    assert(!JSON.stringify(transport).includes(secret));
  } finally { f.close(); }
});
test('J16 absent/insecure/symlink secret and unsafe directory fail before reservation/send', async () => {
  for (const mode of ['missing','permissions','symlink','directory']) {
    const f = fixture(), p = primitive();
    try {
      if (mode === 'missing') rmSync(f.keyFile);
      if (mode === 'permissions') chmodSync(f.keyFile, 0o644);
      if (mode === 'symlink') { rmSync(f.keyFile); writeFileSync(join(f.dir,'target'), secret, { mode: 0o600 }); symlinkSync(join(f.dir,'target'), f.keyFile); }
      if (mode === 'directory') chmodSync(f.dir, 0o755);
      await assert.rejects(createTransport({ ...f, requestImpl: p.requestImpl }).send({ kind: 'noul', body: '{}', ...ctx() }), privateError('UNAUTHENTICATED'));
      chmodSync(f.dir, 0o700); assert.equal(inspectLedger(f.ledgerFile).consumed, 0); assert.equal(p.calls.length, 0);
    } finally { f.close(); }
  }
});
test('J14/J21/J22 auth/validation/rate/5xx/redirect responses normalized without retaining body or retry', async () => {
  for (const [status, code] of [[401,'UNAUTHENTICATED'],[403,'PERMISSION_DENIED'],[404,'NOT_FOUND'],[400,'INVALID_ARGUMENT'],[422,'INVALID_ARGUMENT'],[429,'RESOURCE_EXHAUSTED'],[500,'UNAVAILABLE'],[503,'UNAVAILABLE'],[302,'UNAVAILABLE']]) {
    const f = fixture(), p = primitive({ status, text: secret + state });
    try {
      await assert.rejects(createTransport({ ...f, requestImpl: p.requestImpl }).send({ kind: 'noul', body: '{}', ...ctx() }), privateError(code));
      assert.equal(p.calls.length, 1); assert.equal(inspectLedger(f.ledgerFile).consumed, 1);
      assert.equal(inspectLedger(f.ledgerFile).attempts[0].outcome, code);
    } finally { f.close(); }
  }
});
test('J14 network/aborted response never replayed and consumes physical reservation', async () => {
  for (const mode of ['network','aborted']) {
    const f = fixture(), p = primitive({ mode });
    try {
      await assert.rejects(createTransport({ ...f, requestImpl: p.requestImpl }).send({ kind: 'choice', body: '{}', ...ctx() }), privateError('UNAVAILABLE'));
      assert.equal(p.calls.length, 1); assert.equal(inspectLedger(f.ledgerFile).consumed, 1);
    } finally { f.close(); }
  }
});
test('J15 shorter deadlines/cancellation bounded; pre-cancelled requests do not consume slots', async () => {
  for (const mode of ['deadline','cancel','pre-cancel']) {
    const f = fixture(), p = primitive({ mode: 'wait' }), controller = new AbortController();
    try {
      if (mode === 'pre-cancel') controller.abort();
      const pending = createTransport({ ...f, requestImpl: p.requestImpl }).send({ kind: 'noul', body: '{}', signal: controller.signal, deadlineMs: Date.now() + (mode === 'deadline' ? 15 : 1000) });
      if (mode === 'cancel') setTimeout(() => controller.abort(), 5);
      await assert.rejects(pending, privateError(mode === 'deadline' ? 'DEADLINE_EXCEEDED' : 'CANCELLED'));
      assert.equal(p.calls.length, mode === 'pre-cancel' ? 0 : 1);
      assert.equal(inspectLedger(f.ledgerFile).consumed, mode === 'pre-cancel' ? 0 : 1);
    } finally { f.close(); }
  }
});
test('J21 bounded bytes/content-type/UTF8 defenses; no real network in fixture suite', async () => {
  for (const [text,type] of [['x'.repeat(131073),'application/json'],['{}','text/html'],[Buffer.from([0xff]),'application/json']]) {
    const p = primitive({ text, type });
    await assert.rejects(boundedHTTPS({ method: 'POST', body: '{}', key: secret, ...ctx() }, p.requestImpl), privateError('CONTRACT_MISMATCH'));
    assert.equal(p.calls.length, 1);
  }
});
