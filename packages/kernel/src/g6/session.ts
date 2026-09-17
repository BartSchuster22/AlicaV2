import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import {
  readFileSync,
  mkdtempSync,
  chmodSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { canonical, check, digest, AcapError } from '@alica/acap-contracts';
import type { ErrorCode } from '@alica/acap-types';
import type { VerifiedPackage } from '../trust.js';
import { native } from './native.js';
import type { Lease } from './native.js';
import { NativeStream, FrameRate } from './stream.js';
import { WireBudget, encodeOffer } from './wire.js';
import type { Frame } from './wire.js';
import { Scheduler } from './scheduler.js';
import { observeReap } from './reap.js';
import type { Admission, WorkContext } from './scheduler.js';
import type { hello, accepted, limits } from './wire-schema.js';

export const LIMITS: limits = Object.freeze({
  maxFrameBytes: 1048576,
  maxQueuedFrames: 64,
  maxQueuedBytes: 8388608,
  maxPendingCalls: 64,
  maxActiveInboundCalls: 8,
  maxStreamCredit: 256,
  maxStreamBufferedBytes: 1048576,
  handshakeMs: 3000,
  partialFrameMs: 2000,
  heartbeatMs: 5000,
  missedHeartbeats: 3,
  cleanupMs: 500,
  termGraceMs: 500,
  reapMs: 500,
  maxReconnects: 4,
  maxOrdinaryActive: 4,
  reservedNestedSlots: 4,
  maxCausalDepth: 8,
  maxWorkContexts: 8,
  reservedLifecycleContexts: 1,
  maxPendingOffers: 9,
  offerTimeoutMs: 1000,
  carrierPacketBytes: 4096,
});
export interface LaunchOptions {
  readonly root: string;
  readonly runtimeDirectory: string;
  readonly node: string;
  /** Operator-owned trusted dispatcher, never the package entrypoint. */
  readonly worker: string;
  readonly readPaths: readonly string[];
  readonly cellId: string;
  readonly instanceId: string;
  readonly scopeId: string;
  readonly scopeGeneration: number;
  readonly generation: number;
  readonly pkg: VerifiedPackage;
  readonly fresh: () => void;
}
export interface ExitReceipt {
  readonly pid: number;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly elapsedMs: number;
}
interface Endpoint {
  context: WorkContext;
  stream: NativeStream;
  ready: boolean;
  resolve: (stream: NativeStream) => void;
  reject: (error: unknown) => void;
}
const hashFile = (path: string) =>
  'sha256:' + createHash('sha256').update(readFileSync(path)).digest('hex');
const token = () => randomBytes(32).toString('hex');
/** Supervisor owns the process, native leases and endpoint-to-context map.
 * This is private transport plumbing, not a host grant or SDK adapter. */
export class PhysicalSession {
  static #live = new Set<PhysicalSession>();
  readonly sessionId = token();
  readonly budget = new WireBudget();
  readonly rate = new FrameRate();
  readonly scheduler: Scheduler;
  readonly identity: Readonly<{
    runtimeDigest: string;
    bridgeDigest: string;
    launcherDigest: string;
    workerDigest: string;
  }>;
  readonly expected: hello['body'];
  readonly exited: Promise<ExitReceipt>;
  #resolveExit!: (receipt: ExitReceipt) => void;
  #rejectReady!: (error: unknown) => void;
  #resolveReady!: () => void;
  readonly ready: Promise<void>;
  #child: ChildProcess | undefined;
  #pidfd: Lease | undefined;
  #listener: Lease | undefined;
  #carrier: Lease | undefined;
  #control: NativeStream | undefined;
  #directory: string | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #killTimers: ReturnType<typeof setTimeout>[] = [];
  #endpoints = new Map<string, Endpoint>();
  #sequence = 1;
  #start = performance.now();
  #lastHeartbeat = this.#start;
  #heartbeat: string | undefined;
  #missed = 0;
  #active = false;
  #failed = false;
  #dead = false;
  #attempted = false;
  #shutdown: Promise<ExitReceipt> | undefined;
  #reapFailure: Error | undefined;
  onFrame: (context: WorkContext, frame: Frame, stream: NativeStream) => void =
    () => {
      throw new AcapError('FAILED_PRECONDITION');
    };
  onTask: (frame: Extract<Frame, { tag: 'request' }>) => void = () => {
    throw new AcapError('FAILED_PRECONDITION');
  };
  constructor(readonly options: LaunchOptions) {
    check(PhysicalSession.#live.size < 4, 'RESOURCE_EXHAUSTED');
    options.fresh();
    this.identity = Object.freeze({
      runtimeDigest: hashFile(options.node),
      bridgeDigest: hashFile(join(options.root, 'native/g6/build/bridge.node')),
      launcherDigest: hashFile(join(options.root, 'native/g6/build/launcher')),
      workerDigest: hashFile(options.worker),
    });
    this.expected = Object.freeze({
      protocolMajor: 1,
      protocolMinor: 0,
      cellId: options.cellId,
      providerId: options.pkg.manifest.id,
      instanceId: options.instanceId,
      packageDigest: options.pkg.digest,
      challenge: token(),
      requiredFeatures: ['wire.contexts'],
      optionalFeatures: [],
      contracts: [...options.pkg.descriptors.values()]
        .map((d) => ({
          capabilityId: d.id,
          descriptorDigest: digest(d),
          version: d.version,
          features: [...d.features].sort(),
        }))
        .sort((a, b) => a.capabilityId.localeCompare(b.capabilityId)),
      events: [...options.pkg.events.values()]
        .map((d) => ({ eventType: d.id, descriptorDigest: digest(d) }))
        .sort((a, b) => a.eventType.localeCompare(b.eventType)),
    });
    this.scheduler = new Scheduler(
      this.sessionId,
      options.generation,
      this.budget,
      () => this.fail(),
    );
    this.ready = new Promise((resolve, reject) => {
      this.#resolveReady = resolve;
      this.#rejectReady = reject;
    });
    void this.ready.catch(() => {});
    this.exited = new Promise((resolve) => {
      this.#resolveExit = resolve;
    });
    PhysicalSession.#live.add(this);
    try {
      this.launch();
    } catch (error) {
      this.fail();
      if (!this.#child?.pid) this.dead(null, null);
      throw error;
    }
  }
  get pid(): number {
    return this.#child?.pid ?? 0;
  }
  get active(): boolean {
    return this.#active && !this.#failed;
  }
  get unreaped(): boolean {
    return this.#failed && !this.#dead;
  }
  get reapFailure(): Error | undefined {
    return this.#reapFailure;
  }
  private launch(): void {
    const o = this.options;
    check(
      resolve(o.runtimeDirectory) === o.runtimeDirectory &&
        resolve(o.node) === o.node &&
        resolve(o.worker) === o.worker,
      'FAILED_PRECONDITION',
    );
    this.#directory = mkdtempSync(join(o.runtimeDirectory, 'g6-'));
    chmodSync(this.#directory, 0o700);
    this.#listener = native.listen(join(this.#directory, 'control'));
    const [carrier, remote] = native.pair(5);
    this.#carrier = carrier;
    let challenge: Lease | undefined;
    let capsule: Lease | undefined;
    try {
      challenge = native.memfd(Buffer.from(this.expected.challenge));
      const readPaths = [...new Set(o.readPaths.map((p) => realpathSync(p)))];
      check(readPaths.length <= 64, 'RESOURCE_EXHAUSTED');
      // All module strings were copied and inventory/signature-verified by Trust.
      // The worker never reopens a mutable plugin entrypoint.
      capsule = native.memfd(
        Buffer.from(
          canonical(
            {
              sessionId: this.sessionId,
              generation: o.generation,
              hello: { ...this.expected, challenge: '' },
              manifest: o.pkg.manifest,
              modules: [...o.pkg.modules],
              descriptors: [...o.pkg.descriptors.values()],
              events: [...o.pkg.events.values()],
              identity: this.identity,
              readPaths,
            },
            16777216,
          ),
        ),
      );
      const child = spawn(
        join(o.root, 'native/g6/build/launcher'),
        [o.node, o.worker, join(this.#directory, 'control'), ...readPaths],
        {
          cwd: o.root,
          env: {},
          stdio: [
            'ignore',
            'ignore',
            'ignore',
            'ignore',
            native.fileno(challenge),
            native.fileno(capsule),
            native.fileno(remote),
          ],
        },
      );
      this.#child = child;
      child.once('error', () => {
        this.fail();
        if (!child.pid) this.dead(null, null);
      });
      child.once('exit', (code, signal) => this.dead(code, signal));
      check(child.pid, 'UNAVAILABLE');
      this.#pidfd = native.pidfdOpen(child.pid);
      this.#timer = setInterval(() => {
        try {
          this.pump();
        } catch {
          this.fail();
        }
      }, 2);
    } finally {
      native.close(remote);
      if (challenge) native.close(challenge);
      if (capsule) native.close(capsule);
    }
  }
  private pump(): void {
    if (this.#failed) return;
    if (!this.#active)
      check(performance.now() - this.#start < 3000, 'DEADLINE_EXCEEDED');
    if (!this.#control) {
      const peer = native.accept(this.#listener!);
      if (peer) {
        let transferred = false;
        try {
          const credentials = native.credentials(peer);
          if (
            credentials.pid !== this.pid ||
            credentials.uid !== process.getuid!() ||
            credentials.gid !== process.getgid!()
          )
            return;
          check(
            this.#pidfd && !native.poll([this.#pidfd], 0)[0],
            'UNAUTHENTICATED',
          );
          check(!this.#attempted, 'UNAUTHENTICATED');
          this.#attempted = true;
          this.#control = new NativeStream(
            peer,
            this.budget,
            'controlToBroker',
            'controlToProvider',
            this.sessionId,
            this.options.generation,
            'control',
            this.rate,
            0,
          );
          transferred = true;
          native.close(this.#listener!);
          this.#listener = undefined;
        } finally {
          if (!transferred) native.close(peer);
        }
      }
    }
    const control = this.#control;
    if (!control) return;
    control.flush();
    let burst = 4;
    while (burst-- > 0) {
      const owned = control.receive();
      if (!owned) break;
      try {
        this.controlFrame(owned.frame);
      } finally {
        owned.release();
      }
    }
    if (!this.#active) return;
    // Round-robin traversal, one frame per work endpoint per turn. There are <=9.
    for (const endpoint of [...this.#endpoints.values()]) {
      if (endpoint.stream.closed) continue;
      endpoint.stream.flush();
      const owned = endpoint.stream.receive();
      if (!owned) continue;
      try {
        check(endpoint.ready, 'UNAUTHENTICATED');
        // Scope/grant expiry invalidates this context and descendants, not
        // unrelated sibling work. Protocol/dispatcher exceptions still escape
        // to the physical failure handler.
        try {
          endpoint.context.assertLive();
        } catch (error) {
          endpoint.context.finish(
            error instanceof AcapError ? error.code : 'UNAVAILABLE',
          );
          continue;
        }
        this.options.fresh();
        this.onFrame(endpoint.context, owned.frame, endpoint.stream);
      } finally {
        owned.release();
      }
    }
    if (performance.now() - this.#lastHeartbeat >= 5000) {
      if (this.#heartbeat) check(++this.#missed < 3, 'UNAVAILABLE');
      this.#heartbeat = token();
      this.#lastHeartbeat = performance.now();
      control.send(this.controlMessage('ping', { nonce: this.#heartbeat }));
    }
  }
  private controlMessage(tag: 'ping' | 'pong', body: { nonce: string }): Frame {
    check(this.#sequence < Number.MAX_SAFE_INTEGER, 'RESOURCE_EXHAUSTED');
    return {
      schemaVersion: 'acap.ipc/v1',
      tag,
      sessionId: this.sessionId,
      generation: this.options.generation,
      contextId: 'control',
      sequence: this.#sequence++,
      body,
    };
  }
  private controlFrame(frame: Frame): void {
    if (!this.#active) {
      check(frame.tag === 'hello', 'UNAUTHENTICATED');
      const a = Buffer.from(canonical(frame.body)),
        b = Buffer.from(canonical(this.expected));
      check(a.length === b.length && timingSafeEqual(a, b), 'UNAUTHENTICATED');
      check(
        this.#pidfd && !native.poll([this.#pidfd], 0)[0],
        'UNAUTHENTICATED',
      );
      this.options.fresh();
      const {
        challenge: _challenge,
        requiredFeatures: _required,
        optionalFeatures: _optional,
        ...identity
      } = this.expected;
      const accepted: accepted = {
        schemaVersion: 'acap.ipc/v1',
        tag: 'accepted',
        sessionId: this.sessionId,
        generation: this.options.generation,
        contextId: 'control',
        sequence: 0,
        body: {
          ...identity,
          negotiatedFeatures: ['wire.contexts'],
          rootScopeId: this.options.scopeId,
          scopeGeneration: this.options.scopeGeneration,
          limits: LIMITS,
        },
      };
      this.#control!.send(accepted);
      this.#active = true;
      this.#resolveReady();
      return;
    }
    if (frame.tag === 'ping') {
      this.#control!.send(this.controlMessage('pong', frame.body));
      return;
    }
    if (frame.tag === 'pong') {
      check(frame.body.nonce === this.#heartbeat, 'UNAUTHENTICATED');
      this.#heartbeat = undefined;
      this.#missed = 0;
      return;
    }
    check(frame.tag === 'request', 'UNAUTHENTICATED');
    if (frame.body.kind === 'task-open') {
      this.options.fresh();
      this.onTask(frame);
      return;
    }
    check(frame.body.kind === 'context-ready', 'UNAUTHENTICATED');
    const context = this.scheduler.acknowledge(
      frame.sessionId,
      frame.generation,
      frame.body.readyContextId,
      frame.body.offerId,
    );
    const endpoint = this.#endpoints.get(frame.body.readyContextId);
    if (!context) {
      if (endpoint) this.remove(endpoint);
      return;
    }
    check(endpoint && endpoint.context === context, 'UNAUTHENTICATED');
    endpoint.ready = true;
    endpoint.resolve(endpoint.stream);
  }
  async open(
    input: Admission,
  ): Promise<{ context: WorkContext; stream: NativeStream }> {
    check(this.active, 'UNAVAILABLE');
    this.options.fresh();
    const context = await this.scheduler.admit(input);
    let remote: Lease | undefined;
    try {
      context.assertLive();
      const offer = this.scheduler.offer(context);
      const [local, peer] = native.pair(1);
      remote = peer;
      const stream = new NativeStream(
        local,
        this.budget,
        'workToBroker',
        'workToProvider',
        this.sessionId,
        this.options.generation,
        context.id,
        this.rate,
      );
      const ready = new Promise<NativeStream>((resolve, reject) => {
        const endpoint: Endpoint = {
          context,
          stream,
          ready: false,
          resolve,
          reject,
        };
        this.#endpoints.set(context.id, endpoint);
        context.controller.signal.addEventListener(
          'abort',
          () => {
            reject(
              new AcapError(
                context.terminal === 'complete'
                  ? 'CANCELLED'
                  : context.terminal!,
              ),
            );
            this.remove(endpoint);
          },
          { once: true },
        );
      });
      void ready.catch(() => {});
      const bytes = encodeOffer(offer);
      check(
        native.sendOffer(this.#carrier!, bytes, remote) === bytes.length,
        'UNAVAILABLE',
      );
      return { context, stream: await ready };
    } catch (error) {
      context.finish('UNAVAILABLE');
      if (!context.terminal || context.terminal === 'UNAVAILABLE') this.fail();
      throw error;
    } finally {
      if (remote) native.close(remote);
    }
  }
  private remove(endpoint: Endpoint): void {
    endpoint.stream.close();
    this.#endpoints.delete(endpoint.context.id);
  }
  fail(): void {
    if (this.#failed) return;
    this.#failed = true;
    this.#active = false;
    this.#rejectReady(new AcapError('UNAVAILABLE'));
    this.scheduler.fail();
    for (const endpoint of this.#endpoints.values()) {
      endpoint.reject(new AcapError('UNAVAILABLE'));
      endpoint.stream.close();
    }
    this.#endpoints.clear();
    this.#control?.close();
    // These broker leases need not survive quarantine. Closing our carrier
    // end is NOT a claim that the child consumed queued SCM_RIGHTS: scheduler
    // reservations and the physical process cap still survive until dead().
    if (this.#listener) {
      native.close(this.#listener);
      this.#listener = undefined;
    }
    if (this.#carrier) {
      native.close(this.#carrier);
      this.#carrier = undefined;
    }
    if (this.#timer) clearInterval(this.#timer);
    // No peer-supplied PID is ever a signal target. Quarantine survives failed reap.
    if (!this.#dead && this.#pidfd) {
      const signal = (sig: 9 | 15) => {
        if (!this.#dead)
          try {
            native.signal(this.#pidfd!, sig);
          } catch {
            /* exit callback remains authoritative */
          }
      };
      signal(15);
      this.#killTimers.push(setTimeout(() => signal(9), 500));
    }
    // Includes pidfdOpen failure after spawn. Never fall back to signaling an
    // unowned/reusable numeric PID. Such a launch stays quarantined until exit.
    if (!this.#dead && this.#child?.pid)
      this.#killTimers.push(
        setTimeout(() => {
          if (!this.#dead) this.reapExpired();
        }, 1000),
      );
  }
  private reapExpired(): Error {
    return (this.#reapFailure ??= new Error(
      'G6 process not reaped within TERM+KILL observation budget',
    ));
  }
  shutdown(
    cooperate: () => Promise<void> = async () => {},
  ): Promise<ExitReceipt> {
    return (this.#shutdown ??= (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          cooperate(),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 500);
          }),
        ]);
      } catch {
        /* continue physical cleanup */
      } finally {
        clearTimeout(timer);
        this.fail();
      }
      return observeReap(this.exited, 1000, () => this.reapExpired());
    })());
  }
  private dead(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.#dead) return;
    this.#dead = true;
    this.fail();
    for (const timer of this.#killTimers) clearTimeout(timer);
    for (const lease of [this.#pidfd, this.#listener, this.#carrier])
      if (lease) native.close(lease);
    this.scheduler.reaped();
    PhysicalSession.#live.delete(this);
    if (this.#directory)
      rmSync(this.#directory, { recursive: true, force: true });
    this.#resolveExit(
      Object.freeze({
        pid: this.pid,
        code,
        signal,
        elapsedMs: performance.now() - this.#start,
      }),
    );
  }
}
