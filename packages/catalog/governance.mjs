import { canonical, version, freeze } from '@alica/acap-contracts';
import { insist } from './index.mjs';

const equal = (a, b) => canonical(a) === canonical(b);
const includes = (a, b) => b.every((x) => a.includes(x));
const nonempty = (s) => typeof s === 'string' && s.trim().length > 0;

/** Compare accepted-value sets for the bounded ACAP JSON-schema subset.
 * direction=input: new accepts all old; output: old accepts all new.
 * Unknown schema constructs are never optimistically called compatible. */
function schemaCompatibility(old, next, direction, report, path) {
  if (equal(old, next)) return;
  const broad = direction === 'input' ? next : old;
  const narrow = direction === 'input' ? old : next;
  const supported = [
    'type',
    'properties',
    'required',
    'additionalProperties',
    'enum',
    'const',
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'items',
    'description',
    'title',
  ];
  if (
    [...Object.keys(old), ...Object.keys(next)].some(
      (k) => !supported.includes(k),
    )
  ) {
    report('REVIEW_REQUIRED', path + ': unsupported schema change');
    return;
  }
  if (broad.type !== narrow.type) {
    report('BREAKING', path + ': type changed');
    return;
  }
  if (
    'const' in broad &&
    (!('const' in narrow) || !equal(broad.const, narrow.const))
  )
    report('BREAKING', path + ': const restriction');
  if (
    broad.enum &&
    (!narrow.enum ||
      !narrow.enum.every((v) => broad.enum.some((x) => equal(x, v))))
  )
    report('BREAKING', path + ': enum restriction');
  for (const key of ['minimum', 'minLength', 'minItems'])
    if (key in broad && (!(key in narrow) || broad[key] > narrow[key]))
      report('BREAKING', path + ': ' + key);
  for (const key of ['maximum', 'maxLength', 'maxItems'])
    if (key in broad && (!(key in narrow) || broad[key] < narrow[key]))
      report('BREAKING', path + ': ' + key);
  if (broad.type === 'object') {
    if (!includes(narrow.required || [], broad.required || []))
      report('BREAKING', path + ': required field restriction');
    const bp = broad.properties || {},
      np = narrow.properties || {};
    if (
      broad.additionalProperties === false &&
      narrow.additionalProperties !== false
    )
      report('BREAKING', path + ': additional properties restricted');
    for (const name of new Set([...Object.keys(bp), ...Object.keys(np)])) {
      if (!(name in bp)) {
        if (broad.additionalProperties === false)
          report('BREAKING', path + ': field rejected ' + name);
      } else if (!(name in np)) {
        if (narrow.additionalProperties !== false)
          report('REVIEW_REQUIRED', path + ': unconstrained field ' + name);
      } else
        schemaCompatibility(
          direction === 'input' ? np[name] : bp[name],
          direction === 'input' ? bp[name] : np[name],
          direction,
          report,
          path + '.' + name,
        );
    }
  }
  if (broad.type === 'array') {
    if (broad.items && narrow.items)
      schemaCompatibility(
        old.items,
        next.items,
        direction,
        report,
        path + '[]',
      );
    else if (broad.items) report('BREAKING', path + ': items restricted');
  }
  if (old.description !== next.description || old.title !== next.title)
    report('REVIEW_REQUIRED', path + ': schema meaning changed');
}

/** Arguments are validated entries returned by validateDefinition. */
export function compatibility(previous, proposed) {
  const reasons = [];
  const report = (classification, reason) =>
    reasons.push({ classification, reason });
  const a = previous.definition,
    b = proposed.definition;
  if (
    a.metadata.id.replace(/@\d+$/, '') !== b.metadata.id.replace(/@\d+$/, '') ||
    a.contract.identity !== b.contract.identity
  )
    report('BREAKING', 'contract identity changed');
  const ao = previous.descriptor.operations,
    bo = proposed.descriptor.operations;
  for (const op of ao) {
    const next = bo.find((x) => x.name === op.name);
    if (!next) {
      report('BREAKING', 'operation removed: ' + op.name);
      continue;
    }
    for (const key of new Set([...Object.keys(op), ...Object.keys(next)])) {
      if (['name', 'input', 'output'].includes(key)) continue;
      if (!equal(op[key] ?? null, next[key] ?? null))
        report(
          ['kind', 'idempotency'].includes(key)
            ? 'BREAKING'
            : 'REVIEW_REQUIRED',
          op.name + ': ' + key + ' changed',
        );
    }
    schemaCompatibility(
      op.input,
      next.input,
      'input',
      report,
      op.name + '.input',
    );
    schemaCompatibility(
      op.output,
      next.output,
      'output',
      report,
      op.name + '.output',
    );
  }
  if (!includes(a.permissions, b.permissions))
    report('BREAKING', 'permission requirement increased');
  if (!includes(b.scopes, a.scopes)) report('BREAKING', 'scope removed');
  if (!equal(a.dependencies, b.dependencies))
    report('REVIEW_REQUIRED', 'dependencies changed');
  if (!equal(a.events, b.events) || !equal(previous.events, proposed.events))
    report('REVIEW_REQUIRED', 'events changed');
  if (!equal(previous.descriptor.features, proposed.descriptor.features))
    report('REVIEW_REQUIRED', 'ACAP features changed');
  if (!equal(a.semantics.errors, b.semantics.errors))
    report('REVIEW_REQUIRED', 'error vocabulary changed');
  if (a.semantics.cancellation !== b.semantics.cancellation)
    report(
      a.semantics.cancellation === 'supported' ? 'BREAKING' : 'REVIEW_REQUIRED',
      'cancellation changed',
    );
  if (a.semantics.description !== b.semantics.description)
    report('REVIEW_REQUIRED', 'contract meaning changed');
  const classification = reasons.some((x) => x.classification === 'BREAKING')
    ? 'BREAKING'
    : reasons.length
      ? 'REVIEW_REQUIRED'
      : 'BACKWARD_COMPATIBLE';
  return freeze({ classification, reasons });
}

export function validateProposal(p) {
  const keys = [
    'apiVersion',
    'id',
    'problem',
    'existingInsufficient',
    'abstraction',
    'providers',
    'consumers',
    'draft',
    'alternatives',
    'security',
    'scopes',
    'compatibility',
    'genericRationale',
    'proposer',
  ];
  insist(
    p && Object.keys(p).sort().join() === keys.sort().join(),
    'INVALID_PROPOSAL',
  );
  insist(p.apiVersion === 'catalog.alica.io/proposal-v1', 'INVALID_PROPOSAL');
  for (const key of keys.filter(
    (k) => !['apiVersion', 'providers', 'consumers'].includes(k),
  ))
    insist(nonempty(p[key]), 'INVALID_PROPOSAL');
  for (const key of ['providers', 'consumers'])
    insist(
      Array.isArray(p[key]) && p[key].length > 0 && p[key].every(nonempty),
      'INVALID_PROPOSAL',
    );
  return freeze(structuredClone(p));
}

/** Review records are local governance inputs, not signatures or an authorization service. */
export function reviewProposal(proposal, review) {
  validateProposal(proposal);
  insist(
    review &&
      review.proposal === proposal.id &&
      nonempty(review.reviewer) &&
      review.reviewer !== proposal.proposer &&
      nonempty(review.rationale) &&
      ['accepted', 'rejected'].includes(review.decision),
    'INVALID_REVIEW',
  );
  insist(
    ['abstraction', 'security', 'scopes', 'compatibility'].every(
      (k) => review.checks?.[k] === true,
    ),
    'INCOMPLETE_REVIEW',
  );
  return freeze({
    proposal: proposal.id,
    state: review.decision === 'accepted' ? 'proposed' : 'rejected',
    review: structuredClone(review),
  });
}

export function transition(previous, proposed, evidence) {
  const a = previous?.definition,
    b = proposed.definition;
  const state = a?.metadata.maturity ?? 'proposed';
  const target = b.metadata.maturity;
  insist(
    evidence && nonempty(evidence.maintainer) && nonempty(evidence.reference),
    'MISSING_EVIDENCE',
  );
  insist(
    evidence.review?.state === 'proposed' &&
      evidence.proposal?.draft === b.metadata.id,
    'UNACCEPTED_PROPOSAL',
  );
  const reviewed = reviewProposal(evidence.proposal, evidence.review.review);
  insist(equal(reviewed, evidence.review), 'INVALID_REVIEW');
  insist(evidence.maintainer === b.metadata.owner, 'UNAUTHORIZED_MAINTAINER');
  const allowed = {
    proposed: ['experimental'],
    experimental: ['experimental', 'stable'],
    stable: ['stable', 'deprecated'],
    deprecated: ['deprecated', 'retired'],
    retired: [],
  };
  insist(allowed[state]?.includes(target), 'ILLEGAL_TRANSITION');
  if (!a || state === 'experimental' || target === 'stable')
    insist(
      nonempty(evidence.implementation) && nonempty(evidence.conformance),
      'MISSING_CONFORMANCE',
    );
  if (target === 'deprecated' || target === 'retired')
    insist(
      nonempty(evidence.migration) && nonempty(evidence.replacement),
      'MISSING_MIGRATION',
    );
  if (a) {
    insist(
      a.metadata.id === b.metadata.id && a.metadata.owner === b.metadata.owner,
      'HISTORY_IDENTITY_MISMATCH',
    );
    const av = version(a.metadata.version),
      bv = version(b.metadata.version);
    insist(
      bv[0] === av[0] && (bv[1] > av[1] || (bv[1] === av[1] && bv[2] >= av[2])),
      'VERSION_REGRESSION',
    );
    const oldContract = {
      descriptor: previous.descriptor,
      events: previous.events,
      semantics: a.semantics,
      scopes: a.scopes,
      permissions: a.permissions,
      dependencies: a.dependencies,
    };
    const newContract = {
      descriptor: proposed.descriptor,
      events: proposed.events,
      semantics: b.semantics,
      scopes: b.scopes,
      permissions: b.permissions,
      dependencies: b.dependencies,
    };
    if (a.metadata.version === b.metadata.version)
      insist(equal(oldContract, newContract), 'IMMUTABLE_VERSION');
    const result = compatibility(previous, proposed);
    if (['stable', 'deprecated'].includes(state) || target === 'stable') {
      insist(result.classification !== 'BREAKING', 'STABLE_BREAKING_CHANGE');
      if (result.classification === 'REVIEW_REQUIRED')
        insist(nonempty(evidence.compatibilityReview), 'REVIEW_REQUIRED');
      const added = proposed.descriptor.operations.some(
        (op) => !previous.descriptor.operations.some((x) => x.name === op.name),
      );
      if (added) insist(bv[1] > av[1], 'MINOR_REQUIRED');
    }
  }
  return freeze({
    previous: a
      ? { id: a.metadata.id, version: a.metadata.version, maturity: state }
      : null,
    accepted: structuredClone(b),
    evidence: structuredClone(evidence),
  });
}
