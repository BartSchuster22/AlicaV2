import test from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  environment,
  fixture,
  trustMaterial,
  echo,
  requirement,
} from '../../tools/g3-fixtures.mjs';
import { HostIPC } from '../../packages/kernel/dist/g6/host-adapter.js';
import { PhysicalSession } from '../../packages/kernel/dist/g6/session.js';
import { native } from '../../packages/kernel/dist/g6/native.js';
import { cleanupSelection } from '../../packages/kernel/dist/execution-context.js';

const pause = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, ms = 5000) {
  const end = performance.now() + ms;
  while (!(await fn())) {
    assert.ok(performance.now() < end, 'runtime observation deadline');
    await pause();
  }
}
const worker = fileURLToPath(
  new URL('./qualification-worker.mjs', import.meta.url),
);
async function observeChild(session, existing) {
  const endpoint =
    existing ??
    (await session.open({
      scope: session.options.scopeId,
      purpose: 'invoke',
      requestedMs: 4000,
      encodedBytes: 256,
      authorize: () => {},
    }));
  const requestId = randomUUID();
  const previous = session.onFrame;
  let observation;
  session.onFrame = (context, frame, stream) => {
    if (context !== endpoint.context) return previous(context, frame, stream);
    assert.equal(frame.tag, 'response');
    assert.equal(frame.body.kind, 'invoke');
    assert.equal(frame.body.response.requestId, requestId);
    assert.equal(frame.body.response.result.kind, 'success');
    observation = JSON.parse(frame.body.response.result.value);
  };
  try {
    endpoint.stream.send({
      schemaVersion: 'acap.ipc/v1',
      tag: 'request',
      sessionId: session.sessionId,
      generation: session.options.generation,
      contextId: endpoint.context.id,
      sequence: 1,
      body: {
        kind: 'invoke',
        wireId: 1,
        registrationId: 'qualification_observer',
        call: {
          requestId,
          capabilityId: session.expected.contracts[0].capabilityId,
          descriptorDigest: session.expected.contracts[0].descriptorDigest,
          operation: 'echo',
          deadlineMs: Date.now() + 4000,
          payload: 'observe',
        },
        caller: {
          principal: 'org.alica.qualification',
          instanceId: session.options.instanceId,
          scope: session.options.scopeId,
          scopeGeneration: session.options.scopeGeneration,
          grantId: 'qualification_observer_grant',
          grantRevision: 1,
        },
        remainingMs: 4000,
      },
    });
    await until(() => observation !== undefined || !session.active, 4000);
    if (observation === undefined)
      assert.fail(
        'observation transport ended: ' + JSON.stringify(await session.exited),
      );
    assert.equal(
      observation.measurementError,
      undefined,
      JSON.stringify(observation),
    );
    assert.equal(observation.pid, session.pid);
    assert.equal(observation.scannedFDLimit, 64);
    assert.ok(
      Number.isInteger(observation.fds) &&
        observation.fds > 0 &&
        observation.fds <= 64,
    );
    assert.equal(typeof observation.sentinelPresent, 'boolean');
    return observation;
  } finally {
    session.onFrame = previous;
    if (!existing) endpoint.context.finish();
  }
}
function sample(pid, observed = {}) {
  const status = readFileSync(`/proc/${pid}/status`, 'utf8');
  const rss = status.match(/^VmRSS:\s+(\d+)/m);
  assert.ok(rss, 'live child must expose a real RSS observation');
  return {
    pid,
    rssKiB: Number(rss[1]),
    ...observed,
    childFDObservation:
      observed.fds === undefined
        ? 'not measured: production victim has no diagnostic dispatcher; required FD counts are measured on sealed qualification children'
        : 'actual bounded child fstat via native transport',
    brokerFDs: readdirSync('/proc/self/fd').length,
    managed: native.managed(),
  };
}
function socketSample(lease) {
  const probe = spawnSync(
    'python3',
    [
      '-c',
      'import socket,fcntl,array,json; s=socket.socket(fileno=3); out=array.array("i",[0]); inc=array.array("i",[0]); fcntl.ioctl(3,0x5411,out,True); fcntl.ioctl(3,0x541B,inc,True); print(json.dumps(dict(sendBuffer=s.getsockopt(socket.SOL_SOCKET,socket.SO_SNDBUF),receiveBuffer=s.getsockopt(socket.SOL_SOCKET,socket.SO_RCVBUF),queuedWrite=out[0],queuedRead=inc[0])))',
    ],
    { stdio: ['ignore', 'pipe', 'pipe', native.fileno(lease)], timeout: 2000 },
  );
  assert.equal(probe.status, 0, probe.stderr?.toString());
  return JSON.parse(probe.stdout);
}
async function setup(t, code) {
  let adapter;
  const launches = [];
  const activate = HostIPC.prototype.activate;
  HostIPC.prototype.activate = function () {
    adapter = this;
    launches.push({ adapter: this, at: performance.now() });
    return activate.call(this);
  };
  t.after(() => {
    HostIPC.prototype.activate = activate;
  });
  const e = environment(t, {
    activationMs: 5000,
    maxCallMs: 5000,
    cleanupMs: 1000,
  });
  e.host.updateTrust(
    trustMaterial(e.root, e.publisher, e.now(), {
      policy: {
        version: 2,
        publishers: [
          {
            id: 'org.alica.synthetic',
            keyIds: [e.publisher.id],
            executionModes: ['inproc', 'ipc'],
          },
        ],
      },
      revocation: { version: 2 },
    }),
  );
  const provider = e.host.discover(
    fixture(e.publisher, {
      id: 'org.alica.sessionvictim',
      manifest: { execution: 'ipc' },
      code:
        code ??
        `export async function activate(ctx) {ctx.provide(${JSON.stringify(echo)}, {echo: async value => value})}`,
    }),
  );
  const client = e.load({
    id: 'org.alica.sessionclient',
    provides: [],
    optionalRequires: [requirement],
    code: 'export async function activate(){}',
  });
  // Recovery observes five real heartbeat rounds plus 1/2/4/8 backoff.
  // Keep this independent caller grant live throughout that bounded test;
  // otherwise its 30s fixture expiry masks the old-provider-handle fence.
  e.grant(client, echo.id, ['echo'], { expiresAtMs: e.now() + 120000 });
  await e.host.activate(provider);
  await e.host.activate(client);
  const bound = await e.host.context(client).optional(requirement);
  const call = async () =>
    (
      await bound.call(
        'echo',
        { text: 'still-live' },
        { deadlineMs: Date.now() + 4000 },
      )
    ).text;
  assert.equal(await call(), 'still-live');
  assert.ok(adapter.session.active);
  return { ...e, adapter, provider, client, launches, call, bound };
}
const brokerBaselines = new WeakMap();
async function launch(e, mode) {
  const options = e.adapter.session.options;
  const fds = readdirSync('/proc/self/fd').length;
  const session = new PhysicalSession({
    ...options,
    worker,
    readPaths: [...options.readPaths, worker],
    instanceId: mode,
    generation: 7,
  });
  brokerBaselines.set(session, fds);
  return session;
}
async function cleanup(t, session, baseline, e) {
  const pid = session.pid;
  const receipt = await session.shutdown();
  assert.equal(receipt.pid, pid);
  assert.equal(session.unreaped, false);
  assert.equal(
    existsSync(`/proc/${pid}`),
    false,
    'owned PID actually reaped while broker stays alive',
  );
  assert.equal(
    native.managed(),
    baseline,
    'all managed leases released while victim is alive',
  );
  await until(
    () => readdirSync('/proc/self/fd').length <= brokerBaselines.get(session),
  );
  assert.equal(
    await e.call(),
    'still-live',
    'offending session cannot terminate victim',
  );
  t.diagnostic(
    JSON.stringify({
      receipt,
      victim: sample(e.adapter.session.pid),
      brokerAlive: process.pid,
    }),
  );
}
test(
  'real Host package admission rejects invalid signature, forged publisher and descriptor bytes without a launch',
  { timeout: 15000 },
  async (t) => {
    const e = await setup(t);
    const before = e.launches.length;
    const pkg = () =>
      fixture(e.publisher, {
        id: 'org.alica.rejected',
        provides: [echo],
        code: 'export async function activate(){}',
        manifest: { execution: 'ipc' },
      });
    const signature = pkg();
    signature.signature.signature = Buffer.alloc(64).toString('base64');
    assert.throws(() => e.host.discover(signature), {
      code: 'PERMISSION_DENIED',
    });
    const publisher = fixture(e.publisher, {
      id: 'org.alica.rejected',
      provides: [echo],
      code: 'export async function activate(){}',
      manifest: { execution: 'ipc', publisher: 'org.alica.forged' },
    });
    assert.throws(() => e.host.discover(publisher), {
      code: 'PERMISSION_DENIED',
    });
    const descriptor = pkg();
    descriptor.files['contracts/c0.json'] = Buffer.from('{}');
    assert.throws(() => e.host.discover(descriptor), {
      code: 'CONTRACT_MISMATCH',
    });
    assert.equal(e.launches.length, before);
    assert.equal(await e.call(), 'still-live');
  },
);
test(
  'native queued cleanup keeps its selected deadline and never dispatches expired callback',
  { timeout: 15000 },
  async (t) => {
    const source = `export async function activate(ctx) {
    const first=ctx.createScope(), second=ctx.createScope();
    await first.effect(async register=>{register(async()=>{await new Promise(r=>setTimeout(r,200))});return 'owned'});
    await second.effect(async register=>{register(async()=>{});return 'owned'});
    ctx.provide(${JSON.stringify(echo)},{echo:async value=> value.text==='scopes'?{text:first.scope+','+second.scope}:value});
  }`;
    const e = await setup(t, source);
    const scopes = (
      await e.bound.call(
        'echo',
        { text: 'scopes' },
        { deadlineMs: Date.now() + 4000 },
      )
    ).text.split(',');
    const cleanup = HostIPC.prototype.cleanup,
      send = HostIPC.prototype.send;
    const dispatched = [];
    HostIPC.prototype.cleanup = function (effect, callback, scope, inline) {
      if (this === e.adapter && scope.id === scopes[1])
        return cleanupSelection.run({ end: performance.now() + 25 }, () =>
          cleanup.call(this, effect, callback, scope, inline),
        );
      return cleanup.call(this, effect, callback, scope, inline);
    };
    HostIPC.prototype.send = function (endpoint, frame) {
      if (this === e.adapter && frame.body?.kind === 'effect-cleanup')
        dispatched.push({
          scope: endpoint.context.scope,
          at: performance.now(),
          remainingMs: frame.body.remainingMs,
        });
      return send.call(this, endpoint, frame);
    };
    t.after(() => {
      HostIPC.prototype.cleanup = cleanup;
      HostIPC.prototype.send = send;
    });
    await Promise.all(scopes.map((scope) => e.host.destroyScope(scope)));
    assert.equal(
      dispatched.length,
      1,
      'queued expired cleanup must allocate no second callback endpoint',
    );
    const report = await e.host.dispose(e.provider);
    assert.ok(report.failedDisposers.includes('DEADLINE_EXCEEDED'));
    assert.equal(report.state, 'FAILED');
    assert.equal(report.restartRequired, true);
    await e.adapter.session.exited;
    assert.equal(existsSync(`/proc/${e.adapter.session.pid}`), false);
    assert.deepEqual(
      await e.host.dispose(e.provider),
      report,
      'first terminal cleanup receipt is immutable',
    );
    t.diagnostic(
      JSON.stringify({
        dispatched,
        identity: e.adapter.session.identity,
        report,
      }),
    );
  },
);
for (const mode of [
  'forged-name',
  'forged-digest',
  'hello-contract-digest',
  'hello-contract-duplicate',
  'forged-publisher',
  'stale-challenge',
  'stale-generation',
]) {
  test(
    `real authenticated session rejects ${mode} and preserves victim`,
    { timeout: 15000 },
    async (t) => {
      const e = await setup(t);
      const baseline = native.managed();
      const session = await launch(e, mode);
      t.after(() => session.shutdown());
      await assert.rejects(session.ready, { code: 'UNAVAILABLE' });
      await cleanup(t, session, baseline, e);
    },
  );
}
test(
  'real launched PID accepts exact package and excludes parent environment sentinel',
  { timeout: 15000 },
  async (t) => {
    const e = await setup(t);
    const baseline = native.managed();
    const key = 'G6_SYNTHETIC_QUALIFICATION_SENTINEL';
    const previous = process.env[key];
    process.env[key] = 'synthetic-not-a-credential';
    let session;
    try {
      session = await launch(e, 'valid');
    } finally {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
    t.after(() => session.shutdown());
    await session.ready;
    assert.equal(session.active, true);
    assert.notEqual(session.pid, e.adapter.session.pid);
    assert.notEqual(
      session.expected.challenge,
      e.adapter.session.expected.challenge,
    );
    assert.equal(
      session.expected.packageDigest,
      e.adapter.session.options.pkg.digest,
    );
    assert.equal(session.options.generation, 7);
    const observed = await observeChild(session);
    assert.equal(observed.sentinelPresent, false);
    t.diagnostic(
      JSON.stringify({
        identity: session.identity,
        observed: sample(session.pid, observed),
      }),
    );
    await cleanup(t, session, baseline, e);
  },
);
test(
  'real wrong OS peer is closed before exact launched PID is authenticated',
  { timeout: 15000 },
  async (t) => {
    const e = await setup(t);
    const baseline = native.managed();
    const listen = native.listen,
      credentials = native.credentials;
    const observed = [];
    let wrongPID, session;
    native.listen = (path) => {
      const lease = listen(path);
      const probe = spawnSync(
        'python3',
        [
          '-c',
          'import os,socket,sys; s=socket.socket(socket.AF_UNIX); s.connect(sys.argv[1]); print(os.getpid())',
          path,
        ],
        { encoding: 'utf8', timeout: 2000 },
      );
      assert.equal(probe.status, 0, probe.stderr);
      wrongPID = Number(probe.stdout.trim());
      return lease;
    };
    native.credentials = (lease) => {
      const result = credentials(lease);
      observed.push(result);
      return result;
    };
    try {
      session = await launch(e, 'valid');
      t.after(() => session.shutdown());
      await session.ready;
    } finally {
      native.listen = listen;
      native.credentials = credentials;
    }
    assert.ok(observed.some((peer) => peer.pid === wrongPID));
    assert.ok(
      observed.some(
        (peer) =>
          peer.pid === session.pid &&
          peer.uid === process.getuid() &&
          peer.gid === process.getgid(),
      ),
    );
    await cleanup(t, session, baseline, e);
  },
);

for (const mode of [
  'exit',
  'unresponsive',
  'heartbeat-stall',
  'partial-control',
  'malformed-control',
  'replayed-control',
  'partial-work',
  'malformed-work',
  'retargeted-work',
  'offer-starvation',
]) {
  test(
    `real session ${mode}: bounded failure, reap and independent victim`,
    { timeout: 35000 },
    async (t) => {
      const e = await setup(t);
      const baseline = native.managed();
      const session = await launch(e, mode);
      t.after(() => session.shutdown());
      await session.ready;
      const start = performance.now();
      if (mode.endsWith('-work') || mode === 'offer-starvation') {
        const opened = session.open({
          scope: session.options.scopeId,
          purpose: 'invoke',
          requestedMs: 5000,
          encodedBytes: 256,
          authorize: () => {},
        });
        await opened.catch((error) => assert.equal(error.code, 'UNAVAILABLE'));
      }
      await until(() => !session.active, 23000);
      const elapsedMs = performance.now() - start;
      if (mode === 'heartbeat-stall' || mode === 'unresponsive')
        assert.ok(
          elapsedMs >= 14000,
          'real heartbeat clock, not accelerated loop',
        );
      if (mode.startsWith('partial-'))
        assert.ok(elapsedMs >= 1800, 'real partial-frame deadline');
      t.diagnostic(JSON.stringify({ mode, elapsedMs }));
      await cleanup(t, session, baseline, e);
    },
  );
}
test(
  'real non-reading work socket triggers partial-write deadline and releases charged bytes',
  { timeout: 15000 },
  async (t) => {
    const e = await setup(t);
    const baseline = native.managed();
    const session = await launch(e, 'write-stall');
    t.after(() => session.shutdown());
    await session.ready;
    const endpoint = await session.open({
      scope: session.options.scopeId,
      purpose: 'invoke',
      requestedMs: 5000,
      encodedBytes: 256,
      authorize: () => {},
    });
    const started = performance.now();
    endpoint.stream.send({
      schemaVersion: 'acap.ipc/v1',
      tag: 'response',
      sessionId: session.sessionId,
      generation: session.options.generation,
      contextId: endpoint.context.id,
      sequence: 1,
      body: {
        kind: 'control',
        wireId: 1,
        value: { kind: 'secret', value: 'synthetic'.repeat(100000) },
      },
    });
    assert.ok(
      endpoint.stream.pendingWrites > 0,
      'actual kernel backpressure must leave a partial write',
    );
    assert.ok(session.budget.usage.bytes > 800000);
    t.diagnostic(
      JSON.stringify({
        socket: socketSample(endpoint.stream.lease),
        wire: session.budget.usage,
      }),
    );
    await until(() => !session.active);
    assert.ok(performance.now() - started >= 1800);
    assert.equal(endpoint.context.terminal, 'UNAVAILABLE');
    await cleanup(t, session, baseline, e);
    assert.deepEqual(session.budget.usage, { bytes: 0, frames: 0, control: 0 });
  },
);

for (const mode of [
  'wrong-session',
  'wrong-generation',
  'wrong-nonce',
  'replayed-packet',
  'truncated-packet',
  'wrong-socket-type',
  'multiple-rights',
  'no-rights',
  'oversized-packet',
]) {
  test(
    `real carrier ${mode}: reject transferred rights and preserve victim`,
    { timeout: 15000 },
    async (t) => {
      const e = await setup(t);
      const baseline = native.managed();
      const session = await launch(e, 'valid');
      t.after(() => session.shutdown());
      await session.ready;
      const sendOffer = native.sendOffer;
      let injected = false;
      native.sendOffer = (carrier, bytes, descriptor) => {
        if (injected) return sendOffer(carrier, bytes, descriptor);
        injected = true;
        let packet = bytes;
        if (mode.startsWith('wrong-') && mode !== 'wrong-socket-type') {
          const offer = JSON.parse(bytes.subarray(4).toString());
          if (mode === 'wrong-session')
            offer.sessionId = e.adapter.session.sessionId;
          if (mode === 'wrong-generation') offer.generation++;
          if (mode === 'wrong-nonce') offer.offerId = '0'.repeat(64);
          const body = Buffer.from(JSON.stringify(offer));
          packet = Buffer.alloc(body.length + 4);
          packet.writeUInt32BE(body.length);
          body.copy(packet, 4);
        }
        if (mode === 'truncated-packet')
          packet = bytes.subarray(0, bytes.length - 1);
        if (mode === 'wrong-socket-type') {
          const pair = native.pair(5);
          try {
            const probe = spawnSync(
              'python3',
              [
                '-c',
                'import socket,array,sys,base64; s=socket.socket(fileno=3); s.sendmsg([base64.b64decode(sys.argv[1])],[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array("i",[4]))])',
                packet.toString('base64'),
              ],
              {
                stdio: [
                  'ignore',
                  'pipe',
                  'pipe',
                  native.fileno(carrier),
                  native.fileno(pair[1]),
                ],
                timeout: 2000,
              },
            );
            assert.equal(probe.status, 0, probe.stderr?.toString());
          } finally {
            for (const lease of pair) native.close(lease);
          }
        } else if (
          ['multiple-rights', 'no-rights', 'oversized-packet'].includes(mode)
        ) {
          const probe = spawnSync(
            'python3',
            [
              '-c',
              'import socket,array,sys,base64; s=socket.socket(fileno=3); mode=sys.argv[2]; data=base64.b64decode(sys.argv[1]); data=data if mode!="oversized-packet" else data+b"x"*8192; rights=[] if mode=="no-rights" else [(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array("i",[4,4] if mode=="multiple-rights" else [4]))]; s.sendmsg([data],rights)',
              packet.toString('base64'),
              mode,
            ],
            {
              stdio: [
                'ignore',
                'pipe',
                'pipe',
                native.fileno(carrier),
                native.fileno(descriptor),
              ],
              timeout: 2000,
            },
          );
          assert.equal(probe.status, 0, probe.stderr?.toString());
        } else {
          sendOffer(carrier, packet, descriptor);
          if (mode === 'replayed-packet')
            sendOffer(carrier, packet, descriptor);
        }
        // Fault injector reports the original transport write size so receiver,
        // not an unrelated short-send check, must detect the hostile packet.
        return bytes.length;
      };
      try {
        await session
          .open({
            scope: session.options.scopeId,
            purpose: 'invoke',
            requestedMs: 5000,
            encodedBytes: 256,
            authorize: () => {},
          })
          .catch((error) => assert.equal(error.code, 'UNAVAILABLE'));
        assert.equal(injected, true);
        await until(() => !session.active);
      } finally {
        native.sendOffer = sendOffer;
      }
      await cleanup(t, session, baseline, e);
    },
  );
}

test(
  'real unreaped process remains quarantined and charged until actual exit',
  { timeout: 20000 },
  async (t) => {
    const e = await setup(t);
    const baseline = native.managed();
    const session = await launch(e, 'valid');
    t.after(() => session.shutdown().catch(() => {}));
    await session.ready;
    process.kill(session.pid, 'SIGSTOP');
    const signal = native.signal;
    native.signal = () => {};
    try {
      await assert.rejects(session.shutdown(), /reaped/);
      assert.equal(session.unreaped, true);
      assert.ok(session.reapFailure);
      assert.equal(existsSync(`/proc/${session.pid}`), true);
      const others = [];
      try {
        for (let n = 0; n < 2; n++) {
          const other = await launch(e, 'valid');
          others.push(other);
          await other.ready;
        }
        await assert.rejects(launch(e, 'valid'), {
          code: 'RESOURCE_EXHAUSTED',
        });
        assert.equal(await e.call(), 'still-live');
      } finally {
        native.signal = signal;
        await Promise.all(others.map((other) => other.shutdown()));
      }
    } finally {
      native.signal = signal;
      if (existsSync(`/proc/${session.pid}`))
        process.kill(session.pid, 'SIGKILL');
      await session.exited;
    }
    assert.equal(session.unreaped, false);
    assert.equal(native.managed(), baseline);
    assert.equal(existsSync(`/proc/${session.pid}`), false);
    assert.equal(await e.call(), 'still-live');
    t.diagnostic(
      JSON.stringify({
        quarantineReported: !!session.reapFailure,
        actualExit: await session.exited,
      }),
    );
  },
);

test(
  'production reconnect never replays an in-flight committed mutation',
  { timeout: 15000 },
  async (t) => {
    const e = await setup(
      t,
      `export async function activate(ctx){ctx.provide(${JSON.stringify(echo)},{echo:async value=>{
    if(value.text==='mutation'){ctx.log({level:'info',event:'checkpoint'});await new Promise(()=>{})}
    return value;
  }})}`,
    );
    e.host.drainAudit();
    const mutation = e.bound.call(
      'echo',
      { text: 'mutation' },
      { deadlineMs: Date.now() + 4500 },
    );
    const rejected = assert.rejects(mutation, { code: 'UNAVAILABLE' });
    let commits = 0;
    await until(() => {
      commits += e.host
        .drainAudit()
        .filter((x) => x.reason === 'PLUGIN_CHECKPOINT').length;
      return commits === 1;
    });
    const old = e.adapter.session;
    process.kill(old.pid, 'SIGKILL');
    await old.exited;
    await rejected;
    await until(() => e.launches.length === 2, 6000);
    const next = e.launches[1].adapter;
    await until(() =>
      e.host.inspect().registry.some((r) => r.owner === next.host.instanceId),
    );
    await pause(200);
    commits += e.host
      .drainAudit()
      .filter((x) => x.reason === 'PLUGIN_CHECKPOINT').length;
    assert.equal(
      commits,
      1,
      'observed broker-side mutation commit is never replayed',
    );
    await assert.rejects(e.call(), { code: 'UNAVAILABLE' });
    await e.host.dispose(e.provider);
    await next.session.exited;
    assert.equal(existsSync(`/proc/${next.session.pid}`), false);
  },
);
test(
  'production Host recovery uses 1/2/4/8 backoff without hello-pong budget reset or old-handle rebind',
  { timeout: 80000 },
  async (t) => {
    const e = await setup(t);
    const expiredAuthority = e.grant(e.provider, echo.id, ['echo'], {
      expiresAtMs: e.now() + 1000,
    });
    const revokedAuthority = e.grant(e.provider, echo.id, ['echo']);
    e.host.revokeGrant(revokedAuthority.grantId);
    const pongs = new Set();
    const controlFrame = PhysicalSession.prototype.controlFrame;
    PhysicalSession.prototype.controlFrame = function (frame) {
      const result = controlFrame.call(this, frame);
      if (frame.tag === 'pong') pongs.add(this);
      return result;
    };
    t.after(() => {
      PhysicalSession.prototype.controlFrame = controlFrame;
    });
    const delays = [1000, 2000, 4000, 8000];
    const observed = [];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      const prior = e.launches[attempt].adapter.session;
      await prior.ready;
      await until(() => pongs.has(prior), 7000); // Observe a real validated pong, not elapsed time alone.
      assert.equal(prior.active, true);
      const failedAt = performance.now();
      process.kill(prior.pid, 'SIGKILL');
      await prior.exited;
      await until(
        () => e.launches.length > attempt + 1,
        delays[attempt] + 5000,
      );
      const next = e.launches[attempt + 1];
      assert.ok(
        next.at - failedAt >= delays[attempt] - 10,
        'production backoff cannot fire early',
      );
      await next.adapter.session.ready;
      await until(() =>
        e.host
          .inspect()
          .registry.some((r) => r.owner === next.adapter.host.instanceId),
      );
      assert.notEqual(
        next.adapter.host.instanceId,
        e.launches[attempt].adapter.host.instanceId,
      );
      assert.notEqual(next.adapter.session.sessionId, prior.sessionId);
      assert.notEqual(
        next.adapter.session.expected.challenge,
        prior.expected.challenge,
      );
      assert.ok(
        next.adapter.session.options.generation > prior.options.generation,
      );
      assert.equal(existsSync(`/proc/${prior.pid}`), false);
      const grants = e.host.inspect().grants;
      assert.equal(
        grants.find((g) => g.id === expiredAuthority.grantId).valid,
        false,
      );
      assert.equal(
        grants.find((g) => g.id === revokedAuthority.grantId).revoked,
        true,
      );
      assert.equal(
        grants.some((g) => g.instanceId === next.adapter.host.instanceId),
        false,
        'no old grant is migrated',
      );
      assert.equal(
        next.adapter.host.scope.id,
        e.adapter.host.scope.id,
        'replacement cannot widen its scope',
      );
      await assert.rejects(e.call(), { code: 'UNAVAILABLE' });
      const explicitlyBound = await e.host
        .context(e.client)
        .optional(requirement);
      assert.equal(
        (
          await explicitlyBound.call(
            'echo',
            { text: 'fresh' },
            { deadlineMs: Date.now() + 4000 },
          )
        ).text,
        'fresh',
      );
      observed.push({
        attempt: attempt + 1,
        delayMs: next.at - failedAt,
        pid: next.adapter.session.pid,
        generation: next.adapter.session.options.generation,
      });
    }
    const last = e.launches[4].adapter.session;
    await until(() => pongs.has(last), 7000);
    process.kill(last.pid, 'SIGKILL');
    await last.exited;
    await pause(9000);
    assert.equal(
      e.launches.length,
      5,
      'successful accepts and pongs cannot reset per-instance lineage budget',
    );
    assert.equal(
      e.host
        .inspect()
        .instances.find((i) => i.id === e.launches[4].adapter.host.instanceId)
        .state,
      'FAILED',
    );
    t.diagnostic(JSON.stringify({ recovery: observed }));
  },
);

test(
  'production unload cancels queued reconnect before a replacement can launch',
  { timeout: 15000 },
  async (t) => {
    const e = await setup(t);
    process.kill(e.adapter.session.pid, 'SIGKILL');
    await e.adapter.session.exited;
    await e.host.dispose(e.provider);
    await pause(1500);
    assert.equal(e.launches.length, 1);
    assert.equal(existsSync(`/proc/${e.adapter.session.pid}`), false);
  },
);

test(
  'Host never reports DISPOSED while its actual worker remains unreaped',
  { timeout: 15000 },
  async (t) => {
    const e = await setup(t);
    const session = e.adapter.session;
    const signal = native.signal;
    process.kill(session.pid, 'SIGSTOP');
    native.signal = () => {};
    let report;
    try {
      report = await e.host.dispose(e.provider);
      assert.equal(session.unreaped, true);
      assert.equal(existsSync(`/proc/${session.pid}`), true);
      assert.equal(report.restartRequired, true);
      assert.equal(
        report.state,
        'FAILED',
        'SIGKILL issuance or shutdown rejection is not DISPOSED evidence',
      );
    } finally {
      native.signal = signal;
      if (existsSync(`/proc/${session.pid}`))
        process.kill(session.pid, 'SIGKILL');
      await session.exited;
    }
    assert.deepEqual(
      await e.host.dispose(e.provider),
      report,
      'late reap cannot rewrite first terminal cleanup outcome',
    );
  },
);

test(
  'real session sustained queued work: bounded descriptors, RSS and released retired contexts',
  { timeout: 30000 },
  async (t) => {
    const e = await setup(t);
    const baseline = native.managed();
    const session = await launch(e, 'valid');
    t.after(() => session.shutdown());
    await session.ready;
    const before = sample(session.pid, await observeChild(session));
    const samples = [];
    for (let round = 0; round < 12; round++) {
      const active = await Promise.all(
        Array.from({ length: 4 }, () =>
          session.open({
            scope: session.options.scopeId,
            purpose: 'invoke',
            requestedMs: 5000,
            encodedBytes: 256,
            authorize: () => {},
          }),
        ),
      );
      const queued = Array.from({ length: 32 }, () =>
        session
          .open({
            scope: session.options.scopeId,
            purpose: 'invoke',
            requestedMs: 5000,
            encodedBytes: 256,
            authorize: () => {},
          })
          .then((endpoint) => endpoint.context.finish()),
      );
      const observation = sample(
        session.pid,
        await observeChild(session, active[0]),
      );
      const socket = socketSample(active[0].stream.lease);
      samples.push({
        ...observation,
        socket,
        usage: session.scheduler.usage,
        wire: session.budget.usage,
      });
      assert.ok(
        socket.sendBuffer <= 1048576 && socket.receiveBuffer <= 1048576,
        'observed per-endpoint kernel buffer caps',
      );
      assert.ok(
        socket.queuedWrite <= socket.sendBuffer &&
          socket.queuedRead <= socket.receiveBuffer,
      );
      assert.ok(
        session.budget.usage.frames <= 64 &&
          session.budget.usage.bytes <= 8388608,
      );
      assert.ok(observation.fds <= 64);
      assert.ok(
        observation.rssKiB <= before.rssKiB + 65536,
        'measured RSS growth bounded to 64 MiB',
      );
      assert.ok(
        observation.managed <= baseline + 24,
        'managed leases bounded under queue saturation',
      );
      for (const endpoint of active) endpoint.context.finish();
      await Promise.all(queued);
      await pause(20);
    }
    t.diagnostic(
      JSON.stringify({
        before,
        samples,
        after: sample(session.pid, await observeChild(session)),
        identity: session.identity,
      }),
    );
    await cleanup(t, session, baseline, e);
  },
);
