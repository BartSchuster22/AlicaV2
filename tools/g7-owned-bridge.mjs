// From-inception orchestration, NOT a supplied clean receipt/descriptor API.
// Cell calls this while holding its originally acquired flock. The only child
// program is the shipped coordinator; no caller-selected executable or protocol.
import { spawn } from 'node:child_process';
import { closeSync, readFileSync, fstatSync } from 'node:fs';
import { openPrivateRoot, listPrivate } from './g7-durable.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parse, check } from '@alica/acap-contracts';
const native = createRequire(import.meta.url)(
  '../native/g7/build/ownership.node',
);
const limits = JSON.parse(
  readFileSync(new URL('../docs/g7/draft/limits.json', import.meta.url)),
);
function clean(packet) {
  check(packet.subarray(0, 6).toString() === 'CLEAN ', 'PERMISSION_DENIED');
  const stopped = parse(packet.subarray(6));
  check(
    Object.keys(stopped).sort().join(',') ===
      'acceptedDigest,sequence,status' &&
      stopped.status === 'STOPPED' &&
      Number.isSafeInteger(stopped.sequence) &&
      stopped.sequence > 0 &&
      /^sha256:[0-9a-f]{64}$/.test(stopped.acceptedDigest),
    'PERMISSION_DENIED',
  );
  return stopped;
}
export async function ownedStop(root, inputs, held) {
  return startOwned(root, inputs, held);
}
// Selection is internal startup intent, never clean-reap authority. Only the
// newly locked/materialized destination branch below supplies it.
// SOURCE-ONLY WIP: armChildContainment/endChildContainment require a
// separately admitted exact native artifact. Availability is not qualification;
// no fallback, fabricated containment result or runtime admission is provided.
async function startOwned(root, inputs, held, restoredSelection) {
  const [control, childControl] = native.packetPair();
  let child,
    pidfd,
    exit,
    failed,
    end = performance.now() + limits.verifyTimeoutMs;
  let finished = false,
    rejectLost;
  const lost = new Promise((_, reject) => {
    rejectLost = reject;
  });
  // The lexical Cell always observes this promise after admission. Setup failure
  // must not create an unhandled rejection or turn death into clean authority.
  lost.catch(() => {});
  const assert = () => {
    check(!failed && performance.now() < end, 'TIMEOUT');
  };
  const alive = () => {
    assert();
    check(
      pidfd !== undefined && !native.pidfdDead(pidfd),
      'FAILED_PRECONDITION',
    );
  };
  const send = (text) => {
    assert();
    native.packetSend(control, Buffer.from(text));
    assert();
  };
  const receive = async () => {
    while (true) {
      assert();
      const packet = native.packetReceive(control, child.pid);
      assert();
      if (packet !== null) {
        // packetReceive has authenticated the exact coordinator credentials.
        // Negative custody is sticky, never a STOPPED/ACK/reap certificate.
        if (packet.equals(Buffer.from('UNCERTAIN'))) {
          failed = true;
          const error = Object.assign(new Error('Owned custody uncertain'), {
            code: 'FAILED_PRECONDITION',
          });
          rejectLost(error);
          throw error;
        }
        return packet;
      }
      check(!exit, 'FAILED_PRECONDITION');
      await delay(5);
    }
  };
  const dispose = () => {
    closeSync(control);
    if (pidfd !== undefined) closeSync(pidfd);
  };
  try {
    child = spawn(
      'python3',
      [
        fileURLToPath(new URL('./g7-owned-coordinator.py', import.meta.url)),
        'inception-child',
        process.execPath,
        root,
        inputs,
        '3',
        '4',
      ],
      { stdio: ['ignore', 'ignore', 'inherit', held, childControl] },
    );
    child.on('error', () => {
      failed = true;
    });
    child.on('exit', (code, signal) => {
      exit = { code, signal };
      if (!finished) {
        failed = true;
        rejectLost(
          Object.assign(new Error('Owned coordinator lost'), {
            code: 'FAILED_PRECONDITION',
          }),
        );
      }
    });
    closeSync(childControl);
    check(child.pid, 'FAILED_PRECONDITION');
    pidfd = native.childPidfd(child.pid);
    send(restoredSelection ? 'RESTORE ' + JSON.stringify(restoredSelection) : 'GO');
    check((await receive()).toString() === 'SEALING', 'PERMISSION_DENIED');
    end = performance.now() + limits.cleanupTimeoutMs;
    send('SEAL');
    let stopped = clean(await receive());
    // The child coordinator retains the same flock and watchdog, and its exact
    // custodian AND original owner are normally reaped before this packet exists.
    send('ACK');
    end = performance.now() + limits.verifyTimeoutMs;
    let serving = false, protectedScopes = 0;
    return {
      lost,
      get stopped() {
        return stopped;
      },
      assert: alive,
      protect() {
        check(!finished && !serving && protectedScopes === 0, 'FAILED_PRECONDITION');
        alive();
        const guard = native.armChildContainment(pidfd);
        protectedScopes++;
        let released = false;
        return () => {
          check(!released, 'FAILED_PRECONDITION');
          alive();
          native.endChildContainment(guard);
          released = true;
          protectedScopes--;
        };
      },
      // Host-internal restore composition requires a strictly EMPTY root and
      // mandatory Cell preparation; no unstaged initialized-root fallback.
      // Only trusted Cell preparation receives its retained descriptor;
      // the runtime callback receives no fd, selection, or clean-reap permit.
      async destinationScope(destinationRoot, destinationInputs, operation, prepareRestored) {
        check(!finished && !serving && protectedScopes === 0 &&
          typeof operation === 'function' && typeof prepareRestored === 'function',
          'FAILED_PRECONDITION');
        alive();
        const destinationFd = openPrivateRoot(destinationRoot);
        try {
          const a = fstatSync(held), b = fstatSync(destinationFd);
          check(a.dev !== b.dev || a.ino !== b.ino, 'PERMISSION_DENIED');
          native.lockRoot(destinationFd);
          const names = listPrivate(destinationFd);
          check(names.length === 0, 'FAILED_PRECONDITION');
        } catch (error) {
          closeSync(destinationFd);
          throw error;
        }
        let destination, guard, active = false;
        try {
          alive();
          guard = native.armChildContainment(pidfd);
          protectedScopes++;
          const restored = await prepareRestored(destinationFd);
          alive();
          destinationInputs = restored.inputs;
          destination = await startOwned(destinationRoot, destinationInputs, destinationFd,
            restored.selection);
          destination.lost.catch((error) => {
            failed = true;
            rejectLost(error);
          });
          alive();
          await destination.serve(destinationInputs, destination.stopped);
          active = true;
          const scope = Object.freeze({ assert() {
            check(active, 'FAILED_PRECONDITION');
            alive(); destination.assert();
          } });
          const result = await operation(scope);
          scope.assert();
          active = false;
          await destination.seal(); // exact owner AND custodian normal reaps
          alive();
          await destination.finish(); // exact coordinator normal reap
          alive();
          native.endChildContainment(guard);
          protectedScopes--;
          closeSync(destinationFd);
          return result;
        } catch (error) {
          active = false;
          failed = true;
          destination?.abandon();
          rejectLost(error);
          // No finally release. Keep BOTH locks, fences and native containment;
          // the original external watchdog deadline remains in force. Neither a
          // callback exception nor PID absence can authorize source restart.
          throw error;
        }
      },
      async serve(inputs, selection) {
        check(!finished && !serving && protectedScopes === 0, 'FAILED_PRECONDITION');
        alive();
        send('SERVE ' + JSON.stringify({ inputs, selection }));
        check((await receive()).toString() === 'SERVING', 'PERMISSION_DENIED');
        alive();
        stopped = selection;
        serving = true;
        end = Infinity; // Only idle serving, never an in-flight phase reset.
      },
      async seal() {
        check(!finished && serving, 'FAILED_PRECONDITION');
        alive();
        end = performance.now() + limits.cleanupTimeoutMs;
        send('SEAL');
        const next = clean(await receive());
        check(
          next.sequence === stopped.sequence &&
            next.acceptedDigest === stopped.acceptedDigest,
          'CONFLICT',
        );
        alive();
        send('ACK');
        stopped = next;
        serving = false;
        end = performance.now() + limits.verifyTimeoutMs;
      },
      async send(message) {
        check(!finished && !serving && protectedScopes === 0, 'FAILED_PRECONDITION');
        const phase = {
          cleanup: 'CLEANUP',
          resume: 'RESUME',
          activation: 'ACTIVATION',
        }[message.phase];
        check(phase, 'PERMISSION_DENIED');
        send(phase);
        check((await receive()).toString() === 'ACK', 'PERMISSION_DENIED');
      },
      async finish() {
        check(!finished && !serving && protectedScopes === 0, 'FAILED_PRECONDITION');
        alive();
        finished = true;
        try {
          send('DONE');
          while (!exit) {
            assert();
            await delay(5);
          }
          assert();
          // Node's exit event is the actual waitpid outcome for THIS spawned
          // child, while its pidfd remains held. EOF is never clean authority.
          check(exit.code === 0 && exit.signal === null, 'FAILED_PRECONDITION');
        } finally {
          dispose();
        }
      },
      abandon() {
        finished = true;
        // Leave the inherited channel/pidfd and external deadline intact. The
        // failed Cell cannot close or perform another action. Immediate EOF here
        // raced containment against the caller's NEEDS_OPERATOR diagnostic.
        // The independent watcher still contains blocked IO at its ORIGINAL
        // deadline; these descriptors disappear on process death, not as a
        // claimed clean reap or a transferable permit.
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
