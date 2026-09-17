// R1 bounded USTAR transport. Never executes archive-supplied code.
import {
  constants as C,
  openSync,
  closeSync,
  fstatSync,
  readSync,
  writeSync,
  fsyncSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { check, rawDigest } from '@alica/acap-contracts';
export const LIMITS = Object.freeze({
  tarBytes: 1073741824,
  expandedBytes: 1073741824,
  fileBytes: 268435456,
  entries: 4098,
  pathBytes: 240,
  components: 16,
  timeoutMs: 300000,
});
export function safePath(value) {
  check(
    typeof value === 'string' &&
      /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)*$/.test(
        value,
      ),
  );
  check(
    value.length <= LIMITS.pathBytes &&
      value.split('/').length <= LIMITS.components,
    'RESOURCE_EXHAUSTED',
  );
  return value;
}
function field(b) {
  const end = b.indexOf(0);
  check(b.every((x) => x < 128));
  if (end < 0) return b.toString('ascii');
  check(b.subarray(end).every((x) => x === 0));
  return b.subarray(0, end).toString('ascii');
}
function octal(b) {
  check(/^[0-7]+[\x00 ]*$/.test(b.toString('latin1')));
  const n = Number.parseInt(b.toString('ascii'), 8);
  check(Number.isSafeInteger(n) && n >= 0);
  return n;
}
function readAt(fd, length, position) {
  const result = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const n = readSync(fd, result, done, length - done, position + done);
    check(n > 0, 'CONTRACT_MISMATCH');
    done += n;
  }
  return result;
}
function insertPath(seen, name) {
  const lower = name.toLowerCase(),
    parts = name.split('/');
  for (const prior of seen) {
    const folded = prior.toLowerCase();
    check(
      lower !== folded &&
        !lower.startsWith(folded + '/') &&
        !folded.startsWith(lower + '/'),
      'CONFLICT',
    );
    const other = prior.split('/');
    for (let i = 0; i < Math.min(parts.length, other.length); i++) {
      if (parts[i].toLowerCase() !== other[i].toLowerCase()) break;
      check(parts[i] === other[i], 'CONFLICT');
    }
  }
  seen.add(name);
}
export function openArchive(path) {
  const fd = openSync(path, C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK);
  try {
    const initial = fstatSync(fd);
    check(
      initial.isFile() &&
        initial.size <= LIMITS.tarBytes &&
        initial.size >= 1024,
      'RESOURCE_EXHAUSTED',
    );
    const deadline = performance.now() + LIMITS.timeoutMs;
    const entries = [],
      names = new Set();
    let offset = 0,
      expanded = 0;
    while (offset < initial.size) {
      check(performance.now() < deadline, 'DEADLINE_EXCEEDED');
      const h = readAt(fd, 512, offset);
      if (h.every((x) => x === 0)) {
        check(
          offset + 1024 === initial.size &&
            readAt(fd, 512, offset + 512).every((x) => x === 0),
        );
        offset += 1024;
        break;
      }
      check(entries.length < LIMITS.entries, 'RESOURCE_EXHAUSTED');
      const sum = h.reduce((a, x, i) => a + (i >= 148 && i < 156 ? 32 : x), 0);
      check(octal(h.subarray(148, 156)) === sum);
      check(
        h.subarray(257, 263).equals(Buffer.from('ustar\0')) &&
          h.subarray(263, 265).equals(Buffer.from('00')),
      );
      check(h[156] === 48 || h[156] === 0);
      check(h.subarray(157, 257).every((x) => x === 0));
      check(h.subarray(500).every((x) => x === 0));
      const mode = octal(h.subarray(100, 108));
      check(mode <= 0o777);
      for (const [a, b] of [
        [108, 116],
        [116, 124],
        [136, 148],
      ])
        octal(h.subarray(a, b));
      field(h.subarray(265, 297));
      field(h.subarray(297, 329));
      check(h.subarray(329, 345).every((x) => x === 0 || x === 48));
      const prefix = field(h.subarray(345, 500)),
        leaf = field(h.subarray(0, 100));
      const name = safePath(prefix ? prefix + '/' + leaf : leaf);
      check(!prefix || (name.length > 100 && !leaf.includes('/')));
      insertPath(names, name);
      const bytes = octal(h.subarray(124, 136));
      expanded += bytes;
      check(
        bytes <= LIMITS.fileBytes && expanded <= LIMITS.expandedBytes,
        'RESOURCE_EXHAUSTED',
      );
      const position = offset + 512,
        padding = (512 - (bytes % 512)) % 512;
      check(position + bytes + padding <= initial.size - 1024);
      const hash = createHash('sha256');
      for (let p = 0; p < bytes; p += 65536) {
        check(performance.now() < deadline, 'DEADLINE_EXCEEDED');
        hash.update(readAt(fd, Math.min(65536, bytes - p), position + p));
      }
      check(readAt(fd, padding, position + bytes).every((x) => x === 0));
      entries.push(
        Object.freeze({
          path: name,
          bytes,
          digest: 'sha256:' + hash.digest('hex'),
          position,
        }),
      );
      offset = position + bytes + padding;
    }
    check(offset === initial.size);
    const unchanged = () => {
      const s = fstatSync(fd);
      check(
        s.size === initial.size &&
          s.mtimeMs === initial.mtimeMs &&
          s.ctimeMs === initial.ctimeMs,
        'CONFLICT',
      );
    };
    unchanged();
    let closed = false;
    return Object.freeze({
      entries: Object.freeze(entries),
      read(name, maximum = 1048576) {
        check(!closed);
        const e = entries.find((x) => x.path === name);
        check(e, 'NOT_FOUND');
        check(e.bytes <= maximum, 'RESOURCE_EXHAUSTED');
        unchanged();
        const b = readAt(fd, e.bytes, e.position);
        check(rawDigest(b) === e.digest, 'CONTRACT_MISMATCH');
        unchanged();
        return b;
      },
      close() {
        if (!closed) {
          closed = true;
          closeSync(fd);
        }
      },
    });
  } catch (e) {
    closeSync(fd);
    throw e;
  }
}
function putOctal(h, start, width, number) {
  const s = number.toString(8).padStart(width - 1, '0') + '\0';
  check(s.length === width);
  h.write(s, start, width, 'ascii');
}
export function tarHeader(name, bytes) {
  safePath(name);
  check(Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= LIMITS.fileBytes);
  const h = Buffer.alloc(512);
  if (name.length <= 100) h.write(name, 0, 'ascii');
  else {
    const i = name.lastIndexOf('/'),
      prefix = name.slice(0, i),
      leaf = name.slice(i + 1);
    check(i > 0 && prefix.length <= 155 && leaf.length <= 100);
    h.write(leaf, 0, 'ascii');
    h.write(prefix, 345, 'ascii');
  }
  putOctal(h, 100, 8, 0o600);
  putOctal(h, 108, 8, 0);
  putOctal(h, 116, 8, 0);
  putOctal(h, 124, 12, bytes);
  putOctal(h, 136, 12, 0);
  h.fill(32, 148, 156);
  h[156] = 48;
  h.write('ustar\0', 257, 'ascii');
  h.write('00', 263, 'ascii');
  putOctal(
    h,
    148,
    8,
    h.reduce((a, b) => a + b, 0),
  );
  return h;
}
// Explicit byte inputs only: no recursive walking, hooks, signing or symlink following.
export function writeArchive(destination, entries) {
  check(Array.isArray(entries) && entries.length <= LIMITS.entries);
  const names = new Set();
  let total = 1024,
    expanded = 0;
  for (const [name, bytes] of entries) {
    safePath(name);
    insertPath(names, name);
    check(Buffer.isBuffer(bytes));
    tarHeader(name, bytes.length);
    expanded += bytes.length;
    total += 512 + Math.ceil(bytes.length / 512) * 512;
  }
  check(
    total <= LIMITS.tarBytes && expanded <= LIMITS.expandedBytes,
    'RESOURCE_EXHAUSTED',
  );
  const fd = openSync(
    destination,
    C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW,
    0o600,
  );
  const write = (b) => {
    let p = 0;
    while (p < b.length) {
      const n = writeSync(fd, b, p, b.length - p);
      check(n > 0);
      p += n;
    }
  };
  try {
    for (const [name, b] of entries) {
      write(tarHeader(name, b.length));
      write(b);
      write(Buffer.alloc((512 - (b.length % 512)) % 512));
    }
    write(Buffer.alloc(1024));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
