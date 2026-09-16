import {definePlugin} from '@alica/plugin-sdk';
import {descriptor} from '../generated/provider.mjs';
import type {handlers as GeneratedHandlers} from '../generated/provider.mjs';
export {descriptor};
// Handwritten implementation: generated scaffold handlers are never used.
export const handlers:typeof GeneratedHandlers={add:async input=>input.left+input.right};
export const activate=definePlugin({activate(ctx){ctx.provide(descriptor,handlers);ctx.log({level:'info',event:'checkpoint'})}}).activate;
