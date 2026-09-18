const requirement = {
    capabilityId: 'org.alica.echo',
    major: 1,
    minMinor: 0,
    operations: ['echo'],
    features: [],
};
const descriptor = {
    schemaVersion: 'acap.capability/v1',
    id: 'org.alica.consumer',
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
    const echo = await ctx.require(requirement);
    ctx.provide(descriptor, {
        echo: async (input, operation) => echo.call('echo', input, {
            deadlineMs: operation.deadlineMs,
            signal: operation.signal,
        }),
    });
}
