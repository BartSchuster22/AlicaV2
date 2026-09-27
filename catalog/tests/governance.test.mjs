import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '@alica/acap-contracts';
import { localReader, validateDefinition } from '@alica/catalog';
import {
  compatibility,
  validateProposal,
  reviewProposal,
  transition,
} from '@alica/catalog/governance';
const read = localReader('catalog');
const definition = JSON.parse(read('capabilities/core/echo/definition.json'));
const descriptor = JSON.parse(read(definition.contract.descriptor));
const policy = JSON.parse(read('governance/namespaces.json'));
function entry(edit = () => {}, v = '1.0.0', maturity = 'experimental') {
  const d = structuredClone(definition),
    c = structuredClone(descriptor);
  d.metadata.version = c.version = d.contract.version = v;
  d.metadata.maturity = maturity;
  edit(d, c);
  d.contract.digest = digest(c);
  return validateDefinition(d, () => Buffer.from(JSON.stringify(c)), policy);
}
const proposal = {
  apiVersion: 'catalog.alica.io/proposal-v1',
  id: 'echo-reference',
  problem: 'External authors need a neutral interoperability proof.',
  existingInsufficient: 'No Catalog contract exists at baseline.',
  abstraction: 'Bounded text round-trip, independent of implementation.',
  providers: ['neutral reference'],
  consumers: ['external author fixture'],
  draft: definition.metadata.id,
  alternatives: 'Use arithmetic; text needs no numerical semantics.',
  security: 'Bounded payload; no persistence or grant.',
  scopes: 'Application and session.',
  compatibility: 'Preserve accepted input and promised output.',
  genericRationale: 'No product-specific behavior.',
  proposer: 'reference author',
};
const review = reviewProposal(proposal, {
  proposal: proposal.id,
  reviewer: 'reference reviewer',
  rationale: 'Neutral and bounded.',
  decision: 'accepted',
  checks: {
    abstraction: true,
    security: true,
    scopes: true,
    compatibility: true,
  },
});
const evidence = {
  proposal,
  review,
  maintainer: definition.metadata.owner,
  reference: 'catalog/tests/governance.test.mjs',
  implementation: 'catalog/tests/model.test.mjs',
  conformance: 'public ACAP runConformance test',
};
const classify = (edit, v = '1.1.0') =>
  compatibility(entry(), entry(edit, v)).classification;

test('C6 input widening and output narrowing have distinct variance', () => {
  assert.equal(
    classify(
      (d, c) => (c.operations[0].input.properties.note = { type: 'string' }),
    ),
    'BACKWARD_COMPATIBLE',
  );
  assert.equal(
    classify((d, c) => {
      c.operations[0].input.properties.note = { type: 'string' };
      c.operations[0].input.required.push('note');
    }),
    'BREAKING',
  );
  assert.equal(
    classify(
      (d, c) => (c.operations[0].input.properties.text.maxLength = 8000),
    ),
    'BACKWARD_COMPATIBLE',
  );
  assert.equal(
    classify((d, c) => (c.operations[0].input.properties.text.maxLength = 20)),
    'BREAKING',
  );
  assert.equal(
    classify((d, c) => (c.operations[0].output.properties.text.maxLength = 20)),
    'BACKWARD_COMPATIBLE',
  );
  assert.equal(
    classify(
      (d, c) => (c.operations[0].output.properties.text.maxLength = 8000),
    ),
    'BREAKING',
  );
  assert.equal(
    classify((d, c) => (c.operations[0].output.required = [])),
    'BREAKING',
  );
  assert.equal(
    classify(
      (d, c) => (c.operations[0].output.properties.note = { type: 'string' }),
    ),
    'BREAKING',
  );
});
test('C6 removed operation, streaming, semantics, permissions, scopes and errors', () => {
  assert.equal(
    classify((d, c) => (c.operations[0].name = 'other')),
    'BREAKING',
  );
  assert.equal(
    classify((d, c) => {
      c.operations[0].idempotency = 'provider';
      c.operations[0].idempotencyPolicy = {
        retentionMs: 1000,
        persistence: 'instance',
      };
    }),
    'BREAKING',
  );
  assert.equal(
    classify((d) => d.permissions.push('example.extra')),
    'BREAKING',
  );
  assert.equal(
    classify((d) => (d.scopes = ['application'])),
    'BREAKING',
  );
  assert.equal(
    classify((d) => (d.semantics.cancellation = 'unsupported')),
    'BREAKING',
  );
  assert.equal(
    classify((d) => d.semantics.errors.push('INTERNAL')),
    'REVIEW_REQUIRED',
  );
  assert.equal(
    classify((d) => (d.semantics.description += ' Changed.')),
    'REVIEW_REQUIRED',
  );
  assert.equal(
    classify((d) =>
      d.dependencies.push({
        capability: 'acap://alica.io/example/base@1',
        version: '^1.0.0',
        required: false,
      }),
    ),
    'REVIEW_REQUIRED',
  );
  // Supported ACAP stream descriptor structure is not guessed here: comparator
  // must reject a changed operation kind even independently of schema validation.
  const a = structuredClone(entry()),
    b = structuredClone(entry());
  b.descriptor.operations[0].kind = 'stream';
  assert.equal(compatibility(a, b).classification, 'BREAKING');
});
test('C9 proposal and independent complete review; rejection never becomes release history', () => {
  assert.equal(validateProposal(proposal).id, proposal.id);
  assert.throws(() => validateProposal({ ...proposal, problem: ' ' }), {
    code: 'INVALID_PROPOSAL',
  });
  assert.throws(() => validateProposal({ ...proposal, providers: [] }), {
    code: 'INVALID_PROPOSAL',
  });
  assert.throws(
    () =>
      reviewProposal(proposal, {
        ...review.review,
        reviewer: proposal.proposer,
      }),
    { code: 'INVALID_REVIEW' },
  );
  assert.throws(
    () => reviewProposal(proposal, { ...review.review, checks: {} }),
    { code: 'INCOMPLETE_REVIEW' },
  );
  const rejected = reviewProposal(proposal, {
    ...review.review,
    decision: 'rejected',
  });
  assert.equal(rejected.state, 'rejected');
  assert.throws(
    () => transition(null, entry(), { ...evidence, review: rejected }),
    { code: 'UNACCEPTED_PROPOSAL' },
  );
});
test('C4 actual previous state, evidence, legal promotion, deprecation and retirement', () => {
  const experimental = entry(),
    stable = entry(() => {}, '1.0.0', 'stable');
  assert.equal(
    transition(null, experimental, evidence).accepted.metadata.maturity,
    'experimental',
  );
  assert.throws(() => transition(null, stable, evidence), {
    code: 'ILLEGAL_TRANSITION',
  });
  assert.throws(
    () => transition(null, experimental, { ...evidence, conformance: '' }),
    { code: 'MISSING_CONFORMANCE' },
  );
  assert.equal(
    transition(experimental, stable, evidence).accepted.metadata.maturity,
    'stable',
  );
  assert.throws(() => transition(stable, experimental, evidence), {
    code: 'ILLEGAL_TRANSITION',
  });
  const deprecated = entry(() => {}, '1.0.0', 'deprecated'),
    retired = entry(() => {}, '1.0.0', 'retired');
  assert.throws(() => transition(stable, deprecated, evidence), {
    code: 'MISSING_MIGRATION',
  });
  const migration = {
    ...evidence,
    migration: 'Consumers should stop using the reference.',
    replacement: 'No successor; remove the example dependency.',
  };
  assert.equal(
    transition(stable, deprecated, migration).accepted.metadata.maturity,
    'deprecated',
  );
  assert.equal(
    transition(deprecated, retired, migration).accepted.metadata.maturity,
    'retired',
  );
  assert.throws(() => transition(retired, stable, migration), {
    code: 'ILLEGAL_TRANSITION',
  });
});
test('C4 C5 C6 released version immutable, stable break rejected and semantics reviewed', () => {
  const stable = entry(() => {}, '1.0.0', 'stable');
  assert.throws(
    () =>
      transition(
        stable,
        entry((d) => (d.semantics.description += ' edit'), '1.0.0', 'stable'),
        evidence,
      ),
    { code: 'IMMUTABLE_VERSION' },
  );
  assert.throws(
    () =>
      transition(
        stable,
        entry(
          (d, c) => (c.operations[0].input.properties.text.maxLength = 10),
          '1.1.0',
          'stable',
        ),
        evidence,
      ),
    { code: 'STABLE_BREAKING_CHANGE' },
  );
  const changed = entry(
    (d) => (d.semantics.description += ' clarification'),
    '1.0.1',
    'stable',
  );
  assert.throws(() => transition(stable, changed, evidence), {
    code: 'REVIEW_REQUIRED',
  });
  assert.equal(
    transition(stable, changed, {
      ...evidence,
      compatibilityReview:
        'Reviewed semantic clarification; behavior unchanged.',
    }).accepted.metadata.version,
    '1.0.1',
  );
  assert.throws(
    () =>
      transition(
        stable,
        entry(
          (d, c) =>
            c.operations.push({
              ...structuredClone(c.operations[0]),
              name: 'again',
            }),
          '1.0.1',
          'stable',
        ),
        evidence,
      ),
    { code: 'MINOR_REQUIRED' },
  );
  assert.throws(
    () =>
      transition(
        entry(() => {}, '1.1.0', 'stable'),
        stable,
        evidence,
      ),
    { code: 'VERSION_REGRESSION' },
  );
});
