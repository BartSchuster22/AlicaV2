// This independently installed author module knows only public SDK + Catalog.
// It is unchanged when the operator selects neutral vs Jev. No key/provider imports.
import { definePlugin, clientEndpoint } from '@alica/plugin-sdk';
import { consumeSnapshot } from '@alica/catalog/release';
export function consumer(snapshot) {
  const selected = consumeSnapshot(snapshot);
  const entry = selected.entries.find(e => e.definition.metadata.id === 'acap://alica.io/decision/evaluate@1');
  if (!entry || entry.definition.metadata.maturity !== 'experimental') throw new Error('CONTRACT_MISMATCH');
  const requirement = { capabilityId: entry.descriptor.id, major: 1, minMinor: 0, operations: ['evaluate'], features: [] };
  let endpoint;
  return {
    plugin: definePlugin({ async activate(context) { endpoint = clientEndpoint(await context.require(requirement), entry.descriptor); } }),
    evaluate(request, options) {
      if (!endpoint) throw new Error('FAILED_PRECONDITION');
      return endpoint.call('evaluate', request, options);
    },
    catalog: { digest: selected.digest, trustVerified: selected.trustVerified },
  };
}
