// Stopped rotation decision layer. Pure: no IO, Kernel, crypto, clock or grants.
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
