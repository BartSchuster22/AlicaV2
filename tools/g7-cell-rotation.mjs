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
// Validates ONE rotation's immutable prefix. The caller must independently
// authenticate the full retained lineage, including previousTransitionDigest,
// root retirement and its inventory/checkpoint. Not a full-chain backup reader.
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
export function validateRotationHistoryStructure(entries, expected, hashText) {
  try {
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

// Concrete caller seam to the existing decision layer. A future stopped entry
// must derive expected and observation from independent custody-bound reads.
// Structural success may restrict, NEVER supply, authenticatedHistory or any
// admission gate. inspectPersistedTrust remains the independent classification
// source; current freshness/authorization and numeric lifetime backing remain
// separate requirements. Neither this seam nor the old classifier is a writer.
// target is the observed/proposed transaction binding, NOT an eligibility token.
// Fresh recovery must name a new transaction, the SAME release, at prior+1.
export function classifyRotationHistoryRecovery(entries, expected, observation, hashText, target = null) {
  try {
    const e = JSON.parse(historyJSON(expected));
    const h = validateRotationHistoryStructure(entries, e, hashText);
    if (!h.structurallyValid || !closed(observation, fields) ||
        !closed(observation.checks, checkFields) || observation.phase !== h.phase)
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
