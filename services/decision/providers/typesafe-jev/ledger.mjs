// One explicitly initialized, durable aggregate ledger. No automatic creation,
// reset, refill, stale-lock recovery or ambiguous-attempt retry.
import { constants, openSync, closeSync, readFileSync, writeSync, fsyncSync, mkdirSync, rmdirSync, lstatSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { invalid } from '../../provider/decimal.mjs';
export const MAX_PHYSICAL_LIVE_REQUESTS = 6;
const header = { schema: 'alica.phase4.physical-budget/v1', max: 6, timeoutMs: 30000, retries: 0 };
const kinds = new Set(['discovery','noul','choice','score','mixed','validation']);
export const ORIGINAL_LEDGER_SHA256 = 'd355a3b72815f972601d20629502001ebcddf6f199878bfcd790451911e95a84';
export const ORIGINAL_LEDGER_BYTES = 194;
const codes = new Set(['OK','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','INVALID_ARGUMENT','CONTRACT_MISMATCH','RESOURCE_EXHAUSTED','UNAVAILABLE','CANCELLED','DEADLINE_EXCEEDED','FAILED_PRECONDITION']);
function directory(file) {
  if (!isAbsolute(file)) invalid('FAILED_PRECONDITION');
  const s = lstatSync(dirname(file));
  if (!s.isDirectory() || s.uid !== process.getuid() || (s.mode & 0o777) !== 0o700) invalid('FAILED_PRECONDITION');
}
function syncDir(file) { const fd = openSync(dirname(file), constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); } }
function fileDescriptor(file, flags) {
  directory(file);
  const s = lstatSync(file);
  if (!s.isFile() || s.uid !== process.getuid() || (s.mode & 0o777) !== 0o600 || s.size > 16384) invalid('FAILED_PRECONDITION');
  return openSync(file, flags | constants.O_NOFOLLOW);
}
export function initializeLedger(file) {
  // Operator invokes exactly once. Existing file (even empty/corrupt) fails closed.
  try {
    directory(file);
    const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { writeSync(fd, JSON.stringify(header) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
    syncDir(file);
  } catch { invalid('FAILED_PRECONDITION'); }
}
export function inspectLedger(file) {
  try {
    const fd = fileDescriptor(file, constants.O_RDONLY);
    let text; try { text = readFileSync(fd, 'utf8'); } finally { closeSync(fd); }
    if (!text.endsWith('\n')) invalid();
    const rows = text.trimEnd().split('\n').map(s => JSON.parse(s));
    if (JSON.stringify(rows.shift()) !== JSON.stringify(header)) invalid();
    const attempts = [], finished = new Set();
    for (const r of rows) {
      if (r.event === 'reserve') {
        if (Object.keys(r).sort().join() !== 'event,kind,slot,timeMs' || r.slot !== attempts.length + 1 || (!kinds.has(r.kind) && r.kind !== 'discovery-diagnostic') || attempts.some(a => a.kind === r.kind) || !Number.isSafeInteger(r.timeMs)) invalid();
        if (r.kind === 'discovery-diagnostic' && (r.slot !== 2 || attempts[0]?.kind !== 'discovery' || attempts[0]?.outcome !== 'OK')) invalid();
        attempts.push({ ...r, outcome: 'AMBIGUOUS_OR_PENDING' });
      } else {
        if (Object.keys(r).sort().join() !== 'code,event,slot' || r.event !== 'finish' || !attempts[r.slot - 1] || finished.has(r.slot) || !codes.has(r.code)) invalid();
        finished.add(r.slot); attempts[r.slot - 1].outcome = r.code;
      }
    }
    if (attempts.length > 6) invalid();
    return { ...header, consumed: attempts.length, remaining: 6 - attempts.length, attempts };
  } catch { invalid('FAILED_PRECONDITION'); }
}
function append(file, record) {
  const fd = fileDescriptor(file, constants.O_WRONLY | constants.O_APPEND);
  try { const b = Buffer.from(JSON.stringify(record) + '\n'); if (writeSync(fd, b) !== b.length) invalid('FAILED_PRECONDITION'); fsyncSync(fd); }
  finally { closeSync(fd); }
}
export async function reserved(file, kind, work) {
  if (!kinds.has(kind)) invalid('INVALID_ARGUMENT');
  return reserve(file, kind, work, false);
}
// Only the new explicitly authorized diagnostic path calls this. No kind option,
// no general replay: exact historical bytes, slot2 once, original cap unchanged.
export async function reservedDiagnostic(file, work) {
  return reserve(file, 'discovery-diagnostic', work, true);
}
async function reserve(file, kind, work, diagnostic) {
  let held = false;
  try {
    directory(file);
    try { mkdirSync(file + '.lock', { mode: 0o700 }); held = true; syncDir(file); }
    catch { invalid('RESOURCE_EXHAUSTED'); }
    const state = inspectLedger(file);
    if (diagnostic) {
      const fd = fileDescriptor(file, constants.O_RDONLY);
      let bytes; try { bytes = readFileSync(fd); } finally { closeSync(fd); }
      if (bytes.length !== ORIGINAL_LEDGER_BYTES || createHash('sha256').update(bytes).digest('hex') !== ORIGINAL_LEDGER_SHA256 || state.consumed !== 1 || state.attempts[0]?.kind !== 'discovery' || state.attempts[0]?.outcome !== 'OK') invalid('FAILED_PRECONDITION');
    }
    // Once a diagnostic exists, only the remaining four original positive kinds
    // may follow. No validation slot or rediscovery can consume the old grant.
    const diagnosticAttempt = state.attempts.find(a => a.kind === 'discovery-diagnostic');
    if (!diagnostic && diagnosticAttempt) {
      if (!state.remaining) invalid('RESOURCE_EXHAUSTED');
      const fd = fileDescriptor(file, constants.O_RDONLY);
      let bytes; try { bytes = readFileSync(fd); } finally { closeSync(fd); }
      if (createHash('sha256').update(bytes.subarray(0, ORIGINAL_LEDGER_BYTES)).digest('hex') !== ORIGINAL_LEDGER_SHA256 || state.attempts.slice(1).some(a => a.outcome !== 'OK') || kind !== ['noul','choice','score','mixed'][state.consumed - 2]) invalid('FAILED_PRECONDITION');
    }
    if (!state.remaining || state.attempts.some(a => a.kind === kind)) invalid('RESOURCE_EXHAUSTED');
    const slot = state.consumed + 1;
    append(file, { event: 'reserve', kind, slot, timeMs: Date.now() }); // fsync BEFORE work may send
    let result, code = 'OK';
    try { result = await work({ slot }); }
    catch (e) { code = codes.has(e?.code) && e.code !== 'OK' ? e.code : 'UNAVAILABLE'; }
    append(file, { event: 'finish', slot, code });
    if (code !== 'OK') invalid(code);
    return result;
  } catch (e) { invalid(codes.has(e?.code) && e.code !== 'OK' ? e.code : 'FAILED_PRECONDITION'); }
  finally { if (held) { rmdirSync(file + '.lock'); syncDir(file); } }
}
