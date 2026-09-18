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
    !['exact-reinstall', 'upgrade', 'serve', 'cycle'].includes(operation) ||
    !root ||
    !inputs ||
    (operation !== 'cycle' &&
      extra.length !== (operation === 'upgrade' ? 1 : 0))
  )
    throw new Error('INVALID');
  // Held for the process lifetime; never treat parent loss as clean cleanup.
  native.guardLauncher();
  cell = new CellPreparation(resolve(root));
  let result;
  if (operation === 'serve' || operation === 'cycle') {
    // Foreground orchestration, not a new live admin operation. Signals request
    // sealing; they are never interpreted as clean-reap authority.
    let requestStop;
    const stop = new Promise((resolve) => {
      requestStop = resolve;
    });
    const keepAlive = setInterval(() => {}, 1000);
    process.once('SIGINT', requestStop);
    process.once('SIGTERM', requestStop);
    let current = resolve(inputs);
    await cell.ownedBegin(current);
    result = await cell.ownedServe(current);
    console.log(
      JSON.stringify({
        operation,
        event: 'SERVING',
        accepted: result.accepted,
      }),
    );
    if (operation === 'serve') await Promise.race([stop, cell.ownedWait()]);
    else
      for (const target of extra) {
        await cell.ownedMaintain(current, resolve(target));
        current = resolve(target);
        result = await cell.ownedServe(current);
        console.log(
          JSON.stringify({
            operation,
            event: 'SERVING',
            accepted: result.accepted,
          }),
        );
      }
    await cell.ownedMaintain(current);
    result = await cell.ownedFinish();
    clearInterval(keepAlive);
    process.removeListener('SIGINT', requestStop);
    process.removeListener('SIGTERM', requestStop);
  } else
    result =
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
