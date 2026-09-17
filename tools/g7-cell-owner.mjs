// Fixed trusted-development owner entrypoint, not a candidate runtime loader.
import { closeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname, basename } from 'node:path';
import { parse, digest } from '@alica/acap-contracts';
import { CellPreparation } from './g7-cell.mjs';
import { OwnerChannel } from './g7-owner-channel.mjs';
import { openPrivateRoot, readPrivate } from './g7-durable.mjs';
const [root, input, rootFD, channelFD] = process.argv.slice(2);
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
try {
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
  await cell.install(f.archive, f.trust, f.authorization);
  for (;;) {
    const command = channel.next();
    await channel.send({ snapshot: snapshot() });
    if ((await command) === 'STOP') {
      await cell.shutdown();
      const stopped = snapshot();
      if (stopped.status !== 'STOPPED') throw new Error('CLEANUP_UNCERTAIN');
      await channel.send({ stopped });
      cell.close();
      process.exit(0);
    }
  }
} catch {
  // Never translate failed owner execution into clean reap. Custodian retains lock.
  await channel.send({ uncertain: true });
  process.exit(1);
}
