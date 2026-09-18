// Shared public fixture; no Kernel-private imports or test registration.
import {
  environment,
  fixture,
  trustMaterial,
} from '../../tools/g3-fixtures.mjs';
const descriptor = (id) => ({
  schemaVersion: 'acap.capability/v1',
  id,
  version: '1.0.0',
  features: [],
  operations: [
    {
      name: 'run',
      kind: 'unary',
      input: { type: 'string', maxLength: 64 },
      output: { type: 'string', maxLength: 128 },
      idempotency: 'none',
    },
  ],
});
export const a = descriptor('org.alica.matrixa'),
  b = descriptor('org.alica.matrixb');
const requirement = (d) => ({
  capabilityId: d.id,
  major: 1,
  minMinor: 0,
  operations: ['run'],
  features: [],
});
const ra = requirement(a),
  rb = requirement(b);
function source(own, other) {
  return `import {AcapError} from '@alica/acap-contracts';
  export async function activate(ctx) {
    let entered=0, cancelled=0, mutations=0;
    // Reuse a settled binding. Rebinding inside an expiring invocation is an
    // SDK mutation whose unknown outcome correctly fails the IPC session.
    let downstream;
    const bind=async()=>downstream ??= await ctx.optional(${JSON.stringify(other)});
    ctx.provide(${JSON.stringify(own)}, {run:async(command, op)=>{
      if(command==='counts') return entered+':'+cancelled+':'+mutations;
      if(command==='leaf') return 'leaf';
      if(command==='mutate') return String(++mutations);
      if(command==='deny') {const bound=await bind();return bound.call('run','leaf',{deadlineMs:op.deadlineMs,signal:op.signal})}
      if(command.startsWith('nest:')) {
        const n=Number(command.slice(5)); if(n===0)return 'leaf';
        const bound=await bind();
        return bound.call('run','nest:'+(n-1),{deadlineMs:op.deadlineMs,signal:op.signal});
      }
      if(command==='descendant') {
        const bound=await bind();
        return bound.call('run','wait',{deadlineMs:op.deadlineMs,signal:op.signal});
      }
      if(command==='wait') {
        entered++;
        return new Promise((resolve,reject)=>{
          const abort=()=>{cancelled++;reject(new AcapError('CANCELLED'))};
          if(op.signal.aborted)abort();else op.signal.addEventListener('abort',abort,{once:true});
        });
      }
      if(command==='slow') {await new Promise(resolve=>setTimeout(resolve,150));return 'slow'}
      throw new AcapError('NOT_FOUND');
    }})
  }`;
}
export const sourceA = source(a, rb),
  sourceB = source(b, ra);
export async function factory(t, mode) {
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
  const load = (id, provides, optionalRequires, code) =>
    e.host.discover(
      fixture(e.publisher, {
        id,
        provides,
        optionalRequires,
        code,
        manifest: { execution: mode },
      }),
    );
  const A = load('org.alica.matrixprovidera', [a], [rb], sourceA);
  const B = load('org.alica.matrixproviderb', [b], [ra], sourceB);
  const client = e.load({
    id: 'org.alica.matrixconsumer',
    provides: [],
    optionalRequires: [ra, rb],
    code: 'export async function activate(){}',
  });
  e.grant(client, a.id, ['run']);
  e.grant(client, b.id, ['run']);
  await e.host.activate(A);
  await e.host.activate(B);
  await e.host.activate(client);
  const ca = await e.host.context(client).optional(ra),
    cb = await e.host.context(client).optional(rb);
  return { ...e, A, B, ca, cb };
}
