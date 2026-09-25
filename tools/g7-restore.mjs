// R1 96-102: transport into quarantine ONLY, never Cell authority/publication.
// The Cell's lexical continuity checks authorize its guarded entry point.
import { spawn } from 'node:child_process';
import {
  constants as C,
  openSync,
  closeSync,
  fstatSync,
  readSync,
  readFileSync,
  writeSync,
  fsyncSync,
  linkSync,
  unlinkSync,
  statfsSync,
} from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { check, rawDigest } from '@alica/acap-contracts';
import { openPrivateRoot, listPrivate } from './g7-durable.mjs';
import { openArchive, LIMITS } from './g7-archive.mjs';
const AGE =
  'sha256:eb7dd1b518f0a307c99cd97782623c5321da049154b04acd2d98d21aa7bc9b2c';
// Conservatively use existing archive's 1 GiB ceiling (below R1 backup's 2 GiB).
const CIPHER_MAX = LIMITS.tarBytes + 4194304;
function privateFile(path) {
  const p = resolve(path),
    root = openPrivateRoot(dirname(p));
  try {
    const fd = openSync(
      '/proc/self/fd/' + root + '/' + basename(p),
      C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK,
    );
    try {
      const s = fstatSync(fd);
      check(
        s.isFile() &&
          s.uid === process.getuid() &&
          (s.mode & 0o7777) === 0o600 &&
          s.nlink === 1,
        'PERMISSION_DENIED',
      );
      return fd;
    } catch (e) {
      closeSync(fd);
      throw e;
    }
  } finally {
    closeSync(root);
  }
}
function hashFile(fd, size) {
  const h = createHash('sha256'),
    buffer = Buffer.alloc(65536);
  for (let offset = 0; offset < size;) {
    const n = readSync(
      fd,
      buffer,
      0,
      Math.min(buffer.length, size - offset),
      offset,
    );
    check(n > 0, 'CONTRACT_MISMATCH');
    h.update(buffer.subarray(0, n));
    offset += n;
  }
  return 'sha256:' + h.digest('hex');
}
export async function stageBackupTransport(
  options,
  expectedDigest,
  certify,
  inspect,
  monitor = () => {},
) {
  const directory = openPrivateRoot(options.destination);
  let binary, cipher, key, output, timer, archive;
  try {
    check(listPrivate(directory).length === 0, 'CONFLICT');
    binary = openSync(options.age, C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK);
    const executable = fstatSync(binary);
    check(
      executable.isFile() &&
        executable.size <= LIMITS.fileBytes &&
        (executable.mode & 0o022) === 0,
      'PERMISSION_DENIED',
    );
    check(rawDigest(readFileSync(binary)) === AGE, 'PERMISSION_DENIED');
    cipher = privateFile(options.cipher);
    const initial = fstatSync(cipher);
    check(initial.size > 0 && initial.size <= CIPHER_MAX, 'RESOURCE_EXHAUSTED');
    check(
      hashFile(cipher, initial.size) === expectedDigest,
      'PERMISSION_DENIED',
    );
    key = privateFile(options.identity);
    check(fstatSync(key).size <= 4096, 'RESOURCE_EXHAUSTED');
    const keyText = readFileSync(key, 'utf8');
    // One native X25519 identity only. No plugins, SSH, passphrase or shell prompt.
    check(
      /^(?:#[^\r\n]*\n)*AGE-SECRET-KEY-1[0-9A-Z]+\n?$/.test(keyText),
      'INVALID_ARGUMENT',
    );
    const space = statfsSync('/proc/self/fd/' + directory);
    check(
      space.bavail * space.bsize >= LIMITS.tarBytes + 536870912,
      'RESOURCE_EXHAUSTED',
    );
    certify();
    const base = '/proc/self/fd/' + directory + '/';
    output = openSync(
      base + 'plaintext.partial',
      C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW,
      0o600,
    );
    const child = spawn(
      '/proc/self/fd/3',
      ['--decrypt', '--identity', '/proc/self/fd/4'],
      {
        stdio: ['pipe', 'pipe', 'ignore', binary, key],
        env: { LANG: 'C' },
      },
    );
    let failure,
      plainBytes = 0;
    const fail = (e) => {
      failure ??= e;
      child.kill('SIGKILL');
    };
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.stdout.on('error', fail);
    child.stdout.on('data', (chunk) => {
      try {
        // Live lexical authority must still hold while plaintext is emitted,
        // not merely before spawn and after a successful full stream.
        monitor();
        plainBytes += chunk.length;
        check(plainBytes <= LIMITS.tarBytes, 'RESOURCE_EXHAUSTED');
        for (let offset = 0; offset < chunk.length;) {
          const n = writeSync(output, chunk, offset, chunk.length - offset);
          check(n > 0);
          offset += n;
        }
      } catch (e) {
        fail(e);
      }
    });
    const ended = new Promise((done) =>
      child.on('close', (code, signal) => done({ code, signal })),
    );
    timer = setTimeout(
      () =>
        fail(
          Object.assign(new Error('Restore transport timeout'), {
            code: 'TIMEOUT',
          }),
        ),
      LIMITS.timeoutMs,
    );
    const feeding = (async () => {
      const buffer = Buffer.alloc(65536);
      for (let offset = 0; offset < initial.size;) {
        if (failure) throw failure;
        const n = readSync(
          cipher,
          buffer,
          0,
          Math.min(buffer.length, initial.size - offset),
          offset,
        );
        check(n > 0);
        offset += n;
        await new Promise((done, reject) =>
          child.stdin.write(buffer.subarray(0, n), (e) =>
            e ? reject(e) : done(),
          ),
        );
      }
      child.stdin.end();
    })().catch(fail);
    const exit = await ended;
    await feeding;
    if (failure) throw failure;
    check(exit.code === 0 && exit.signal === null, 'FAILED_PRECONDITION');
    const final = fstatSync(cipher);
    check(
      final.size === initial.size &&
        final.mtimeMs === initial.mtimeMs &&
        final.ctimeMs === initial.ctimeMs &&
        hashFile(cipher, initial.size) === expectedDigest,
      'CONFLICT',
    );
    fsyncSync(output);
    // Parsing occurs ONLY after age authenticated the entire stream and exited.
    archive = openArchive(base + 'plaintext.partial');
    const result = inspect(archive);
    certify();
    linkSync(base + 'plaintext.partial', base + 'validated.tar');
    unlinkSync(base + 'plaintext.partial');
    fsyncSync(directory);
    return {
      stage: 'AUTHENTICATED_VALIDATED_QUARANTINE',
      accepted: false,
      plainBytes,
      ...result,
    };
  } finally {
    clearTimeout(timer);
    archive?.close();
    for (const fd of [output, key, cipher, binary, directory])
      if (fd !== undefined) closeSync(fd);
  }
}
