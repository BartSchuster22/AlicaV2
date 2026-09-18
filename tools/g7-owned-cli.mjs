// Foreground owner from inception. Does not adopt arbitrary stopped residue.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { CellPreparation } from './g7-cell.mjs';
const native = createRequire(import.meta.url)(
  '../native/g7/build/ownership.node',
);
let cell;
try {
  const [operation, root, inputs, ...extra] = process.argv.slice(2);
  if (
    !['exact-reinstall', 'upgrade'].includes(operation) ||
    !root ||
    !inputs ||
    extra.length !== (operation === 'upgrade' ? 1 : 0)
  )
    throw new Error('INVALID');
  // Held for the process lifetime; never treat parent loss as clean cleanup.
  native.guardLauncher();
  cell = new CellPreparation(resolve(root));
  const result =
    operation === 'upgrade'
      ? await cell.ownedUpgrade(resolve(inputs), resolve(extra[0]))
      : await cell.ownedReinstall(resolve(inputs));
  console.log(
    JSON.stringify({
      operation,
      status: result.runtime,
      accepted: result.accepted,
      fence: 'RETAINED',
    }),
  );
  cell.close();
} catch {
  console.error(
    JSON.stringify({ status: 'NEEDS_OPERATOR', fence: 'RETAINED' }),
  );
  if (!cell) process.exitCode = 1;
  else {
    // Uncertainty neither releases custody nor permits replay/restart.
    setInterval(() => {}, 1000);
  }
}
