// Read-only release inspector. This worker does NOT certify stopped custody,
// mint a reinstall permit, start providers, or retire supervision residue.
// Only its owning coordinator can combine its result with the actual owned reaps.
import { closeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname, basename } from 'node:path';
import { canonical, parse, digest, check } from '@alica/acap-contracts';
import { CellPreparation, cellSchema } from './g7-cell.mjs';
import { OwnerChannel } from './g7-owner-channel.mjs';
import { openPrivateRoot, readPrivate } from './g7-durable.mjs';
import {
  inspectStoredRelease,
  inspectRelease,
  verifyCurrentTrust,
} from './g7-release.mjs';
const [root, input, rootFD, channelFD] = process.argv.slice(2);
const native = createRequire(import.meta.url)(
  '../native/g7/build/ownership.node',
);
native.guardParent(Number(channelFD));
const channel = new OwnerChannel(Number(channelFD));
const cell = new CellPreparation(root, { fd: Number(rootFD), channel });
const fd = Number(rootFD);
try {
  const path = resolve(input),
    inputFD = openPrivateRoot(dirname(path));
  let f;
  try {
    f = parse(readPrivate(inputFD, basename(path)));
  } finally {
    closeSync(inputFD);
  }
  check(Object.keys(f).sort().join(',') === 'archive,authorization,trust');
  const before = cell.status(),
    accepted = before.accepted;
  check(
    accepted &&
      before.transactions.every((t) =>
        ['COMMITTED', 'ABORTED'].includes(t.state),
      ),
  );
  cellSchema('authorization', f.authorization);
  const prefix = 'releases/' + accepted.release.bundleDigest.slice(7);
  check(digest(f.authorization) === accepted.release.authorizationDigest);
  check(
    canonical(parse(readPrivate(fd, prefix + '/authorization.json'))) ===
      canonical(f.authorization),
  );
  const stored = inspectStoredRelease(fd, prefix, f.trust, before.trustFloor);
  const requested = inspectRelease(f.archive, f.trust, before.trustFloor);
  for (const key of [
    'bundleDigest',
    'profileDigest',
    'lockDigest',
    'policyDigest',
  ]) {
    check(
      stored[key] === accepted.release[key] && requested[key] === stored[key],
    );
  }
  verifyCurrentTrust(f.trust, before.trustFloor);
  check(canonical(cell.status()) === canonical(before));
  cell.close();
  closeSync(fd);
  process.stdout.write(
    JSON.stringify({
      sequence: accepted.sequence,
      acceptedDigest: digest(accepted),
      release: accepted.release,
    }),
    () => process.exit(0),
  );
} catch {
  // No paths or credential material in diagnostics. Nonzero exit cannot certify.
  process.exit(1);
}
