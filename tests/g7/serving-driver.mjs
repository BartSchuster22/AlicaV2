// Test harness drives only real public orchestration; no supplied clean authority.
import { createInterface } from 'node:readline';
import { CellPreparation } from '../../tools/g7-cell.mjs';
import { createRequire } from 'node:module';
import { readdirSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rawDigest } from '@alica/acap-contracts';
const native = createRequire(import.meta.url)(
  '../../native/g7/build/ownership.node',
);
native.guardLauncher();
const [root, input, target] = process.argv.slice(2);
const cell = new CellPreparation(root);
const commands = createInterface({ input: process.stdin });
const timer = setInterval(() => {}, 1000);
let current = input;
const counts = {};
function observed(event, result) {
  // Exact inventory equality is measured only after actual normal clean reaps.
  // A serving Kernel legitimately publishes its own opaque state concurrently.
  if (event === 'serve') {
    console.log(JSON.stringify({ event, result }));
    return;
  }
  const count = (counts[event] = (counts[event] ?? 0) + 1);
  const files = Object.fromEntries(
    readdirSync(root, { recursive: true })
      .sort()
      .flatMap((p) => {
        const s = lstatSync(join(root, p));
        return s.isFile()
          ? [
              [
                p,
                { ino: s.ino, digest: rawDigest(readFileSync(join(root, p))) },
              ],
            ]
          : [];
      }),
  );
  writeFileSync(
    join(process.env.G7_SERVING_DIR, event + '-' + count + '.json'),
    JSON.stringify(files),
  );
  console.log(JSON.stringify({ event, result }));
}
try {
  observed('begin', await cell.ownedBegin(input));
  cell.ownedWait().catch((error) =>
    console.error(
      JSON.stringify({
        status: 'NEEDS_OPERATOR',
        code: error.code,
        reason: 'custody-loss',
      }),
    ),
  );
  for await (const command of commands) {
    let result;
    if (command === 'serve') result = await cell.ownedServe(current);
    else if (command === 'maintain') result = await cell.ownedMaintain(current);
    else if (command === 'upgrade') {
      result = await cell.ownedMaintain(current, target);
      current = target;
    } else if (command === 'concurrent') {
      const first = cell.ownedMaintain(current);
      try {
        await cell.ownedMaintain(current);
        throw new Error('concurrent admission');
      } catch (e) {
        if (e.code !== 'CONFLICT') throw e;
      }
      result = await first;
    } else if (command === 'finish') {
      result = await cell.ownedFinish();
      cell.close();
      console.log(JSON.stringify({ event: command, result }));
      clearInterval(timer);
      commands.close();
      process.exit(0);
    } else throw new Error('unknown test command');
    observed(command, result);
  }
  throw new Error('harness ended without finish');
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'NEEDS_OPERATOR',
      code: error.code,
      stack: error.stack,
    }),
  );
}
