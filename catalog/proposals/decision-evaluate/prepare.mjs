import { writeFileSync } from 'node:fs';
import { canonical, digest, descriptor as validateDescriptor } from '@alica/acap-contracts';
import { validateDefinition, localReader } from '@alica/catalog';
import { validateProposal } from '@alica/catalog/governance';

const string = { type: 'string', minLength: 1, maxLength: 128 };
const decimal = { type: 'string', minLength: 1, maxLength: 38, description: 'DecisionDecimal; exact canonical base-10, max36 digits/max18 fractional; semantic validator mandatory.' };
const document = { type: 'object', properties: { json: { type: 'string', minLength: 2, maxLength: 32768 } }, required: ['json'], additionalProperties: false, description: 'Canonical encoded structured document; reserved singleton $decisionDecimal encodes numeric decimals. See SEMANTICS.md.' };
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const array = items => ({ type: 'array', items, minItems: 1, maxItems: 32 });
const option = object({ id: string, description: document });
const level = object({ id: string, value: decimal, description: document });
const question = object({ name: string, kind: { type: 'string', enum: ['boolean', 'choice', 'score'] }, instructions: document,
  criteria: object({ true: document, false: document }, []), options: array(option), levels: array(level) }, ['name','kind','instructions']);
const answer = object({ name: string, kind: { type: 'string', enum: ['boolean','choice','score'] }, probability: decimal,
  selected: string, confidence: decimal, expectedScore: decimal,
  distribution: array(object({ id: string, probability: decimal })), legend: array(level) }, ['name','kind']);
const descriptor = {
  schemaVersion: 'acap.capability/v1', id: 'io.alica.decision.evaluate', version: '1.0.0', features: [],
  operations: [{ name: 'evaluate', kind: 'unary', idempotency: 'none',
    input: object({ state: document, model: string, questions: array(question) }, ['state','questions']),
    output: object({ provider: string, model: string, answers: array(answer), usage: object({
      inputTokens: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
      outputTokens: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
    }) }),
  }],
};
const policy = { apiVersion: 'catalog.alica.io/namespace-v1', version: '1.0.0', namespaces: [
  { authority: 'alica.io', domain: 'decision', kind: 'first-party', owner: 'ALICA maintainers' },
], release: [] };
const definition = { apiVersion: 'catalog.alica.io/v1', kind: 'CapabilityDefinition', metadata: {
  id: 'acap://alica.io/decision/evaluate@1', version: '1.0.0', maturity: 'proposed', owner: 'ALICA maintainers',
  summary: 'Named typed probabilistic decisions over a bounded shared document, independent of the decision engine.',
}, contract: { descriptor: 'descriptor.json', identity: descriptor.id, version: descriptor.version, digest: digest(descriptor) },
semantics: { description: 'Evaluate once without thresholding, rounding, renormalization or idempotency promise. Normative proposed SEMANTICS.md defines decimal, correspondence, limits and conditional shape. Provider-reported confidence is metadata, not calibration.',
  cancellation: 'supported', errors: ['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','CONTRACT_MISMATCH','DEADLINE_EXCEEDED','CANCELLED','UNAVAILABLE','RESOURCE_EXHAUSTED','FAILED_PRECONDITION'] },
scopes: ['application','session'], permissions: ['decision.evaluate'], dependencies: [], events: [] };
const proposal = { apiVersion: 'catalog.alica.io/proposal-v1', id: 'phase4-decision-evaluate-v1',
  problem: 'An external consumer needs typed probabilistic Boolean, Choice and Score decisions without an engine-specific protocol.',
  existingInsufficient: 'Frozen Echo only round-trips text; Agent Execution runs agents and does not define decisions or fractional probability representation. Neither expresses named decision distributions.',
  abstraction: 'Single unary bounded evaluate on a shared structured state with named typed questions, resolved model, exact decimal uncertainty and generic token usage.',
  providers: ['Deterministic neutral reference provider (implemented)', 'TypeSafe Jev adapter (planned; public API0.2.0 pinned, not live-qualified)'],
  consumers: ['Independent external public-SDK decision consumer'], draft: definition.metadata.id,
  alternatives: 'Reuse Echo/Agent Execution rejected for semantic mismatch; provider-named capability rejected for coupling; adding floating point to frozen ACAP prohibited.',
  security: 'Host alone grants call authority; provider selected by host configuration, no request-side provider routing. Disable switch. No secrets/state/raw provider errors logged. All live work needs separate fixed durable aggregate ledger.',
  scopes: 'application/session, operation evaluate, permission decision.evaluate, no new Kernel scope or grant type.',
  compatibility: 'New URI/identity, no changes to frozen entries or policies. Proposed namespace-policy release list empty pending independent maintainer review/admission.',
  genericRationale: 'Neutral implementation imports no TypeSafe code. Arbitrary explicit Score levels and typed fractional documents do not assume any provider wire schema. Engine adapters may reject unsupported rubrics explicitly.',
  proposer: 'Hermes Phase4 implementation worker',
};
validateDescriptor(canonical(descriptor)); validateProposal(proposal);
for (const [name, value] of Object.entries({ 'descriptor.json': descriptor, 'definition.json': definition, 'namespace-policy.json': policy, 'proposal.json': proposal })) {
  writeFileSync(new URL(name, import.meta.url), JSON.stringify(value, null, 2) + '\n');
}
validateDefinition(definition, localReader(new URL('.', import.meta.url).pathname), policy, { release: false });
console.log(JSON.stringify({ state: 'PROPOSAL_VALIDATED_NOT_ADMITTED', descriptorDigest: digest(descriptor), releaseEntries: 0 }));
