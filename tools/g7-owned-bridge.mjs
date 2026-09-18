// From-inception orchestration, NOT a supplied clean receipt/descriptor API.
// Cell calls this while holding its originally acquired flock. The only child
// program is the shipped coordinator; no caller-selected executable or protocol.
import { spawn } from 'node:child_process';
import { closeSync, readFileSync } from 'node:fs';
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
      if (packet !== null) return packet;
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
    send('GO');
    check((await receive()).toString() === 'SEALING', 'PERMISSION_DENIED');
    end = performance.now() + limits.cleanupTimeoutMs;
    send('SEAL');
    let stopped = clean(await receive());
    // The child coordinator retains the same flock and watchdog, and its exact
    // custodian AND original owner are normally reaped before this packet exists.
    send('ACK');
    end = performance.now() + limits.verifyTimeoutMs;
    let serving = false;
    return {
      lost,
      get stopped() {
        return stopped;
      },
      assert: alive,
      async serve(inputs, selection) {
        check(!finished && !serving, 'FAILED_PRECONDITION');
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
        check(!finished && !serving, 'FAILED_PRECONDITION');
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
        check(!finished && !serving, 'FAILED_PRECONDITION');
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
