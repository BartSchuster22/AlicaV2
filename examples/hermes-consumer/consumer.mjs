// Unchanged public SDK consumer. No operator, Kernel, or Hermes imports.
import {createPluginContext} from '@alica/plugin-sdk';
export async function execute(context, descriptor, task, options) {
  const sdk = createPluginContext(context);
  const handle = await sdk.require({capabilityId:descriptor.id,major:1,minMinor:0,operations:['execute'],features:[]});
  return handle.call('execute', {task}, options);
}
