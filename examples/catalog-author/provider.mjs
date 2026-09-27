import { definePlugin } from '@alica/plugin-sdk';

// Two independent neutral implementations; neither consumer nor contract names a provider.
export const handlersA = { echo: async (input) => ({ text: input.text }) };
export const handlersB = { echo: async ({ text }) => ({ text: String(text) }) };
export const provider = (descriptor, handlers) =>
  definePlugin({
    activate(context) {
      context.provide(descriptor, handlers);
    },
  });
