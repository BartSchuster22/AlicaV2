// Encryption transport only. Cell lexical custody, never this helper, authorizes capture.
// No private-key input, plugin recipient, shell, plaintext file or restore publication.
import { spawn } from 'node:child_process';
import {
  constants as C,
  openSync,
  closeSync,
  fstatSync,
  readFileSync,
  writeSync,
  fsyncSync,
  linkSync,
  unlinkSync,
  statfsSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { check, rawDigest } from '@alica/acap-contracts';
import { openPrivateRoot, listPrivate } from './g7-durable.mjs';
import { LIMITS, tarHeader, safePath } from './g7-archive.mjs';
const AGE =
  'sha256:eb7dd1b518f0a307c99cd97782623c5321da049154b04acd2d98d21aa7bc9b2c';
// Standard Bech32 X25519 public encoding, not a cryptographic protocol.
export function recoveryRecipientId(recipient) {
  check(
    typeof recipient === 'string' &&
      /^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/.test(recipient),
    'INVALID_ARGUMENT',
  );
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const values = [...recipient.slice(4)].map((c) => alphabet.indexOf(c));
  let polymod = 1;
  for (const value of [3, 3, 3, 0, 1, 7, 5, ...values]) {
    const top = polymod >>> 25;
    polymod = ((polymod & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++)
      if ((top >>> i) & 1)
        polymod ^= [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3][
          i
        ];
  }
  check(polymod === 1, 'INVALID_ARGUMENT');
  let accumulator = 0,
    bits = 0;
  const raw = [];
  for (const value of values.slice(0, -6)) {
    accumulator = ((accumulator << 5) | value) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      raw.push((accumulator >>> bits) & 255);
    }
  }
  check(
    raw.length === 32 && bits === 4 && (accumulator & 15) === 0,
    'INVALID_ARGUMENT',
  );
  return rawDigest(Buffer.from(raw));
}
export async function encryptBackup(
  entries,
  { age, recipient, destination },
  certify,
) {
  recoveryRecipientId(recipient);
  const directory = openPrivateRoot(destination);
  let binary, output, child, timer;
  try {
    check(listPrivate(directory).length === 0, 'CONFLICT');
    // Read authenticated executable through an inherited descriptor: no path re-open race.
    binary = openSync(age, C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK);
    const stat = fstatSync(binary);
    check(
      stat.isFile() &&
        stat.size <= LIMITS.fileBytes &&
        (stat.mode & 0o022) === 0,
      'PERMISSION_DENIED',
    );
    check(rawDigest(readFileSync(binary)) === AGE, 'PERMISSION_DENIED');
    check(
      Array.isArray(entries) && entries.length <= LIMITS.entries,
      'RESOURCE_EXHAUSTED',
    );
    const names = new Set();
    let total = 1024;
    for (const [path, bytes] of entries) {
      check(Buffer.isBuffer(bytes), 'INVALID_ARGUMENT');
      safePath(path);
      tarHeader(path, bytes.length);
      for (const prior of names) {
        const a = path.split('/'),
          b = prior.split('/');
        check(
          !path.toLowerCase().startsWith(prior.toLowerCase() + '/') &&
            !prior.toLowerCase().startsWith(path.toLowerCase() + '/') &&
            path.toLowerCase() !== prior.toLowerCase(),
          'CONFLICT',
        );
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          if (a[i].toLowerCase() !== b[i].toLowerCase()) break;
          check(a[i] === b[i], 'CONFLICT');
        }
      }
      names.add(path);
      total += 512 + Math.ceil(bytes.length / 512) * 512;
    }
    check(total <= LIMITS.tarBytes, 'RESOURCE_EXHAUSTED');
    const space = statfsSync('/proc/self/fd/' + directory);
    check(
      space.bavail * space.bsize >= total + 4194304 + 536870912,
      'RESOURCE_EXHAUSTED',
    );
    certify();
    const base = '/proc/self/fd/' + directory + '/';
    output = openSync(
      base + 'cipher.partial',
      C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW,
      0o600,
    );
    child = spawn('/proc/self/fd/3', ['--encrypt', '--recipient', recipient], {
      stdio: ['pipe', 'pipe', 'ignore', binary],
      env: { LANG: 'C' },
    });
    let failure,
      count = 0;
    const hash = createHash('sha256');
    const fail = (e) => {
      failure ??= e;
      child.kill('SIGKILL');
    };
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.stdout.on('error', fail);
    child.stdout.on('data', (chunk) => {
      try {
        count += chunk.length;
        check(count <= 2151677952, 'RESOURCE_EXHAUSTED');
        let offset = 0;
        while (offset < chunk.length) {
          const n = writeSync(output, chunk, offset, chunk.length - offset);
          check(n > 0);
          offset += n;
        }
        hash.update(chunk);
      } catch (e) {
        fail(e);
      }
    });
    const ended = new Promise((resolve) =>
      child.on('close', (code, signal) => resolve({ code, signal })),
    );
    timer = setTimeout(
      () =>
        fail(
          Object.assign(new Error('Backup encryption timeout'), {
            code: 'TIMEOUT',
          }),
        ),
      LIMITS.timeoutMs,
    );
    const feed = async () => {
      for (const [path, bytes] of entries) {
        for (const chunk of [
          tarHeader(path, bytes.length),
          bytes,
          Buffer.alloc((512 - (bytes.length % 512)) % 512),
        ]) {
          if (failure) throw failure;
          await new Promise((resolve, reject) =>
            child.stdin.write(chunk, (error) =>
              error ? reject(error) : resolve(),
            ),
          );
        }
      }
      child.stdin.end(Buffer.alloc(1024));
    };
    // Observe feeder failure immediately and always wait for THIS encryption child.
    const feeding = feed().catch(fail);
    const exit = await ended;
    await feeding;
    if (failure) throw failure;
    check(exit.code === 0 && exit.signal === null, 'FAILED_PRECONDITION');
    check(count > 0, 'FAILED_PRECONDITION');
    fsyncSync(output);
    // Current authority + unchanged source + continuously held exact-reap custody.
    certify();
    linkSync(base + 'cipher.partial', base + 'backup.age');
    unlinkSync(base + 'cipher.partial');
    fsyncSync(directory);
    return {
      backupCipherDigest: 'sha256:' + hash.digest('hex'),
      cipherBytes: count,
      plainBytes: total,
    };
  } finally {
    clearTimeout(timer);
    if (output !== undefined) closeSync(output);
    if (binary !== undefined) closeSync(binary);
    closeSync(directory);
  }
}
