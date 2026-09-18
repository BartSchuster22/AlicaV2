// Test-only real syscall boundary stops; no receipt, clock or Kernel substitution.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { OwnerChannel } from '../../tools/g7-owner-channel.mjs';
import { durableWrite, openPrivateRoot } from '../../tools/g7-durable.mjs';
const { renameSync, fsyncSync } = fs;
let directory,
  fired = false;
const enabled = () =>
  process.env.G7_ADMIN_PRIOR !== '1' || process.argv.length === 7;
function stop(boundary) {
  if (!enabled() || fired || boundary !== process.env.G7_ADMIN_BOUNDARY) return;
  fired = true;
  fs.writeFileSync(
    process.env.G7_ADMIN_MARKER,
    JSON.stringify({ pid: process.pid, boundary }),
    { mode: 0o600 },
  );
  process.kill(process.pid, 'SIGSTOP');
}
fs.renameSync = function (from, to) {
  const accepted = String(to).endsWith('/accepted.json');
  if (accepted) stop('before-rename');
  const result = renameSync(from, to);
  if (accepted) {
    directory = Number(String(to).split('/')[4]);
    stop('after-rename');
  }
  return result;
};
fs.fsyncSync = function (fd) {
  const parent = fd === directory;
  if (parent) stop('before-directory-fsync');
  const result = fsyncSync(fd);
  if (parent) {
    stop('after-directory-fsync');
    directory = undefined;
  } else if (enabled() && !fired && fs.fstatSync(fd).isFile()) {
    const path = fs.readlinkSync('/proc/self/fd/' + fd);
    if (path.includes('/next-')) {
      const text = fs.readFileSync(path, 'utf8');
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        /* non-JSON release artifact */
      }
      if (value?.schemaVersion === 'alica.cell-accepted/v1')
        stop('after-file-fsync');
    }
  }
  return result;
};
syncBuiltinESMExports();
const send = OwnerChannel.prototype.send;
OwnerChannel.prototype.send = async function (message) {
  await send.call(this, message);
  // Production same-revision start deliberately NEVER republishes accepted.json.
  // This test-only storage fault rewrites the EXACT prior bytes through the real
  // durable primitive in the actual successor, while its real validation is pending.
  // It is not an upgrade path or an invented accepted revision/readiness receipt.
  if (
    process.env.G7_ADMIN_PRIOR === '1' &&
    process.argv.length === 7 &&
    message.phase === 'activation'
  ) {
    const root = process.argv[2],
      bytes = fs.readFileSync(root + '/accepted.json');
    const fd = openPrivateRoot(root);
    try {
      durableWrite(fd, 'accepted.json', bytes, { replace: true });
    } finally {
      fs.closeSync(fd);
    }
  }
};
