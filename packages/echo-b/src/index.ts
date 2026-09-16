import type { KernelContext, Descriptor, Value } from '@alica/acap-types';
const descriptor: Descriptor = {
  schemaVersion: 'acap.capability/v1',
  id: 'org.alica.echo',
  version: '1.0.0',
  features: [],
  operations: [
    {
      name: 'echo',
      kind: 'unary',
      input: {
        type: 'object',
        properties: { text: { type: 'string', maxLength: 4096 } },
        required: ['text'],
        additionalProperties: false,
      },
      output: {
        type: 'object',
        properties: { text: { type: 'string', maxLength: 4096 } },
        required: ['text'],
        additionalProperties: false,
      },
      idempotency: 'none',
    },
  ],
};
export async function activate(ctx: KernelContext): Promise<void> {
  ctx.provide(descriptor, {
    echo: async (input) => {
      const result: Record<string, Value> = {};
      for (const [key, value] of Object.entries(input as Record<string, Value>))
        if (key === 'text') result[key] = String(value);
      return result;
    },
  });
}
