export * from './validation.js';
export * from './runtime.js';
export * from './stream.js';
export * from './tooling.js';
export * from './conformance.js';
import { schemas as data } from './schema-data.js';
import { freeze } from './validation.js';
export const schemas = freeze(data);
