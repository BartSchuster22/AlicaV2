// Fixed trusted-development owner entrypoint, not a candidate runtime loader.
import { closeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname, basename } from 'node:path';
import { parse, digest, check } from '@alica/acap-contracts';
import { CellPreparation } from './g7-cell.mjs';
import { OwnerChannel } from './g7-owner-channel.mjs';
import { openPrivateRoot, readPrivate } from './g7-durable.mjs';
import { bootOwnerCheckpointIngress } from './g7-owner-ingress-boot.mjs';
// Trusted launcher opt-in only; no config, credentials or identity on argv.
// Strip only a trailing pair; validate the entire grammar before dependent IO.
const args = process.argv.slice(2);
const ingressOptIn = args.at(-2) === '--owner-checkpoint-ingress';
const ingressPath = ingressOptIn ? args.pop() : undefined;
if (ingressOptIn) args.pop();
const [root, input, rootFD, channelFD, acceptedDigest, inputDigest] = args;
// Socket-close callbacks cannot interrupt synchronous IO. Establish the OS
// parent-death guard before adopting custody or executing any Cell operation.
createRequire(import.meta.url)('../native/g7/build/ownership.node').guardParent(
  Number(channelFD),
);
const channel = new OwnerChannel(Number(channelFD));
const cell = new CellPreparation(root, { fd: Number(rootFD), channel });
closeSync(Number(rootFD));
function snapshot() {
  const s = cell.status();
  return {
    status: s.runtime,
    sequence: s.accepted?.sequence ?? 0,
    acceptedDigest: s.accepted ? digest(s.accepted) : null,
  };
}
let ingress;
try {
  if (args.length < 4 || args.length > 6 ||
      args.some(arg => arg.startsWith('--')) ||
      (ingressOptIn && (typeof ingressPath !== 'string' ||
        !ingressPath.startsWith('/') || ingressPath.includes('\0') ||
        Buffer.byteLength(ingressPath) > 104)))
    throw new Error('INVALID');
  if (ingressOptIn) {
    ingress = bootOwnerCheckpointIngress(ingressPath);
    await ingress.ready; // no dependent Cell operation before listener readiness
  }
  const path = resolve(input),
    fd = openPrivateRoot(dirname(path));
  let f;
  try {
    f = parse(readPrivate(fd, basename(path)));
  } finally {
    closeSync(fd);
  }
  if (Object.keys(f).sort().join(',') !== 'archive,authorization,trust')
    throw new Error('INVALID');
  // Private inception binding, not authority supplied by a checkpoint/candidate.
  // Check this same parsed snapshot before floor advancement or readiness.
  if (inputDigest !== undefined)
    check(acceptedDigest !== undefined && digest(f) === inputDigest, 'CONFLICT');
  if (acceptedDigest !== undefined)
    await cell.startAccepted(f.trust, f.authorization, acceptedDigest);
  else await cell.install(f.archive, f.trust, f.authorization);
  for (;;) {
    const command = channel.next();
    await channel.send({ snapshot: snapshot() });
    if ((await command) === 'STOP') {
      // close() revokes synchronously; completion precedes shutdown/reporting.
      await ingress?.close();
      await cell.shutdown();
      const stopped = snapshot();
      if (stopped.status !== 'STOPPED') throw new Error('CLEANUP_UNCERTAIN');
      await channel.send({ stopped });
      cell.close();
      process.exit(0);
    }
  }
} catch {
  // Revoke immediately; even failed cleanup is uncertainty, never a clean stop.
  try { await ingress?.close(); } catch {}
  // Never translate failed owner execution into clean reap. Custodian retains lock.
  await channel.send({ uncertain: true });
  process.exit(1);
}
