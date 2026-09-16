import type { Descriptor, Handler, Value } from '@alica/acap-types';
import { canonical, check, detach, digest, descriptor } from './validation.js';
import {
  ContractProvider,
  ContractSession,
  negotiate,
  errorRecord,
} from './runtime.js';
export interface ConformanceCase {
  name: string;
  operation: string;
  input: Value;
  expected?: Value;
  items?: Value[];
  errorCode?: string;
  idempotencyKey?: string;
}
export async function runConformance(
  contract: Descriptor,
  handlers: Record<string, Handler>,
  fixtures: ConformanceCase[],
) {
  const d = descriptor(canonical(contract));
  const cases = detach(fixtures);
  check(Array.isArray(cases) && cases.length > 0 && cases.length <= 256);
  for (const c of cases) {
    check(
      c &&
        typeof c.name === 'string' &&
        c.name.length <= 128 &&
        typeof c.operation === 'string' &&
        Object.hasOwn(c, 'input'),
    );
    check(
      Object.keys(c).every((k) =>
        [
          'name',
          'operation',
          'input',
          'expected',
          'items',
          'errorCode',
          'idempotencyKey',
        ].includes(k),
      ),
    );
    check(
      [
        Object.hasOwn(c, 'expected'),
        Object.hasOwn(c, 'items'),
        Object.hasOwn(c, 'errorCode'),
      ].filter(Boolean).length === 1,
    );
  }
  check(
    d.operations.every((o) =>
      cases.some((c) => c.operation === o.name && !c.errorCode),
    ),
    'FAILED_PRECONDITION',
  );
  const provider = new ContractProvider(d, handlers);
  const session = new ContractSession(provider, {
    caller: {
      principal: 'org.alica.conformance',
      instanceId: 'conformance',
      scope: 'root',
    },
    scopeGeneration: 1,
    authorize: () => {},
    maxCallMs: 1000,
  });
  const checks: { name: string; passed: boolean; code?: string }[] = [];
  const run = async (name: string, body: () => Promise<void>) => {
    try {
      await body();
      checks.push({ name, passed: true });
    } catch (e) {
      checks.push({ name, passed: false, code: errorRecord(e).code });
    }
  };
  try {
    for (const c of cases)
      await run('fixture:' + c.name, async () => {
        const operation = d.operations.find((x) => x.name === c.operation);
        check(operation);
        const options = {
          deadlineMs: Date.now() + 1000,
          ...(c.idempotencyKey === undefined
            ? {}
            : { idempotencyKey: c.idempotencyKey }),
        };
        let result: Value | undefined;
        let actualError: string | undefined;
        try {
          if (operation.kind === 'stream') {
            const items: Value[] = [];
            for await (const item of session.openStream(
              c.operation,
              c.input,
              options,
            )) {
              check(items.length < 256, 'RESOURCE_EXHAUSTED');
              items.push(item);
            }
            result = items;
          } else result = await session.call(c.operation, c.input, options);
        } catch (e) {
          actualError = errorRecord(e).code;
        }
        if (c.errorCode)
          check(actualError === c.errorCode, 'CONTRACT_MISMATCH');
        else {
          check(actualError === undefined, 'CONTRACT_MISMATCH');
          const expected = operation.kind === 'stream' ? c.items : c.expected;
          check(
            expected !== undefined && canonical(result) === canonical(expected),
            'CONTRACT_MISMATCH',
          );
        }
      });
    let unknownOperation = 'missing0';
    for (let n = 1; d.operations.some((x) => x.name === unknownOperation); n++)
      unknownOperation = 'missing' + n;
    const base = {
      capabilityId: d.id,
      descriptorDigest: digest(d),
      operation: d.operations[0]!.name,
      payload: cases.find((c) => c.operation === d.operations[0]!.name)!.input,
      deadlineMs: Date.now() + 1000,
    };
    for (const [name, change, code] of [
      [
        'wrong-digest',
        { descriptorDigest: 'sha256:' + '0'.repeat(64) },
        'CONTRACT_MISMATCH',
      ],
      ['unknown-operation', { operation: unknownOperation }, 'NOT_FOUND'],
      ['expired-request', { deadlineMs: Date.now() - 1 }, 'DEADLINE_EXCEEDED'],
      ['caller-spoof', { caller: 'forbidden' }, 'INVALID_ARGUMENT'],
    ] as const)
      await run(name, async () => {
        const request = {
          ...base,
          ...change,
          requestId: name.replaceAll('-', '_'),
        };
        let actual: string | undefined;
        if (d.operations[0]!.kind === 'stream') {
          const iterator = session.stream(request);
          try {
            await iterator.next();
          } catch (e) {
            actual = errorRecord(e).code;
          } finally {
            await iterator.return?.();
          }
        } else {
          const r = await session.invoke(request);
          if (r.result.kind === 'error') actual = r.result.error.code;
        }
        check(actual === code, 'CONTRACT_MISMATCH');
      });
    await run('incompatible-negotiation', async () => {
      let denied = false;
      try {
        negotiate(d, {
          capabilityId: d.id,
          major: Number(d.version.split('.')[0]) + 1,
          minMinor: 0,
          operations: [],
          features: [],
        });
      } catch (e) {
        denied = errorRecord(e).code === 'INCOMPATIBLE_VERSION';
      }
      check(denied, 'CONTRACT_MISMATCH');
    });
    return freezeReport({
      schemaVersion: 'alica.conformance/v1',
      descriptorDigest: digest(d),
      passed: checks.every((c) => c.passed),
      checks,
    });
  } finally {
    session.close();
    provider.close();
  }
}
function freezeReport<T>(value: T): T {
  return detach(value);
}
