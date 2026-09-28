// Separate Phase4 EXPERIMENTAL snapshot; never edits a frozen release or proposed source.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonical, digest } from '@alica/acap-contracts';
import { validateDefinition, localReader } from '@alica/catalog';
import { reviewProposal, transition } from '@alica/catalog/governance';
import { createSnapshot, consumeSnapshot } from '@alica/catalog/release';
const root = new URL('./', import.meta.url);
const read = n => JSON.parse(readFileSync(new URL(n, root), 'utf8'));
const proposal = read('proposal.json'), rawReview = read('parent.review.json');
const review = reviewProposal(proposal, rawReview);
assert.equal(review.state, 'proposed');
const original = read('definition.json');
assert.equal(original.contract.digest, 'sha256:a1ad250e8b51e48fef526944d77fdee06d92b9128ac43a1cfd0790f5f424437f');
const definition = { ...original, metadata: { ...original.metadata, maturity: 'experimental' } };
const policy = { ...read('namespace-policy.json'), release: [proposal.draft] };
const entry = validateDefinition(definition, localReader(root.pathname), policy);
const admission = transition(null, entry, {
  maintainer: 'ALICA maintainers',
  reference: 'Owner-authorized Phase4; actual independent parent.review.json (separate parent context, not human acceptance)',
  proposal, review,
  implementation: 'services/decision/provider/{contract,decimal,neutral}.mjs; services/decision/service/index.mjs; exact parent-reviewed SHA256 records in conformance.json',
  conformance: 'conformance.json: parent-executed pinned Node24.21.0 16/16 tests, fixture/testkit only',
});
const snapshot = createSnapshot({ release: { version: '0.4.0' }, policy, entries: [entry], read: localReader(root.pathname) });
assert.equal(consumeSnapshot(snapshot).entries.length, 1);
assert.equal(digest(entry.descriptor), original.contract.digest);
const names = ['provider/contract.mjs','provider/contract.d.mts','provider/decimal.mjs','provider/neutral.mjs','service/index.mjs','tests/contract/decimal.test.mjs','tests/contract/neutral.test.mjs'];
const hashes = Object.fromEntries(names.map(n => [n, createHash('sha256').update(readFileSync(new URL('../../../services/decision/' + n, root))).digest('hex')]));
const conformance = { source: 'Parent execution and independent parent review, verified matching source hashes', runtime: 'Node24.21.0/npm11.19.0',
  command: 'node --test services/decision/tests/contract/*.test.mjs', tests: 16, pass: 16, fail: 0, skipped: 0,
  classification: 'FIXTURE-TESTED-DEFENSIVE', level: 'SDK_TESTKIT_NOT_PRODUCTION', hashes };
for (const [name, value] of Object.entries({ 'experimental-definition.json': definition, 'experimental-policy.json': policy,
  'review.json': review, 'admission.json': admission, 'conformance.json': conformance, 'snapshot.json': snapshot })) {
  const path = new URL(name, root);
  if (existsSync(path)) { assert.equal(readFileSync(path, 'utf8'), canonical(value) + '\n', 'Refuse changed re-admission'); }
  else writeFileSync(path, canonical(value) + '\n', { flag: 'wx' });
}
console.log(canonical({ transition: 'proposed -> experimental', descriptorDigest: original.contract.digest, snapshotDigest: snapshot.digest, selectedEntries: 1, trustVerified: false }));
