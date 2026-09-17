// Read-only inspection, deliberately not install/start/acceptance.
import {
  constants as C,
  openSync,
  fstatSync,
  readSync,
  closeSync,
} from 'node:fs';
import { check, parse, normalized } from '@alica/acap-contracts';
import { inspectRelease } from './g7-release.mjs';
function document(path) {
  const fd = openSync(path, C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    check(stat.isFile() && stat.size <= 1048576, 'RESOURCE_EXHAUSTED');
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const n = readSync(fd, bytes, offset, bytes.length - offset, offset);
      check(n > 0);
      offset += n;
    }
    const after = fstatSync(fd);
    check(
      stat.size === after.size &&
        stat.mtimeMs === after.mtimeMs &&
        stat.ctimeMs === after.ctimeMs,
      'CONFLICT',
    );
    return parse(bytes);
  } finally {
    closeSync(fd);
  }
}
try {
  check(process.argv.length === 5);
  const result = inspectRelease(
    process.argv[2],
    document(process.argv[3]),
    document(process.argv[4]),
  );
  process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      code: normalized(error).code,
      qualification: 'NOT_QUALIFIED',
    }) + '\n',
  );
  process.exitCode = 1;
}
