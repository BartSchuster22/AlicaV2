// Explicit one-shot verification of owner-signed PUBLIC material, not an installer.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { bootstrap, canonical, digest } from '@alica/kernel';
import { config } from './g3-fixtures.mjs';
const root =
  'sha256:a1495a5dbcdf08ad844c5cc27e860b35e78d296cc751c440e6cb24109ef1e395';
const release =
  'sha256:93ea41d456775cfea241ace10bb60eb4450313f1e14072ffe75cca7efca51df1';
const material = JSON.parse(
  readFileSync('evidence/g7/initial-trust.public.json', 'utf8'),
);
assert.equal(material.rootKeyId, root);
assert.deepEqual(Object.keys(material.keys).sort(), [root, release].sort());
for (const [id, key] of Object.entries(material.keys))
  assert.equal(
    'sha256:' +
      createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex'),
    id,
  );
assert.deepEqual(material.policy.publishers, [
  { id: 'org.aquiero.alica', keyIds: [release], executionModes: ['ipc'] },
]);
const dir = mkdtempSync(join(tmpdir(), 'g7-public-trust-verification-'));
let host;
try {
  host = bootstrap(canonical({ ...config, cellId: 'g7-public-verification' }), {
    trust: material,
    statePath: join(dir, 'trust-state.json'),
    initialize: true,
  });
  host.createScope(config.rootScope);
  const state = JSON.parse(readFileSync(join(dir, 'trust-state.json'), 'utf8'));
  assert.equal(state.rootKeyId, root);
  assert.equal(state.policyDigest, digest(material.policy));
  console.log(
    JSON.stringify(
      {
        result: 'PASS',
        verifiedAt: new Date().toISOString(),
        rootKeyId: root,
        policyDigest: digest(material.policy),
        revocationDigest: digest(material.revocation),
        publicMaterialDigest: digest(material),
        scope:
          'Actual signed public metadata through public Kernel bootstrap API; ephemeral verifier state only; no provider activation or acceptance-host pinning',
      },
      null,
      2,
    ),
  );
} finally {
  if (host) await host.shutdown();
  rmSync(dir, { recursive: true, force: true });
}
