const descriptor = {
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
export async function activate(ctx) {
    ctx.provide(descriptor, {
        echo: async (input) => ({ text: input.text }),
    });
}
