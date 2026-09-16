import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import type { Descriptor, Handler } from '@alica/acap-types';
/** CLI caller explicitly selects trusted code. Not a sandbox or an artifact trust verifier. */
export async function loadProvider(
  providerPath: string,
): Promise<{ descriptor: Descriptor; handlers: Record<string, Handler> }> {
  return await import(pathToFileURL(realpathSync(providerPath)).href);
}
