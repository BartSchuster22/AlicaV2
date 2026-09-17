// CLI is deliberately a preparation tool, not an installer/supervisor.
import { resolve, dirname, basename } from 'node:path';
import { closeSync } from 'node:fs';
import { parse } from '@alica/acap-contracts';
import { openPrivateRoot, readPrivate } from './g7-durable.mjs';
import { CellPreparation } from './g7-cell.mjs';
function local(path) {
  const absolute = resolve(path),
    fd = openPrivateRoot(dirname(absolute));
  try {
    return parse(readPrivate(fd, basename(absolute)));
  } finally {
    closeSync(fd);
  }
}
let cell;
try {
  const [operation, root, ...args] = process.argv.slice(2);
  const counts = { initialize: 2, status: 0, stage: 3, recover: 1 };
  if (!(operation in counts) || args.length !== counts[operation] || !root)
    throw new Error('UNAVAILABLE');
  cell = new CellPreparation(resolve(root));
  let result;
  if (operation === 'initialize')
    result = await cell.initialize(local(args[0]), local(args[1]));
  if (operation === 'status') result = cell.status();
  if (operation === 'stage')
    result = await cell.stage(resolve(args[0]), local(args[1]), local(args[2]));
  if (operation === 'recover') result = await cell.recover(local(args[0]));
  console.log(JSON.stringify(result));
} catch (e) {
  console.error(
    JSON.stringify({
      status: 'NEEDS_OPERATOR',
      code:
        e.code === 'CONFLICT'
          ? 'CONFLICT'
          : e.message === 'UNAVAILABLE'
            ? 'UNAVAILABLE'
            : 'DENIED',
    }),
  );
  process.exitCode = 1;
} finally {
  cell?.close();
}
