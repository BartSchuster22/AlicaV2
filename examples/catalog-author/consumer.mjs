import { definePlugin, clientEndpoint } from '@alica/plugin-sdk';

export function consumer(descriptor, requirement, receive) {
  return definePlugin({
    async activate(context) {
      const handle = await context.require(requirement);
      receive(clientEndpoint(handle, descriptor));
    },
  });
}
