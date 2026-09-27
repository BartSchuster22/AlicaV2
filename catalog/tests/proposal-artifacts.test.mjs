import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { localReader, validateDefinition } from '@alica/catalog';
import {
  validateProposal,
  reviewProposal,
  transition,
} from '@alica/catalog/governance';

const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
test('C9 shipped schema, template, proposal and reference review correspond', () => {
  const validate = new Ajv({ strict: true }).compile(
    json('catalog/schemas/proposal.schema.json'),
  );
  const proposal = json('catalog/proposals/echo-reference.json');
  const template = json('catalog/proposals/templates/proposal.json');
  assert.equal(validate(proposal), true, JSON.stringify(validate.errors));
  assert.deepEqual(validateProposal(proposal), proposal);
  for (const candidate of [
    template,
    { ...proposal, problem: '  ' },
    { ...proposal, providers: [] },
    { ...proposal, extra: true },
    { ...proposal, consumers: [5] },
  ]) {
    assert.equal(validate(candidate), false);
    assert.throws(() => validateProposal(candidate), {
      code: 'INVALID_PROPOSAL',
    });
  }
  const review = reviewProposal(
    proposal,
    json('catalog/proposals/echo-reference.review.json'),
  );
  const read = localReader('catalog');
  const definition = json('catalog/capabilities/core/echo/definition.json');
  const entry = validateDefinition(
    definition,
    read,
    json('catalog/governance/namespaces.json'),
  );
  const record = transition(null, entry, {
    proposal,
    review,
    maintainer: definition.metadata.owner,
    reference: 'catalog/proposals/echo-reference.json',
    implementation: 'catalog/tests/model.test.mjs',
    conformance: 'catalog/tests/model.test.mjs: public ACAP runConformance',
  });
  assert.equal(record.accepted.metadata.maturity, 'experimental');
  assert.equal(record.previous, null);
});
