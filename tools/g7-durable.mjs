// Linux descriptor-relative durable primitives, not a Cell transaction engine.
// The caller must hold the Cell lifetime writer lock before mutation.
import {
  constants as C,
  openSync,
  closeSync,
  fstatSync,
  mkdirSync,
  linkSync,
  unlinkSync,
  renameSync,
  writeSync,
  fsyncSync,
  readSync,
  statfsSync,
  readdirSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { check, rawDigest } from '@alica/acap-contracts';
import { safePath } from './g7-archive.mjs';
const dirFlags = C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW;
function owned(fd, directory) {
  const s = fstatSync(fd);
  check(
    s.uid === process.getuid() &&
      (directory
        ? s.isDirectory() && (s.mode & 0o7777) === 0o700
        : s.isFile() && (s.mode & 0o7777) === 0o600 && s.nlink === 1),
    'PERMISSION_DENIED',
  );
  return s;
}
export function openPrivateRoot(absolute) {
  check(
    process.platform === 'linux' &&
      absolute.startsWith('/') &&
      !absolute.endsWith('/'),
  );
  const parts = absolute.slice(1).split('/');
  check(parts.every((p) => p && p !== '.' && p !== '..'));
  let fd = openSync('/', dirFlags);
  try {
    for (const p of parts) {
      const next = openSync('/proc/self/fd/' + fd + '/' + p, dirFlags);
      closeSync(fd);
      fd = next;
    }
    owned(fd, true);
    return fd;
  } catch (e) {
    closeSync(fd);
    throw e;
  }
}
function parent(root, path, create, boundary) {
  const parts = safePath(path).split('/'),
    leaf = parts.pop();
  let fd = openSync('/proc/self/fd/' + root + '/.', dirFlags);
  try {
    owned(fd, true);
    for (const component of parts) {
      const p = '/proc/self/fd/' + fd + '/' + component;
      if (create) {
        try {
          mkdirSync(p, 0o700);
          boundary('mkdir');
          fsyncSync(fd);
          boundary('mkdir-parent-fsync');
        } catch (e) {
          if (e.code !== 'EEXIST') throw e;
        }
      }
      const next = openSync(p, dirFlags);
      try {
        owned(next, true);
      } catch (e) {
        closeSync(next);
        throw e;
      }
      closeSync(fd);
      fd = next;
    }
    return { fd, path: '/proc/self/fd/' + fd + '/' + leaf };
  } catch (e) {
    closeSync(fd);
    throw e;
  }
}
export function listPrivate(root, relative) {
  owned(root, true);
  if (relative === undefined) return readdirSync('/proc/self/fd/' + root);
  const p = parent(root, relative + '/sentinel', false, () => {});
  try {
    return readdirSync('/proc/self/fd/' + p.fd);
  } finally {
    closeSync(p.fd);
  }
}
export function readPrivate(root, relative, maximum = 1048576) {
  const p = parent(root, relative, false, () => {});
  let fd;
  try {
    fd = openSync(p.path, C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK);
    const before = owned(fd, false);
    check(before.size <= maximum, 'RESOURCE_EXHAUSTED');
    const b = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < b.length) {
      const n = readSync(fd, b, offset, b.length - offset, offset);
      check(n > 0);
      offset += n;
    }
    const after = fstatSync(fd);
    check(
      before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        before.ctimeMs === after.ctimeMs,
      'CONFLICT',
    );
    return b;
  } finally {
    if (fd !== undefined) closeSync(fd);
    closeSync(p.fd);
  }
}
// Each boundary is after the named real syscall, usable by external SIGKILL tests.
// Never catches durability uncertainty as success. Temporary residue is deliberately retained.
export function durableWrite(
  root,
  relative,
  bytes,
  { replace = false, maximum = 16384, boundary = () => {} } = {},
) {
  check(
    Buffer.isBuffer(bytes) && bytes.length <= maximum,
    'RESOURCE_EXHAUSTED',
  );
  owned(root, true);
  const space = statfsSync('/proc/self/fd/' + root);
  check(
    space.bavail * space.bsize >= bytes.length + 536870912,
    'RESOURCE_EXHAUSTED',
  );
  const p = parent(root, relative, true, boundary),
    temporary = '/proc/self/fd/' + p.fd + '/next-' + randomUUID();
  let fd;
  try {
    fd = openSync(
      temporary,
      C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW,
      0o600,
    );
    boundary('open');
    let offset = 0;
    while (offset < bytes.length) {
      const n = writeSync(fd, bytes, offset, bytes.length - offset);
      check(n > 0);
      offset += n;
      boundary('write');
    }
    fsyncSync(fd);
    boundary('file-fsync');
    closeSync(fd);
    fd = undefined;
    if (replace) {
      // Reject unsafe existing selections before atomic replacement; no contents are followed.
      try {
        const old = openSync(p.path, C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK);
        try {
          owned(old, false);
        } finally {
          closeSync(old);
        }
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      renameSync(temporary, p.path);
      boundary('rename');
    } else {
      linkSync(temporary, p.path);
      boundary('link');
      unlinkSync(temporary);
      boundary('unlink');
    }
    fsyncSync(p.fd);
    boundary('directory-fsync');
    return rawDigest(bytes);
  } finally {
    if (fd !== undefined) closeSync(fd);
    closeSync(p.fd);
  }
}
