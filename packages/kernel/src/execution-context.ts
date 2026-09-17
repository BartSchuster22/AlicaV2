import { AsyncLocalStorage } from 'node:async_hooks';
import type { WorkContext } from './g6/scheduler.js';
/** Broker-only causal object capabilities; never reconstructed from peer JSON. */
export const causalContext = new AsyncLocalStorage<WorkContext>();
export const callAuthority = new AsyncLocalStorage<{
  grantId: string;
  grantRevision: number;
}>();
export const cleanupSelection = new AsyncLocalStorage<{ end: number }>();
