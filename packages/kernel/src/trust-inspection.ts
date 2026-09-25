import { createPublicKey, verify } from 'node:crypto';
import { constants, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import type { Signature } from '@alica/acap-types';
import type { TrustMaterial } from './trust.js';
import { canonical, parse, schema, digest, rawDigest, unique } from './validation.js';

export interface TrustInspectionOptions {
  statePath: string;
  priorTrust: TrustMaterial;
  nextTrust: TrustMaterial;
  rotation: { record: unknown; oldSignature: Signature; newSignature: Signature };
  /** Independently provisioned exact checkpoint/intent, NOT derived from the request. */
  independentPin: {
    cellId: string;
    priorTrustDigest: string;
    nextTrustDigest: string;
    rotationDigest: string;
  };
}
export type TrustInspection =
  | Readonly<{ schemaVersion: 'alica.trust-inspection/v1'; classification: 'UNRESOLVED' }>
  | Readonly<{
      schemaVersion: 'alica.trust-inspection/v1';
      cellId: string;
      classification: 'EXACT_PRIOR' | 'EXACT_NEXT';
      policyVersion: number;
      policyDigest: string;
      revocationVersion: number;
      revocationDigest: string;
      lastWallMs: number;
    }>;
const unresolved: TrustInspection = Object.freeze({
  schemaVersion: 'alica.trust-inspection/v1', classification: 'UNRESOLVED',
});
function requireValue(ok: unknown): asserts ok {
  if (!ok) throw new Error('UNRESOLVED');
}
function object(value: unknown, names: string[]): asserts value is Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value));
  requireValue(canonical(Object.keys(value).sort()) === canonical([...names].sort()));
}
function hash(value: unknown): asserts value is string {
  requireValue(typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value));
}
function integer(value: unknown, minimum = 0): asserts value is number {
  requireValue(typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum);
}
function signature(data: unknown, s: Signature, domain: string, m: TrustMaterial): void {
  schema('signature', s);
  requireValue(s.keyId === m.rootKeyId);
  const encoded = m.keys[s.keyId];
  requireValue(typeof encoded === 'string');
  const raw = Buffer.from(encoded, 'base64');
  requireValue(raw.length === 32 && raw.toString('base64') === encoded && rawDigest(raw) === s.keyId);
  const bytes = Buffer.from(s.signature, 'base64');
  requireValue(bytes.length === 64 && bytes.toString('base64') === s.signature);
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
    format: 'der', type: 'spki',
  });
  requireValue(verify(null, Buffer.from(domain + '\n' + canonical(data)), key, bytes));
}
function historical(m: TrustMaterial): void {
  object(m, ['rootKeyId', 'keys', 'policy', 'policySignature', 'revocation', 'revocationSignature']);
  hash(m.rootKeyId);
  requireValue(m.keys !== null && typeof m.keys === 'object' && !Array.isArray(m.keys));
  for (const [id, encoded] of Object.entries(m.keys)) {
    hash(id);
    requireValue(typeof encoded === 'string');
    const raw = Buffer.from(encoded, 'base64');
    requireValue(raw.length === 32 && raw.toString('base64') === encoded && rawDigest(raw) === id);
  }
  schema('trust-policy', m.policy);
  schema('revocation', m.revocation);
  requireValue(m.policy.rootKeyIds[0] === m.rootKeyId);
  unique(m.policy.publishers.map((p) => p.id));
  for (const x of [m.policy, m.revocation]) {
    integer(x.version, 1); integer(x.issuedAtMs); integer(x.expiresAtMs);
    requireValue(x.issuedAtMs < x.expiresAtMs);
  }
  integer(m.policy.maxOfflineAgeMs);
  signature(m.policy, m.policySignature, 'ALICA-TRUST-POLICY-v1', m);
  signature(m.revocation, m.revocationSignature, 'ALICA-REVOCATION-v1', m);
}
function tuple(m: TrustMaterial) {
  return { rootKeyId: m.rootKeyId, policyVersion: m.policy.version,
    policyDigest: digest(m.policy), revocationVersion: m.revocation.version,
    revocationDigest: digest(m.revocation) };
}
/** Reads only its own descriptor; no fallback to following symlinks or blocking FIFOs.
 * O_NOFOLLOW covers the final component, NOT ancestor directories. Trusted caller
 * owns path selection and genuine custody. This is not a filesystem sandbox.
 */
function readState(path: string): unknown {
  requireValue(typeof path === 'string' && path.length > 0 && path.length <= 4096 && !path.includes('\0'));
  requireValue(typeof constants.O_NOFOLLOW === 'number' && constants.O_NOFOLLOW !== 0 &&
    typeof constants.O_NONBLOCK === 'number' && constants.O_NONBLOCK !== 0);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd, { bigint: true });
    requireValue(before.isFile() && before.size > 0n && before.size <= 4096n);
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < bytes.length) {
      const n = readSync(fd, bytes, length, bytes.length - length, length);
      if (n === 0) break;
      length += n;
    }
    const after = fstatSync(fd, { bigint: true });
    requireValue(length === Number(before.size) && after.isFile() &&
      before.dev === after.dev && before.ino === after.ino && before.size === after.size &&
      before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs);
    return parse(bytes.subarray(0, length), 4096);
  } finally {
    // Never retry close: after an error descriptor ownership can be uncertain.
    closeSync(fd);
  }
}
/** Historical authentication only. No clock is read and no freshness, custody,
 * activation, latest-state, rollback-repair or invocation provenance is certified.
 * Missing/unsupported/malformed input and IO/close errors return no usable floor.
 * Ordinary in-process data only; hostile JS/proxies are not a security boundary.
 */
export function inspectPersistedTrust(configText: string, options: TrustInspectionOptions): TrustInspection {
  try {
    requireValue(typeof configText === 'string');
    const c = parse(configText) as Record<string, unknown>;
    const limits = { maxCallMs: 30000, cleanupMs: 30000, activationMs: 30000,
      eventQueue: 256, auditCapacity: 65536, maxInstances: 256, maxScopes: 256,
      maxGrants: 4096, maxEffects: 4096, maxCalls: 1024 };
    object(c, ['cellId', 'rootScope', 'timeTrusted', ...Object.keys(limits)]);
    for (const k of ['cellId', 'rootScope']) requireValue(typeof c[k] === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(c[k] as string));
    requireValue(c.timeTrusted === true);
    for (const [k, max] of Object.entries(limits)) {
      const n = c[k]; integer(n, 1); requireValue(n <= max);
    }
    // Existing canonical/parse rejects accessors, exotic objects, unsafe numbers,
    // duplicate keys, cycles and excessive bytes/depth without invoking toJSON.
    const o = parse(canonical(options)) as unknown as TrustInspectionOptions;
    object(o, ['statePath', 'priorTrust', 'nextTrust', 'rotation', 'independentPin']);
    const pin = o.independentPin;
    object(pin, ['cellId', 'priorTrustDigest', 'nextTrustDigest', 'rotationDigest']);
    requireValue(typeof pin.cellId === 'string' && pin.cellId === c.cellId);
    hash(pin.priorTrustDigest); hash(pin.nextTrustDigest); hash(pin.rotationDigest);
    requireValue(digest(o.priorTrust) === pin.priorTrustDigest && digest(o.nextTrust) === pin.nextTrustDigest && digest(o.rotation) === pin.rotationDigest);
    const prior = o.priorTrust, next = o.nextTrust;
    historical(prior); historical(next);
    object(o.rotation, ['record', 'oldSignature', 'newSignature']);
    const r = schema<{ priorVersion: number; nextVersion: number; priorPolicyDigest: string;
      nextPolicyDigest: string; priorKeyId: string; nextKeyId: string }>('root-rotation', o.rotation.record);
    requireValue(prior.rootKeyId !== next.rootKeyId &&
      r.priorKeyId === prior.rootKeyId && r.nextKeyId === next.rootKeyId &&
      r.priorVersion === prior.policy.version && r.nextVersion === next.policy.version &&
      r.nextVersion === r.priorVersion + 1 &&
      r.priorPolicyDigest === digest(prior.policy) && r.nextPolicyDigest === digest(next.policy) &&
      next.revocation.version >= prior.revocation.version &&
      (next.revocation.version !== prior.revocation.version || digest(next.revocation) === digest(prior.revocation)));
    signature(r, o.rotation.oldSignature, 'ALICA-ROOT-ROTATION-v1', prior);
    signature(r, o.rotation.newSignature, 'ALICA-ROOT-ROTATION-v1', next);
    const state = readState(o.statePath);
    object(state, ['cellId', 'rootKeyId', 'policyVersion', 'policyDigest', 'revocationVersion', 'revocationDigest', 'timeMs']);
    requireValue(typeof state.cellId === 'string' && state.cellId === pin.cellId);
    hash(state.rootKeyId); hash(state.policyDigest); hash(state.revocationDigest);
    integer(state.policyVersion, 1); integer(state.revocationVersion, 1); integer(state.timeMs);
    for (const [classification, m] of [['EXACT_PRIOR', prior], ['EXACT_NEXT', next]] as const) {
      if (Object.entries(tuple(m)).every(([k, v]) => state[k] === v)) {
        requireValue(state.timeMs >= m.policy.issuedAtMs && state.timeMs >= m.revocation.issuedAtMs);
        return Object.freeze({ schemaVersion: 'alica.trust-inspection/v1', cellId: pin.cellId,
          classification, policyVersion: m.policy.version, policyDigest: digest(m.policy),
          revocationVersion: m.revocation.version, revocationDigest: digest(m.revocation), lastWallMs: state.timeMs });
      }
    }
  } catch {
    // Closed deterministic failure, including native/validation/IO/close failures.
  }
  return unresolved;
}
