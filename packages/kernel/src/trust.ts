import { createPublicKey, verify } from 'node:crypto';
import {
  readFileSync,
  existsSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type {
  Signature,
  TrustPolicy,
  Revocation,
  Manifest,
  Descriptor,
  EventDescriptor,
  Profile,
} from '@alica/acap-types';
import {
  check,
  document,
  schema,
  canonical,
  digest,
  rawDigest,
  parse,
  detach,
  freeze,
  unique,
  manifest,
  descriptor,
  payloadSchema,
  validateProfile,
} from './validation.js';
export interface TrustMaterial {
  rootKeyId: string;
  keys: Record<string, string>;
  policy: TrustPolicy;
  policySignature: Signature;
  revocation: Revocation;
  revocationSignature: Signature;
}
export interface SignedPackage {
  indexText: string;
  bundleText: string;
  profileText: string;
  signature: Signature;
  files: Record<string, Uint8Array>;
}
/** Selected package bytes only; the full release manifest/signature remain unchanged. */
export interface ReleasePackage extends SignedPackage {
  packagePrefix: string;
}
interface Inventory {
  path: string;
  bytes: number;
  digest: string;
}
interface PackageIndex {
  schemaVersion: string;
  pluginId: string;
  version: string;
  manifestPath: string;
  files: Inventory[];
}
interface Bundle {
  schemaVersion: string;
  bundleId: string;
  profileDigest: string;
  artifacts: (Inventory & { kind: string })[];
}
interface Water {
  cellId: string;
  rootKeyId: string;
  policyVersion: number;
  policyDigest: string;
  revocationVersion: number;
  revocationDigest: string;
  timeMs: number;
}
export interface VerifiedPackage {
  manifest: Manifest;
  digest: string;
  signer: string;
  descriptors: Map<string, Descriptor>;
  events: Map<string, EventDescriptor>;
  code: string;
  modules: Map<string, string>;
  // Release membership remains subject to current revocation at activation/delivery.
  releaseDigests?: string[];
}
export class Trust {
  #material: TrustMaterial;
  #water: Water;
  #brokenClock = false;
  constructor(
    material: TrustMaterial,
    readonly cellId: string,
    readonly statePath: string,
    readonly now: () => number,
    initialize: boolean,
  ) {
    this.#material = freeze(detach(material));
    const m = this.#material;
    this.validate(m);
    const current = {
      cellId,
      rootKeyId: m.rootKeyId,
      policyVersion: m.policy.version,
      policyDigest: digest(m.policy),
      revocationVersion: m.revocation.version,
      revocationDigest: digest(m.revocation),
      timeMs: now(),
    };
    if (existsSync(statePath)) {
      const old = parse(readFileSync(statePath)) as unknown as Water;
      check(
        canonical(Object.keys(old).sort()) ===
          canonical(Object.keys(current).sort()),
        'FAILED_PRECONDITION',
      );
      check(
        old.cellId === cellId && old.rootKeyId === m.rootKeyId,
        'PERMISSION_DENIED',
      );
      check(
        Number.isSafeInteger(old.timeMs) && old.timeMs <= current.timeMs,
        'FAILED_PRECONDITION',
      );
      check(
        m.policy.version >= old.policyVersion &&
          m.revocation.version >= old.revocationVersion,
        'PERMISSION_DENIED',
      );
      check(
        m.policy.version !== old.policyVersion ||
          current.policyDigest === old.policyDigest,
        'PERMISSION_DENIED',
      );
      check(
        m.revocation.version !== old.revocationVersion ||
          current.revocationDigest === old.revocationDigest,
        'PERMISSION_DENIED',
      );
    } else check(initialize, 'FAILED_PRECONDITION');
    this.#water = current;
    this.persist();
    this.fresh();
  }
  get policyDigest(): string {
    return digest(this.#material.policy);
  }
  get expiry(): number {
    const m = this.#material;
    return Math.min(
      m.policy.expiresAtMs,
      m.revocation.expiresAtMs,
      m.policy.issuedAtMs + m.policy.maxOfflineAgeMs + 1,
      m.revocation.issuedAtMs + m.policy.maxOfflineAgeMs + 1,
    );
  }
  private persist(): void {
    const p = this.statePath + '.next';
    const fd = openSync(p, 'w', 0o600);
    try {
      writeFileSync(fd, canonical(this.#water));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(p, this.statePath);
    const d = openSync(dirname(p), 'r');
    try {
      fsyncSync(d);
    } finally {
      closeSync(d);
    }
  }
  private signature(
    data: unknown,
    s: Signature,
    domain: string,
    keys: Record<string, string>,
    expected?: string,
  ): void {
    schema('signature', s);
    check(!expected || s.keyId === expected, 'PERMISSION_DENIED');
    const encoded = keys[s.keyId];
    check(encoded, 'PERMISSION_DENIED');
    const raw = Buffer.from(encoded, 'base64');
    check(
      raw.length === 32 &&
        raw.toString('base64') === encoded &&
        rawDigest(raw) === s.keyId,
      'PERMISSION_DENIED',
    );
    const signature = Buffer.from(s.signature, 'base64');
    check(
      signature.length === 64 && signature.toString('base64') === s.signature,
      'PERMISSION_DENIED',
    );
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
      format: 'der',
      type: 'spki',
    });
    check(
      verify(
        null,
        Buffer.from(domain + '\n' + canonical(data)),
        key,
        signature,
      ),
      'PERMISSION_DENIED',
    );
  }
  private validate(m: TrustMaterial): void {
    schema('trust-policy', m.policy);
    schema('revocation', m.revocation);
    check(m.policy.rootKeyIds[0] === m.rootKeyId, 'PERMISSION_DENIED');
    unique(m.policy.publishers.map((p) => p.id));
    for (const x of [m.policy, m.revocation])
      check(
        x.issuedAtMs < x.expiresAtMs && x.issuedAtMs <= this.now(),
        'PERMISSION_DENIED',
      );
    this.signature(
      m.policy,
      m.policySignature,
      'ALICA-TRUST-POLICY-v1',
      m.keys,
      m.rootKeyId,
    );
    this.signature(
      m.revocation,
      m.revocationSignature,
      'ALICA-REVOCATION-v1',
      m.keys,
      m.rootKeyId,
    );
    const now = this.now();
    check(
      [m.policy, m.revocation].every(
        (x) =>
          now < x.expiresAtMs && now - x.issuedAtMs <= m.policy.maxOfflineAgeMs,
      ),
      'PERMISSION_DENIED',
    );
  }
  fresh(): void {
    const now = this.now();
    check(Number.isSafeInteger(now) && now >= 0);
    if (now < this.#water.timeMs) this.#brokenClock = true;
    check(!this.#brokenClock, 'FAILED_PRECONDITION');
    check(now < this.expiry, 'PERMISSION_DENIED');
    if (now > this.#water.timeMs) {
      this.#water.timeMs = now;
      this.persist();
    }
  }
  accepted(p: VerifiedPackage): void {
    this.fresh();
    const m = this.#material;
    check(
      !m.revocation.revokedKeyIds.includes(p.signer) &&
        !m.revocation.revokedArtifactDigests.includes(p.digest) &&
        !(p.releaseDigests ?? []).some((d) =>
          m.revocation.revokedArtifactDigests.includes(d),
        ),
      'PERMISSION_DENIED',
    );
    check(
      m.policy.publishers.some(
        (x) =>
          x.id === p.manifest.publisher &&
          x.keyIds.includes(p.signer) &&
          x.executionModes.includes(p.manifest.execution),
      ),
      'PERMISSION_DENIED',
    );
  }
  update(
    next: TrustMaterial,
    rotation?: {
      record: unknown;
      oldSignature: Signature;
      newSignature: Signature;
    },
  ): void {
    this.fresh();
    const m = freeze(detach(next));
    this.validate(m);
    check(
      m.policy.version >= this.#water.policyVersion &&
        m.revocation.version >= this.#water.revocationVersion,
      'PERMISSION_DENIED',
    );
    check(
      m.policy.version !== this.#water.policyVersion ||
        digest(m.policy) === this.#water.policyDigest,
      'PERMISSION_DENIED',
    );
    check(
      m.revocation.version !== this.#water.revocationVersion ||
        digest(m.revocation) === this.#water.revocationDigest,
      'PERMISSION_DENIED',
    );
    if (m.rootKeyId !== this.#material.rootKeyId) {
      check(rotation, 'PERMISSION_DENIED');
      const r = schema<{
        priorVersion: number;
        nextVersion: number;
        priorPolicyDigest: string;
        nextPolicyDigest: string;
        priorKeyId: string;
        nextKeyId: string;
      }>('root-rotation', detach(rotation.record));
      check(
        r.priorVersion === this.#water.policyVersion &&
          r.nextVersion === r.priorVersion + 1 &&
          r.nextVersion === m.policy.version &&
          r.priorPolicyDigest === this.#water.policyDigest &&
          r.nextPolicyDigest === digest(m.policy) &&
          r.priorKeyId === this.#material.rootKeyId &&
          r.nextKeyId === m.rootKeyId,
        'PERMISSION_DENIED',
      );
      this.signature(
        r,
        rotation.oldSignature,
        'ALICA-ROOT-ROTATION-v1',
        this.#material.keys,
        r.priorKeyId,
      );
      this.signature(
        r,
        rotation.newSignature,
        'ALICA-ROOT-ROTATION-v1',
        m.keys,
        r.nextKeyId,
      );
    }
    const old = this.#water;
    this.#water = {
      ...old,
      rootKeyId: m.rootKeyId,
      policyVersion: m.policy.version,
      policyDigest: digest(m.policy),
      revocationVersion: m.revocation.version,
      revocationDigest: digest(m.revocation),
      timeMs: this.now(),
    };
    try {
      this.persist();
    } catch (e) {
      this.#water = old;
      throw e;
    }
    this.#material = m;
  }
  verifyPackage(input: SignedPackage): VerifiedPackage {
    return this.verify(input);
  }
  verifyReleasePackage(input: ReleasePackage): VerifiedPackage {
    const selected = {
      indexText: input.indexText,
      bundleText: input.bundleText,
      profileText: input.profileText,
      signature: detach(input.signature),
      files: { ...input.files },
      packagePrefix: input.packagePrefix,
    };
    check(typeof selected.packagePrefix === 'string', 'CONTRACT_MISMATCH');
    return this.verify(selected, selected.packagePrefix);
  }
  private verify(input: SignedPackage, prefix?: string): VerifiedPackage {
    this.fresh();
    const index = document<PackageIndex>('package-index', input.indexText);
    const bundle = document<Bundle>('bundle', input.bundleText);
    const profile = document<Profile>('profile', input.profileText);
    const packageDigest = digest(index);
    check(digest(profile) === bundle.profileDigest, 'CONTRACT_MISMATCH');
    check(
      profile.plugins.some(
        (x) =>
          x.id === index.pluginId &&
          x.version === index.version &&
          x.packageDigest === packageDigest,
      ),
      'CONTRACT_MISMATCH',
    );
    unique(index.files.map((x) => x.path));
    unique(bundle.artifacts.map((x) => x.path));
    check(
      !index.files.some((x) => x.path === 'package-index.json'),
      'CONFLICT',
    );
    let artifacts = bundle.artifacts;
    let releaseDigests: string[] | undefined;
    if (prefix !== undefined) {
      check(
        prefix === 'plugins/' + index.pluginId + '/' &&
          index.manifestPath === 'manifest.json',
        'CONTRACT_MISMATCH',
      );
      validateProfile(input.profileText);
      // Reject case/parent aliases across the signed path namespace, without claiming
      // to have received or hashed unrelated artifact bytes.
      const paths = new Map<string, string>();
      const leaves = new Set(bundle.artifacts.map((a) => a.path.toLowerCase()));
      for (const a of bundle.artifacts) {
        const parts = a.path.split('/');
        check(a.path.length <= 240 && parts.length <= 16);
        for (let i = 1; i <= parts.length; i++) {
          const path = parts.slice(0, i).join('/');
          const lower = path.toLowerCase();
          check(!paths.has(lower) || paths.get(lower) === path, 'CONFLICT');
          check(i === parts.length || !leaves.has(lower), 'CONFLICT');
          paths.set(lower, path);
        }
      }
      const profileArtifact = bundle.artifacts.find(
        (a) => a.path === 'profile/profile.json',
      );
      check(
        profileArtifact &&
          profileArtifact.kind === 'profile' &&
          profileArtifact.bytes === Buffer.byteLength(input.profileText) &&
          profileArtifact.digest === rawDigest(input.profileText),
        'CONTRACT_MISMATCH',
      );
      artifacts = bundle.artifacts.filter((a) => a.path.startsWith(prefix));
      for (const a of artifacts) {
        const path = a.path.slice(prefix.length);
        const kind =
          path === 'manifest.json' || path === 'index.json'
            ? 'manifest'
            : path.startsWith('code/')
              ? 'plugin'
              : path.startsWith('contracts/')
                ? 'descriptor'
                : undefined;
        check(kind && kind === a.kind, 'CONTRACT_MISMATCH');
      }
      check(!index.files.some((f) => f.path === 'index.json'), 'CONFLICT');
      releaseDigests = [
        digest(bundle),
        digest(profile),
        profileArtifact.digest,
        ...artifacts.map((a) => a.digest),
      ];
    }
    check(artifacts.length === index.files.length + 1, 'CONTRACT_MISMATCH');
    // Files are copied and hashed before any module evaluation. No filesystem path is later reopened.
    check(
      Object.keys(input.files).length === index.files.length,
      'CONTRACT_MISMATCH',
    );
    const files = new Map<string, Buffer>();
    let total = 0;
    for (const x of index.files) {
      const bytes = input.files[x.path];
      check(bytes instanceof Uint8Array, 'CONTRACT_MISMATCH');
      total += bytes.byteLength;
      check(
        bytes.byteLength <= 1048576 && total <= 16777216,
        'RESOURCE_EXHAUSTED',
      );
      const copy = Buffer.from(bytes);
      check(
        copy.byteLength === x.bytes && rawDigest(copy) === x.digest,
        'CONTRACT_MISMATCH',
      );
      files.set(x.path, copy);
    }
    for (const x of artifacts) {
      const path = prefix === undefined ? x.path : x.path.slice(prefix.length);
      const bytes =
        path === (prefix === undefined ? 'package-index.json' : 'index.json')
          ? Buffer.from(input.indexText)
          : files.get(path);
      check(
        bytes && bytes.byteLength === x.bytes && rawDigest(bytes) === x.digest,
        'CONTRACT_MISMATCH',
      );
    }
    const raw = files.get(index.manifestPath);
    check(raw, 'CONTRACT_MISMATCH');
    const m = manifest(raw);
    check(
      m.id === index.pluginId && m.version === index.version,
      'CONTRACT_MISMATCH',
    );
    check(
      m.execution === 'inproc' || m.execution === 'ipc',
      'FAILED_PRECONDITION',
    );
    const p: VerifiedPackage = {
      manifest: freeze(m),
      digest: packageDigest,
      signer: input.signature.keyId,
      descriptors: new Map(),
      events: new Map(),
      code: '',
      modules: new Map(),
      ...(releaseDigests ? { releaseDigests } : {}),
    };
    this.accepted(p);
    this.signature(
      bundle,
      input.signature,
      'ALICA-BUNDLE-v1',
      this.#material.keys,
      input.signature.keyId,
    );
    for (const b of m.provides) {
      const raw = files.get(b.descriptorPath);
      check(raw, 'CONTRACT_MISMATCH');
      const d = descriptor(raw);
      check(
        !d.operations.some(
          (o) => o.idempotencyPolicy?.persistence === 'durable',
        ),
        'FAILED_PRECONDITION',
      );
      check(
        d.id === b.capabilityId &&
          d.version === b.version &&
          digest(d) === b.descriptorDigest,
        'CONTRACT_MISMATCH',
      );
      p.descriptors.set(b.capabilityId + '@' + b.version, freeze(d));
    }
    for (const b of [...m.publishedEvents, ...m.subscribedEvents]) {
      const raw = files.get(b.descriptorPath);
      check(raw, 'CONTRACT_MISMATCH');
      const d = document<EventDescriptor>('event-descriptor', raw);
      payloadSchema(d.payload);
      check(
        d.id === b.eventType &&
          d.version === b.version &&
          digest(d) === b.descriptorDigest,
        'CONTRACT_MISMATCH',
      );
      check(
        !p.events.has(d.id) || digest(p.events.get(d.id)) === digest(d),
        'CONTRACT_MISMATCH',
      );
      p.events.set(d.id, freeze(d));
    }
    const code = files.get(m.entrypoint);
    check(code, 'CONTRACT_MISMATCH');
    try {
      p.code = new TextDecoder('utf-8', { fatal: true }).decode(code);
      p.modules.set(m.entrypoint, p.code);
      for (const [path, bytes] of files)
        if (/\.(?:mjs|js)$/.test(path)) {
          check(p.modules.size < 256, 'RESOURCE_EXHAUSTED');
          p.modules.set(
            path,
            new TextDecoder('utf-8', { fatal: true }).decode(bytes),
          );
        }
    } catch {
      check(false);
    }
    return p;
  }
}
