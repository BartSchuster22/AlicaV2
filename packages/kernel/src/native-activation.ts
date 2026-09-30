import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { KernelContext, Value } from '@alica/acap-types';
import { check, canonical, detach, freeze, digest, rawDigest } from './validation.js';

/** Privileged operator approval, never a plugin-provided document. */
export interface NativeAdmission {
  schemaVersion: 'alica.native-admission/v1';
  implementationId: string;
  packageDigest: string;
  configurationDigest: string;
  artifacts: { path: string; digest: string }[];
  issuedAtMs: number;
  expiresAtMs: number;
}
export interface NativeImplementation {
  admission: NativeAdmission;
  configuration: Value;
  activate(context: KernelContext, configuration: Value): void | Promise<void>;
}
export interface NativeBinding extends NativeImplementation {
  revoked: boolean;
}
const hash = (s: unknown): boolean => typeof s === 'string' && /^sha256:[a-f0-9]{64}$/.test(s);
export function nativeBindings(entries: readonly NativeImplementation[]): Map<string, NativeBinding> {
  check(Array.isArray(entries) && entries.length <= 32);
  const result = new Map<string, NativeBinding>();
  for (const entry of entries) {
    check(entry && typeof entry.activate === 'function');
    const a = freeze(detach(entry.admission));
    check(a && canonical(Object.keys(a).sort()) === canonical(['schemaVersion','implementationId','packageDigest','configurationDigest','artifacts','issuedAtMs','expiresAtMs'].sort()));
    check(a.schemaVersion === 'alica.native-admission/v1');
    check(typeof a.implementationId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(a.implementationId));
    check(hash(a.packageDigest) && hash(a.configurationDigest));
    check(Number.isSafeInteger(a.issuedAtMs) && Number.isSafeInteger(a.expiresAtMs) && a.issuedAtMs >= 0 && a.expiresAtMs > a.issuedAtMs);
    check(Array.isArray(a.artifacts) && a.artifacts.length > 0 && a.artifacts.length <= 10000);
    const paths = new Set<string>();
    for (const f of a.artifacts) {
      check(f && canonical(Object.keys(f).sort()) === canonical(['digest','path']));
      check(typeof f.path === 'string' && isAbsolute(f.path) && hash(f.digest) && !paths.has(f.path));
      paths.add(f.path);
    }
    check(!result.has(a.implementationId), 'CONFLICT');
    const configuration = freeze(detach(entry.configuration));
    check(digest(configuration) === a.configurationDigest, 'PERMISSION_DENIED');
    // Capture the trusted function, not a caller-mutable entry object.
    result.set(a.implementationId, {admission:a,configuration,activate:entry.activate,revoked:false});
  }
  return result;
}
export function freshNative(binding: NativeBinding, now: number): void {
  check(!binding.revoked && now >= binding.admission.issuedAtMs && now < binding.admission.expiresAtMs, 'PERMISSION_DENIED');
}
export function verifyNativeArtifacts(binding: NativeBinding): void {
  let bytes = 0;
  for (const f of binding.admission.artifacts) {
    // Canonical immutable operator-owned deployment paths; no symlink substitution.
    check(realpathSync(f.path) === f.path, 'PERMISSION_DENIED');
    const st = statSync(f.path);
    check(st.isFile() && st.size <= 67108864 && (bytes += st.size) <= 536870912, 'RESOURCE_EXHAUSTED');
    check(rawDigest(readFileSync(f.path)) === f.digest, 'PERMISSION_DENIED');
  }
}
