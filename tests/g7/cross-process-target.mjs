// Target-only disposable signing. Does not rewrite any originally accepted bytes.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { bootstrap, canonical, digest, rawDigest, parse } from '@alica/kernel';
import { config, echo, signature } from '../../tools/g3-fixtures.mjs';
import { assembleRelease, artifactKind } from '../../tools/g7-release.mjs';
export async function upgradeTarget(dir, original, mode = 'none') {
  const files = new Map(original.files);
  const prefix = 'plugins/org.alica.echoa/';
  const manifest = parse(files.get(prefix + 'manifest.json'));
  manifest.version = '1.1.0';
  files.set(prefix + 'manifest.json', Buffer.from(canonical(manifest)));
  const expression =
    mode === 'bad-target-call'
      ? "'wrong-target-result'"
      : "Array.from(input.text).join('')";
  const code =
    mode === 'bad-target-readiness'
      ? 'export async function activate() {}'
      : `export async function activate(ctx) { ctx.provide(${canonical(echo)}, {echo: async input => ({text:${expression}})}); }`;
  files.set(prefix + 'code/index.js', Buffer.from(code));
  const index = parse(files.get(prefix + 'index.json'));
  index.version = manifest.version;
  index.files = index.files.map((entry) => {
    const b = files.get(prefix + entry.path);
    return { ...entry, bytes: b.length, digest: rawDigest(b) };
  });
  files.set(prefix + 'index.json', Buffer.from(canonical(index)));
  const profile = parse(files.get('profile/profile.json'));
  profile.version = '1.1.0';
  const entry = profile.plugins.find((p) => p.id === manifest.id);
  entry.version = manifest.version;
  entry.packageDigest = digest(index);
  files.set('profile/profile.json', Buffer.from(canonical(profile)));
  const authorization = structuredClone(original.authorization);
  authorization.profileDigest = digest(profile);
  const bundle = structuredClone(original.bundle);
  bundle.profileDigest = digest(profile);
  const refresh = () => {
    bundle.artifacts = [...files].map(([path, b]) => ({
      path,
      bytes: b.length,
      digest: rawDigest(b),
      kind: artifactKind(path),
    }));
  };
  refresh();
  // Offline target lock generation only; actual upgrade must use original Cell's
  // Kernel state, never this disposable planning state.
  const h = bootstrap(canonical(config), {
    trust: original.trust,
    statePath: join(dir, 'target-planning-kernel.json'),
    initialize: true,
  });
  try {
    const ids = new Map();
    for (const plugin of profile.plugins) {
      const p = 'plugins/' + plugin.id + '/';
      const idx = parse(files.get(p + 'index.json'));
      const packageFiles = Object.fromEntries(
        idx.files.map((e) => [e.path, files.get(p + e.path)]),
      );
      ids.set(
        plugin.id,
        h.discoverReleasePackage({
          indexText: canonical(idx),
          files: packageFiles,
          packagePrefix: p,
          bundleText: canonical(bundle),
          profileText: canonical(profile),
          signature: signature(bundle, 'ALICA-BUNDLE-v1', original.publisher),
        }),
      );
    }
    for (const c of authorization.capabilities)
      h.issueGrant({
        schemaVersion: 'acap.grant/v1',
        grantId: randomUUID(),
        ...h.identity(ids.get(c.principal)),
        capabilityId: c.capabilityId,
        operations: c.operations,
        issuedAtMs: Date.now() - 1,
        expiresAtMs: Date.now() + c.lifetimeMs,
        revision: 0,
      });
    files.set(
      'profile/lock.json',
      Buffer.from(canonical(h.plan(canonical(profile)).lock)),
    );
  } finally {
    await h.shutdown();
  }
  refresh();
  const archive = join(dir, 'target.tar');
  assembleRelease(
    archive,
    Buffer.from(canonical(bundle)),
    Buffer.from(
      canonical(signature(bundle, 'ALICA-BUNDLE-v1', original.publisher)),
    ),
    files,
  );
  if (mode === 'bad-target-grants') authorization.capabilities = [];
  const input = join(dir, 'target.json');
  writeFileSync(
    input,
    canonical({ archive, trust: original.trust, authorization }),
    { mode: 0o600 },
  );
  return input;
}
