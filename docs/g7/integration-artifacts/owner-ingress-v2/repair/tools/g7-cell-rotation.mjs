import { lookupOwnerCheckpointConfirmation } from './g7-owner-ingress.mjs';
// Stopped rotation decision layer. Pure: no IO, Kernel, crypto, clock or grants.
// Structural history and its classifier seam below share this already-packaged
// module; no new runtime dependency or security-policy implementation is added.
// NOT a wire request, authenticated history validator, custody certificate, or
// execution admission. A future ownedRotateRecover must derive every check from
// independently verified, currently held observations, never from request JSON.
// In particular inspectPersistedTrust supplies ONLY the tuple classification;
// historical authentication does NOT supply freshness, replacement eligibility,
// genuine reap/custody, or failure-inclusive lifetime funding.
const fields = [
  'schemaVersion', 'classification', 'phase', 'selection', 'targetState',
  'targetEffects', 'checks',
];
const checkFields = [
  'custodyAndReap', 'authenticatedHistory', 'independentAuthorization',
  'currentTrustFresh', 'floorsAndTime', 'bindingsAndInventory',
  'durabilityCertain', 'lifetimeFit', 'replacementEligible',
  'freshTransaction', 'certifiedTeardown',
];
function closed(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor && descriptor.enumerable;
  });
}
const choices = (value, allowed) => allowed.includes(value);
const result = (disposition) => Object.freeze({
  disposition,
  executionAuthorized: false,
  updateTrust: false,
  activationReplay: false,
});
const unresolved = () => result('NEEDS_OPERATOR');

// Existing non-rotation readers cannot safely omit history or treat the old
// accepted pointer as currently eligible. Reject even an EMPTY marker, before
// reading state, Kernel bootstrap, floor writes, backup capture or construction.
// This does not authenticate absence, bless a stripped backup, or admit a future
// reader. Full-chain backup/restore remains unavailable.
export function requireOrdinaryCellRoot(names) {
  if (!Array.isArray(names) || names.some((name) => typeof name !== 'string') ||
      names.some((name) => name === 'rotations' || name.startsWith('rotations/'))) {
    throw Object.assign(new Error('Rotation history requires a rotation-aware entry'), {
      code: 'FAILED_PRECONDITION',
      runtime: 'NEEDS_OPERATOR',
    });
  }
}

// Closed INTERNAL preflight summary, not proof. No serialized boolean here is
// an authority token. The result is advisory and MUST NOT be passed directly to
// a writer; custody loss invalidates the observation. All effects stay gated.
// phase summarizes a validated immutable chain in PREPARED -> TRUST_COMMITTED
// -> COMPLETE order, with no gaps/branches/retired-root return. This function
// neither constructs that chain nor accepts checksums as its authentication.
export function classifyStoppedRotationRecovery(observation) {
  try {
    if (!closed(observation, fields)) return unresolved();
    const { schemaVersion, classification, phase, selection, targetState,
      targetEffects, checks } = observation;
    if (schemaVersion !== 'alica.cell-rotation-observation/v1' ||
        !choices(classification, ['EXACT_PRIOR', 'EXACT_NEXT', 'UNRESOLVED']) ||
        !choices(phase, ['PREPARED', 'TRUST_COMMITTED', 'COMPLETE']) ||
        !choices(selection, ['PRIOR', 'TARGET', 'OTHER']) ||
        !choices(targetState, ['ABSENT', 'STAGING', 'VERIFIED', 'ACTIVATING',
          'COMMITTED', 'OTHER']) ||
        !choices(targetEffects, ['NONE', 'EARLY', 'ACCEPTED', 'UNKNOWN']) ||
        !closed(checks, checkFields) ||
        !checkFields.every((key) => typeof checks[key] === 'boolean'))
      return unresolved();
    // Separate gates: historical signatures never substitute for current trust
    // or independently delivered authorization. Models cannot prove lifetime fit.
    for (const key of checkFields.slice(0, 8))
      if (!checks[key]) return unresolved();
    if (!checks.certifiedTeardown) return unresolved();

    // ABORTED is legal only with exact prior, unchanged selection, NO target
    // effects and NO committed edge. Never retry updateTrust or roll back.
    if (classification === 'EXACT_PRIOR')
      return result(phase === 'PREPARED' && selection === 'PRIOR' &&
        targetState === 'ABSENT' && targetEffects === 'NONE'
        ? 'ABORT_PRIOR' : 'NEEDS_OPERATOR');
    if (classification !== 'EXACT_NEXT' || !checks.replacementEligible)
      return unresolved();

    if (selection === 'PRIOR' && phase !== 'COMPLETE') {
      const absent = targetState === 'ABSENT' && targetEffects === 'NONE';
      const early = choices(targetState, ['STAGING', 'VERIFIED']) &&
        targetEffects === 'EARLY';
      if (!(absent || early) || !checks.replacementEligible ||
          !checks.freshTransaction) return unresolved();
      // Executor must record any missing TRUST_COMMITTED BEFORE target work,
      // close early journal RECOVERING -> ABORTED (retain files), and bind a NEW
      // transaction for the SAME currently eligible replacement at prior+1.
      // Existing #stage rejects retained release bytes; no workaround here.
      return result('REPLACE_FRESH');
    }
    // PREPARED plus accepted target lacks required committed-edge ordering.
    // Neither accepted bytes nor this classification prove readiness/live calls.
    if (selection === 'TARGET' && targetEffects === 'ACCEPTED' &&
        phase === 'TRUST_COMMITTED' &&
        choices(targetState, ['ACTIVATING', 'COMMITTED']))
      return result('RECONCILE_ACCEPTED');
    if (selection === 'TARGET' && targetEffects === 'ACCEPTED' &&
        phase === 'COMPLETE' && targetState === 'COMMITTED')
      return result('CURRENT_START_SEPARATE');
    return unresolved();
  } catch {
    // Malformed observations/throwing proxies are uncertainty, not repair.
    return unresolved();
  }
}

// INTERNAL candidate record format, not a newly admitted writer/wire schema.
// Default: ONE rotation's immutable prefix. Optional lineage mode below also
// checks retained cross-rotation structure. The caller must still independently
// authenticate history/inventory/checkpoints. Not a full-chain backup reader.
// Recovery/ABORTED/unknown records are deliberately unsupported and fail closed.
const historyBindingFields = [
  'cellId', 'rotationId', 'priorAcceptedDigest', 'priorRevision',
  'inventoryDigest', 'previousTransitionDigest', 'oldFloor',
  'priorTrustDigest', 'nextTrustDigest', 'rotationDigest',
  'targetTransactionId', 'targetReleaseDigest', 'targetRevision',
];
const floorFields = ['rootKeyId', 'policyVersion', 'policyDigest',
  'revocationVersion', 'revocationDigest', 'lastWallMs'];
const hexDigest = (s) => typeof s === 'string' && /^sha256:[0-9a-f]{64}$/.test(s);
const uuid = (s) => typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s);
const natural = (n) => Number.isSafeInteger(n) && n >= 0;
function requireHistory(ok) {
  if (!ok) throw new Error('Unresolved rotation history');
}
// Reject accessors, symbols, holes, non-JSON values and excessive nesting before
// serializing. No input mutation/toJSON invocation. Caller supplies bounded,
// complete no-follow snapshots under custody; this does not certify disk IO.
function historyJSON(value, depth = 0, budget = { nodes: 32768 }) {
  requireHistory(depth <= 32 && --budget.nodes >= 0);
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    requireHistory(Number.isSafeInteger(value));
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    requireHistory(value.length <= 16384);
    return JSON.stringify(value);
  }
  requireHistory(value !== null && typeof value === 'object');
  if (Array.isArray(value)) {
    requireHistory(value.length <= 4096 &&
      Reflect.ownKeys(value).length === value.length + 1);
    const parts = [];
    for (let i = 0; i < value.length; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      requireHistory(d && 'value' in d && d.enumerable);
      parts.push(historyJSON(d.value, depth + 1, budget));
    }
    return '[' + parts.join(',') + ']';
  }
  const keys = Reflect.ownKeys(value);
  requireHistory(keys.length <= 4096 && keys.every((k) => typeof k === 'string') &&
    closed(value, keys));
  return '{' + keys.sort().map((k) => JSON.stringify(k) + ':' +
    historyJSON(Object.getOwnPropertyDescriptor(value, k).value, depth + 1, budget)
  ).join(',') + '}';
}
function historyFloor(f) {
  requireHistory(closed(f, floorFields) && hexDigest(f.rootKeyId) &&
    hexDigest(f.policyDigest) && hexDigest(f.revocationDigest) &&
    natural(f.policyVersion) && natural(f.revocationVersion) && natural(f.lastWallMs));
}
function historyMonotonic(a, b, crossRoot = false) {
  historyFloor(a); historyFloor(b);
  requireHistory((crossRoot || a.rootKeyId === b.rootKeyId) &&
    b.policyVersion >= a.policyVersion && b.revocationVersion >= a.revocationVersion &&
    b.lastWallMs >= a.lastWallMs &&
    (b.policyVersion !== a.policyVersion || b.policyDigest === a.policyDigest) &&
    (b.revocationVersion !== a.revocationVersion || b.revocationDigest === a.revocationDigest));
}
const structuralDenial = () => Object.freeze({
  structurallyValid: false, authenticatedHistory: false, phase: null,
  terminalDigest: null, executionAuthorized: false,
});

// hashText is a TRUSTED code dependency: canonical-text -> sha256:<lowerhex>.
// Bind it to established canonical SHA-256 hashing, not request-supplied code.
// Hashes only detect structural inconsistency. They do NOT authenticate records,
// pins/signatures/rotation policy, floor custody, freshness, or latest checkpoint.
// expected is a separately obtained structural anchor, NOT accepted from rows.
// entries = [{path, item:{record,checksum}}], in exact sequence order.
// expected = {binding, inventory:[{transactionId,terminalChecksum}]}.
export function validateRotationHistoryStructure(entries, expected, hashText, lineage = null) {
  try {
    if (lineage !== null) return rotationLineage(entries, expected, hashText, lineage).history;
    requireHistory(typeof hashText === 'function');
    // Normalize a data-only snapshot once. Subsequent reads never call getters.
    const e = JSON.parse(historyJSON(expected));
    requireHistory(closed(e, ['binding', 'inventory']) &&
      closed(e.binding, historyBindingFields) && Array.isArray(e.inventory));
    const b = e.binding;
    requireHistory(typeof b.cellId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(b.cellId) &&
      uuid(b.rotationId) && uuid(b.targetTransactionId) &&
      natural(b.priorRevision) && b.priorRevision > 0 &&
      Number.isSafeInteger(b.priorRevision + 1) && b.targetRevision === b.priorRevision + 1);
    for (const k of ['priorAcceptedDigest', 'inventoryDigest', 'priorTrustDigest',
      'nextTrustDigest', 'rotationDigest', 'targetReleaseDigest']) requireHistory(hexDigest(b[k]));
    requireHistory(b.previousTransitionDigest === null || hexDigest(b.previousTransitionDigest));
    historyFloor(b.oldFloor);
    const hash = (text) => {
      const d = hashText(text); requireHistory(hexDigest(d)); return d;
    };
    let id = '';
    for (const t of e.inventory) {
      requireHistory(closed(t, ['transactionId', 'terminalChecksum']) &&
        uuid(t.transactionId) && t.transactionId > id && hexDigest(t.terminalChecksum) &&
        t.transactionId !== b.targetTransactionId);
      id = t.transactionId;
    }
    requireHistory(hash(historyJSON(e.inventory)) === b.inventoryDigest);
    const rows = JSON.parse(historyJSON(entries));
    requireHistory(Array.isArray(rows) && rows.length >= 1 && rows.length <= 3);
    let previous = null, floor = null, nextTuple = null;
    const phases = ['PREPARED', 'TRUST_COMMITTED', 'COMPLETE'];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      requireHistory(closed(row, ['path', 'item']) && closed(row.item, ['record', 'checksum']));
      const { record: r, checksum } = row.item;
      requireHistory(closed(r, ['schemaVersion', 'sequence', 'previousHash', 'phase', 'binding', 'details']) &&
        r.schemaVersion === 'alica.cell-rotation-history/v1' && r.sequence === i + 1 &&
        r.phase === phases[i] && r.previousHash === previous &&
        row.path === 'rotations/' + b.rotationId + '/' + String(i + 1).padStart(6, '0') + '.json' &&
        historyJSON(r.binding) === historyJSON(b) && hexDigest(checksum));
      // UTF-8 length, without Buffer/TextEncoder/runtime dependencies.
      const text = historyJSON(row.item);
      let size = 0;
      for (const c of text) {
        const n = c.codePointAt(0);
        size += n <= 0x7f ? 1 : n <= 0x7ff ? 2 : n <= 0xffff ? 3 : 4;
      }
      requireHistory(size <= 16384 && hash(historyJSON(r)) === checksum);
      const d = r.details;
      if (i === 0) {
        requireHistory(closed(d, ['priorTrust', 'nextTrust', 'rotation']));
        // Retain exact public materials, but leave all signature/trust-schema
        // validation to established APIs. No fresh or historical auth claim.
        for (const k of ['priorTrust', 'nextTrust', 'rotation']) {
          requireHistory(d[k] !== null && typeof d[k] === 'object' && !Array.isArray(d[k]) &&
            hash(historyJSON(d[k])) === b[k + 'Digest']);
        }
        const tuple = (m) => ({ rootKeyId: m.rootKeyId,
          policyVersion: m.policy.version, policyDigest: hash(historyJSON(m.policy)),
          revocationVersion: m.revocation.version, revocationDigest: hash(historyJSON(m.revocation)),
          lastWallMs: b.oldFloor.lastWallMs });
        const priorTuple = tuple(d.priorTrust);
        nextTuple = tuple(d.nextTrust);
        historyMonotonic(b.oldFloor, priorTuple);
        historyMonotonic(priorTuple, nextTuple, true);
        requireHistory(nextTuple.rootKeyId !== priorTuple.rootKeyId &&
          nextTuple.policyVersion === priorTuple.policyVersion + 1);
      } else if (i === 1) {
        requireHistory(closed(d, ['classification', 'nextFloor']) && d.classification === 'EXACT_NEXT');
        floor = d.nextFloor;
        historyMonotonic(b.oldFloor, floor, true);
        requireHistory(floorFields.filter((k) => k !== 'lastWallMs').every((k) => floor[k] === nextTuple[k]));
      } else {
        requireHistory(closed(d, ['accepted', 'finalFloor']) &&
          closed(d.accepted, ['cellId', 'transactionId', 'revision', 'releaseDigest', 'floor']) &&
          d.accepted.cellId === b.cellId && d.accepted.transactionId === b.targetTransactionId &&
          d.accepted.revision === b.targetRevision && d.accepted.releaseDigest === b.targetReleaseDigest);
        historyMonotonic(floor, d.accepted.floor);
        historyMonotonic(d.accepted.floor, d.finalFloor);
        floor = d.finalFloor;
      }
      previous = checksum;
    }
    return Object.freeze({ structurallyValid: true, authenticatedHistory: false,
      phase: phases[rows.length - 1], terminalDigest: previous, executionAuthorized: false });
  } catch {
    return structuralDenial();
  }
}

// Optional FULL retained-lineage mode of the SAME published validator/seam.
// Fourth validator / sixth classifier argument:
// {predecessors:[{entries,expected}], genesis:{accepted,trustDigest,floor},
//  latest:{rotationId,terminalDigest}, accepted, currentFloor}.
// Genesis/latest MUST be independently pinned, not reconstructed from candidate
// rows. accepted is the independently read selected internal accepted summary.
// Digests here bind canonical internal summaries, NOT persisted wire envelopes.
// Null preserves the older prefix-only interface, NEVER a full-lineage claim.
// Strict supported subset: consecutive completed rotations then one prefix;
// no intervening ordinary acceptance, ABORTED/recovery records or compaction.
// Omission/branch checks apply to this supplied retained snapshot, not raw disk.
// An authenticated complete filesystem inventory and latest/fresh checkpoint
// still require independent evidence. Structural hashes grant none of these.
//
// Bound the WHOLE candidate + anchors BEFORE hashing or chain validation. Token
// accounting precedes joins/parse, includes escaped keys/UTF-8, and is shared
// across all prefixes. 256KiB canonical input, 32768 nodes, depth32, arrays/maps
// <=256, strings/keys <=16384, <=32 rotations and <=3 rows each. These finite
// supported-input limits are not owner-cap changes or raw-IO/lifetime admission.
function lineageSnapshot(value) {
  let bytes = 262144, nodes = 32768;
  const tokens = [];
  const emit = (s) => {
    for (const c of s) {
      const n = c.codePointAt(0);
      bytes -= n <= 0x7f ? 1 : n <= 0x7ff ? 2 : n <= 0xffff ? 3 : 4;
      requireHistory(bytes >= 0);
    }
    tokens.push(s);
  };
  const string = (s) => { requireHistory(s.length <= 16384); emit(JSON.stringify(s)); };
  const visit = (v, depth) => {
    requireHistory(depth <= 32 && --nodes >= 0);
    if (v === null || typeof v === 'boolean') { emit(JSON.stringify(v)); return; }
    if (typeof v === 'number') {
      requireHistory(Number.isSafeInteger(v)); emit(JSON.stringify(v)); return;
    }
    if (typeof v === 'string') { string(v); return; }
    requireHistory(v !== null && typeof v === 'object');
    const keys = Reflect.ownKeys(v);
    if (Array.isArray(v)) {
      requireHistory(v.length <= 256 && keys.length === v.length + 1);
      emit('[');
      for (let i = 0; i < v.length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        requireHistory(d && 'value' in d && d.enumerable);
        if (i) emit(','); visit(d.value, depth + 1);
      }
      emit(']'); return;
    }
    requireHistory(keys.length <= 256 && keys.every(k => typeof k === 'string' &&
      k.length <= 16384) && closed(v, keys));
    emit('{');
    for (const [i, k] of keys.sort().entries()) {
      if (i) emit(','); string(k); emit(':');
      visit(Object.getOwnPropertyDescriptor(v, k).value, depth + 1);
    }
    emit('}');
  };
  visit(value, 0);
  return JSON.parse(tokens.join(''));
}
function historyAccepted(a, cellId) {
  requireHistory(closed(a, ['cellId', 'transactionId', 'revision', 'releaseDigest', 'floor']) &&
    a.cellId === cellId && uuid(a.transactionId) && natural(a.revision) &&
    a.revision > 0 && hexDigest(a.releaseDigest));
  historyFloor(a.floor);
}
function rotationLineage(entries, expected, hashText, lineage) {
  requireHistory(typeof hashText === 'function');
  const s = lineageSnapshot({ entries, expected, lineage });
  const l = s.lineage;
  requireHistory(closed(l, ['predecessors', 'genesis', 'latest', 'accepted', 'currentFloor']) &&
    Array.isArray(l.predecessors) && l.predecessors.length <= 31 &&
    closed(l.genesis, ['accepted', 'trustDigest', 'floor']) &&
    closed(l.latest, ['rotationId', 'terminalDigest']) &&
    uuid(l.latest.rotationId) && hexDigest(l.latest.terminalDigest) &&
    hexDigest(l.genesis.trustDigest));
  const chain = [...l.predecessors, { entries: s.entries, expected: s.expected }];
  const hash = v => { const h = hashText(historyJSON(v)); requireHistory(hexDigest(h)); return h; };
  const equal = (a, b) => historyJSON(a) === historyJSON(b);
  const cellId = s.expected.binding.cellId;
  let accepted = l.genesis.accepted, floor = l.genesis.floor;
  historyAccepted(accepted, cellId); historyMonotonic(accepted.floor, floor);
  let trust = l.genesis.trustDigest, previous = null, finalHistory;
  const roots = new Set([floor.rootKeyId]), rotations = new Set(), edges = new Set();
  const transactions = new Set([accepted.transactionId]), terminals = new Map();
  let selection, classification;
  for (let i = 0; i < chain.length; i++) {
    const p = chain[i], last = i === chain.length - 1;
    requireHistory(closed(p, ['entries', 'expected']) && Array.isArray(p.entries) &&
      p.entries.length >= 1 && p.entries.length <= 3);
    const h = validateRotationHistoryStructure(p.entries, p.expected, hashText);
    requireHistory(h.structurallyValid && (last || h.phase === 'COMPLETE'));
    const b = p.expected.binding, rows = p.entries.map(r => r.item.record);
    requireHistory(b.cellId === cellId && b.previousTransitionDigest === previous &&
      b.priorAcceptedDigest === hash(accepted) && b.priorRevision === accepted.revision &&
      b.priorTrustDigest === trust && !rotations.has(b.rotationId) &&
      !edges.has(b.rotationDigest) && !transactions.has(b.targetTransactionId) &&
      !terminals.has(b.targetTransactionId));
    historyMonotonic(floor, b.oldFloor);
    const next = rows[0].details.nextTrust;
    requireHistory(!roots.has(next.rootKeyId)); // includes genesis and every retired root
    rotations.add(b.rotationId); edges.add(b.rotationDigest); roots.add(next.rootKeyId);
    transactions.add(b.targetTransactionId);
    const inventory = new Map(p.expected.inventory.map(t => [t.transactionId, t.terminalChecksum]));
    for (const [id, checksum] of terminals) requireHistory(inventory.get(id) === checksum);
    requireHistory(inventory.has(accepted.transactionId));
    for (const [id, checksum] of inventory) terminals.set(id, checksum);
    if (last) {
      requireHistory(l.latest.rotationId === b.rotationId && l.latest.terminalDigest === h.terminalDigest);
      historyAccepted(l.accepted, cellId); historyFloor(l.currentFloor);
      if (equal(l.accepted, accepted)) {
        requireHistory(h.phase !== 'COMPLETE'); selection = 'PRIOR';
      } else {
        requireHistory(h.phase !== 'PREPARED' && l.accepted.transactionId === b.targetTransactionId &&
          l.accepted.revision === b.targetRevision && l.accepted.releaseDigest === b.targetReleaseDigest);
        historyMonotonic(rows[1].details.nextFloor, l.accepted.floor);
        if (h.phase === 'COMPLETE') requireHistory(equal(l.accepted, rows[2].details.accepted));
        selection = 'TARGET';
      }
      if (l.currentFloor.rootKeyId === b.oldFloor.rootKeyId) {
        requireHistory(h.phase === 'PREPARED' && selection === 'PRIOR');
        historyMonotonic(b.oldFloor, l.currentFloor); classification = 'EXACT_PRIOR';
      } else {
        // Root identity relates floors only; does NOT supply inspectPersistedTrust.
        const nextFloor = rows.length >= 2 ? rows[1].details.nextFloor : {
          rootKeyId: next.rootKeyId, policyVersion: next.policy.version,
          policyDigest: hash(next.policy), revocationVersion: next.revocation.version,
          revocationDigest: hash(next.revocation), lastWallMs: b.oldFloor.lastWallMs };
        historyMonotonic(nextFloor, l.currentFloor);
        if (selection === 'TARGET') historyMonotonic(l.accepted.floor, l.currentFloor);
        if (h.phase === 'COMPLETE') historyMonotonic(rows[2].details.finalFloor, l.currentFloor);
        classification = 'EXACT_NEXT';
      }
      finalHistory = h;
    } else {
      accepted = rows[2].details.accepted; floor = rows[2].details.finalFloor;
      trust = b.nextTrustDigest; previous = h.terminalDigest;
    }
  }
  return { history: finalHistory, expected: s.expected, selection, classification };
}

// Concrete caller seam to the existing decision layer. A future stopped entry
// must derive expected and observation from independent custody-bound reads.
// Structural success may restrict, NEVER supply, authenticatedHistory or any
// admission gate. inspectPersistedTrust remains the independent classification
// source; current freshness/authorization and numeric lifetime backing remain
// separate requirements. Neither this seam nor the old classifier is a writer.
// target is the observed/proposed transaction binding, NOT an eligibility token.
// Fresh recovery must name a new transaction, the SAME release, at prior+1.
export function classifyRotationHistoryRecovery(entries, expected, observation, hashText, target = null, lineage = null) {
  try {
    const chain = lineage === null ? null : rotationLineage(entries, expected, hashText, lineage);
    const e = chain ? chain.expected : JSON.parse(historyJSON(expected));
    const h = chain ? chain.history : validateRotationHistoryStructure(entries, e, hashText);
    if (!h.structurallyValid || !closed(observation, fields) ||
        !closed(observation.checks, checkFields) || observation.phase !== h.phase ||
        (chain && (observation.selection !== chain.selection ||
          observation.classification !== chain.classification)))
      return unresolved();
    const decision = classifyStoppedRotationRecovery(observation);
    if (decision.disposition === 'ABORT_PRIOR') return target === null ? decision : unresolved();
    if (decision.disposition === 'NEEDS_OPERATOR') return decision;
    const t = JSON.parse(historyJSON(target));
    requireHistory(closed(t, ['transactionId', 'releaseDigest', 'revision']) &&
      uuid(t.transactionId) && t.releaseDigest === e.binding.targetReleaseDigest &&
      t.revision === e.binding.targetRevision);
    if (decision.disposition === 'REPLACE_FRESH') {
      requireHistory(t.transactionId !== e.binding.targetTransactionId &&
        !e.inventory.some((item) => item.transactionId === t.transactionId));
    } else requireHistory(t.transactionId === e.binding.targetTransactionId);
    return decision;
  } catch {
    return unresolved();
  }
}

// Private lookup into the isolated authenticated ingress. Unconfigured singleton
// returns undefined. Neither caller claims nor checkpoint data populate records.
function readOwnerCheckpointConfirmation(cellId, checkpointDigest) {
  return lookupOwnerCheckpointConfirmation(cellId, checkpointDigest);
}

// Binding adapter, not an authenticator. The lexical lookup above must obtain
// explicit confirmation in the designated owner Telegram chat, after authenticating
// the owner independently of request/history. No production record exists today.
// All returned data is snapshotted to primitive values; no mutable approval alias
// escapes. Hostile in-process JS/proxies are NOT an authority isolation boundary.
export function inspectCheckpointOrigin(cellId, checkpointDigest) {
  const unavailable = 'UNAVAILABLE';
  const reject = () => { throw Object.assign(new Error('CHECKPOINT_ORIGIN_MISMATCH'),
    { code: 'CHECKPOINT_ORIGIN_MISMATCH' }); };
  const record = readOwnerCheckpointConfirmation(cellId, checkpointDigest);
  if (record === undefined) return unavailable;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return reject();
  const fields = ['authority', 'channel', 'cellId', 'checkpointDigest', 'purpose',
    'confirmationEvidence', 'independentAnchors'];
  const descriptors = Object.getOwnPropertyDescriptors(record);
  if (Object.keys(descriptors).length !== fields.length) return reject();
  const values = {};
  for (const name of fields) {
    const d = descriptors[name];
    if (!d || !Object.hasOwn(d, 'value') || typeof d.value !== 'string') return reject();
    values[name] = d.value;
  }
  if (values.authority !== 'owner' || values.channel !== 'designated-owner-telegram-chat' ||
      values.purpose !== 'historical rotation pins only' ||
      values.independentAnchors !== 'genesis/latest/expected independently established' ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(cellId) ||
      values.cellId !== cellId || !/^sha256:[0-9a-f]{64}$/.test(checkpointDigest) ||
      values.checkpointDigest !== checkpointDigest ||
      values.confirmationEvidence !== 'explicit owner confirmation\nCellID=' + cellId +
        '\nSHA256=' + checkpointDigest + '\npurpose=historical rotation pins only') return reject();
  // Evidence is the exact binding attested by the authenticated ingress after
  // verifying the explicit message, NOT a display name, boolean or self-approved
  // digest. Its authenticity is the missing ingress prerequisite, not inferred
  // from this string. The ingress must not normalize an unrelated approval.
  return 'ESTABLISHED';
}
