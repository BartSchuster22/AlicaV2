import { createHash, randomUUID } from 'node:crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import type {
  Value,
  ErrorCode,
  PayloadSchema,
  Manifest,
  Descriptor,
  Requirement,
} from '@alica/acap-types';
import { schemas } from './schema-data.js';
export const errorCodes: readonly ErrorCode[] = [
  'INVALID_ARGUMENT',
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'INCOMPATIBLE_VERSION',
  'CONTRACT_MISMATCH',
  'CONFLICT',
  'DEADLINE_EXCEEDED',
  'CANCELLED',
  'UNAVAILABLE',
  'RESOURCE_EXHAUSTED',
  'FAILED_PRECONDITION',
  'INTERNAL',
];
export class AcapError extends Error {
  readonly correlationId: string;
  readonly retryable = false;
  constructor(
    readonly code: ErrorCode,
    correlationId: string = randomUUID(),
  ) {
    super(code);
    this.correlationId = correlationId;
    this.name = 'AcapError';
  }
}
export function fail(code: ErrorCode): never {
  throw new AcapError(code);
}
export function check(
  ok: unknown,
  code: ErrorCode = 'INVALID_ARGUMENT',
): asserts ok {
  if (!ok) fail(code);
}
export function normalized(e: unknown): AcapError {
  const code =
    e && typeof e === 'object'
      ? Object.getOwnPropertyDescriptor(e, 'code')?.value
      : undefined;
  return new AcapError(
    typeof code === 'string' && errorCodes.includes(code as ErrorCode)
      ? (code as ErrorCode)
      : 'INTERNAL',
  );
}
export const MAX_BYTES = 1048576;
/** Bounded recursive descent, rejecting duplicate keys and non-integer tokens before decoding. */
export function parse(text: string | Uint8Array, maxBytes = MAX_BYTES): Value {
  check(typeof text === 'string' || text instanceof Uint8Array);
  check(Buffer.byteLength(text) <= maxBytes, 'RESOURCE_EXHAUSTED');
  let s: string;
  try {
    s =
      typeof text === 'string'
        ? text
        : new TextDecoder('utf-8', { fatal: true }).decode(text);
  } catch {
    fail('INVALID_ARGUMENT');
  }
  let p = 0;
  const ws = () => {
    while (p < s.length && /[\x20\t\r\n]/.test(s[p]!)) p++;
  };
  const str = (): string => {
    const start = p++;
    while (p < s.length) {
      const c = s[p++]!;
      if (c === '"') {
        let v;
        try {
          v = JSON.parse(s.slice(start, p)) as string;
        } catch {
          fail('INVALID_ARGUMENT');
        }
        check(v.isWellFormed());
        return v;
      }
      if (c === '\\') p++;
    }
    return fail('INVALID_ARGUMENT');
  };
  const value = (depth: number): Value => {
    check(depth <= 32, 'RESOURCE_EXHAUSTED');
    ws();
    const c = s[p];
    if (c === '"') return str();
    if (c === '{' || c === '[') {
      p++;
      const object = c === '{';
      const out: Record<string, Value> | Value[] = object
        ? (Object.create(null) as Record<string, Value>)
        : [];
      const keys = new Set<string>();
      ws();
      if (s[p] === (object ? '}' : ']')) {
        p++;
        return out;
      }
      for (;;) {
        ws();
        if (object) {
          check(s[p] === '"');
          const k = str();
          check(/^[\x00-\x7f]*$/.test(k) && !keys.has(k));
          keys.add(k);
          ws();
          check(s[p++] === ':');
          (out as Record<string, Value>)[k] = value(depth + 1);
        } else (out as Value[]).push(value(depth + 1));
        ws();
        const next = s[p++];
        if (next === (object ? '}' : ']')) return out;
        check(next === ',');
      }
    }
    for (const [word, v] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (s.startsWith(word, p)) {
        p += word.length;
        return v;
      }
    }
    const m = /^-?(?:0|[1-9][0-9]*)/.exec(s.slice(p));
    check(m);
    p += m[0].length;
    const n = Number(m[0]);
    check(Number.isSafeInteger(n));
    return Object.is(n, -0) ? 0 : n;
  };
  const out = value(0);
  ws();
  check(p === s.length);
  return out;
}
export function canonical(value: unknown, maxBytes = MAX_BYTES): string {
  let budget = 0;
  const seen = new Set<object>();
  const emit = (s: string) => {
    budget += Buffer.byteLength(s);
    check(budget <= maxBytes, 'RESOURCE_EXHAUSTED');
    return s;
  };
  const walk = (v: unknown, d: number): string => {
    check(d <= 32, 'RESOURCE_EXHAUSTED');
    if (v === null) return emit('null');
    if (typeof v === 'boolean') return emit(String(v));
    if (typeof v === 'number') {
      check(Number.isSafeInteger(v));
      return emit(String(v));
    }
    if (typeof v === 'string') {
      check(v.isWellFormed());
      check(v.length <= maxBytes, 'RESOURCE_EXHAUSTED');
      return emit(JSON.stringify(v));
    }
    check(typeof v === 'object' && v !== null);
    check(!seen.has(v));
    seen.add(v);
    let out: string;
    if (Array.isArray(v)) {
      check(v.length <= maxBytes, 'RESOURCE_EXHAUSTED');
      check(
        Object.keys(v).length === v.length &&
          Reflect.ownKeys(v).length === v.length + 1,
      );
      out = emit('[');
      for (let i = 0; i < v.length; i++) {
        const desc = Object.getOwnPropertyDescriptor(v, String(i));
        check(desc && 'value' in desc && desc.enumerable);
        if (i) out += emit(',');
        out += walk(desc.value, d + 1);
      }
      out += emit(']');
    } else {
      check(
        Object.getPrototypeOf(v) === Object.prototype ||
          Object.getPrototypeOf(v) === null,
      );
      const ds = Object.getOwnPropertyDescriptors(v);
      check(Reflect.ownKeys(v).length === Object.keys(ds).length);
      out = emit('{');
      let first = true;
      for (const k of Object.keys(ds).sort()) {
        check(/^[\x00-\x7f]*$/.test(k));
        const desc = ds[k]!;
        check('value' in desc && desc.enumerable);
        if (!first) out += emit(',');
        first = false;
        out += emit(JSON.stringify(k)) + emit(':') + walk(desc.value, d + 1);
      }
      out += emit('}');
    }
    seen.delete(v);
    return out;
  };
  return walk(value, 0);
}
export function rawDigest(bytes: string | Uint8Array): string {
  return 'sha256:' + createHash('sha256').update(bytes).digest('hex');
}
export function digest(v: unknown): string {
  return rawDigest(canonical(v));
}
export function detach<T>(v: T, maxBytes = MAX_BYTES): T {
  return parse(canonical(v, maxBytes), maxBytes) as T;
}
export function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
const ajv = new Ajv2020({
  strict: false,
  allErrors: false,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});
const validators = new Map<string, ValidateFunction>();
for (const [name, schema] of Object.entries(schemas))
  validators.set(name, ajv.compile(schema));
export function schema<T>(name: string, v: unknown): T {
  check(validators.get(name)?.(v));
  return v as T;
}
export function document<T>(name: string, bytes: string | Uint8Array): T {
  return schema<T>(name, parse(bytes));
}
export function version(v: string): number[] {
  check(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v));
  const parts = v.split('.').map(Number);
  check(parts.every((n) => Number.isSafeInteger(n) && n <= 2147483647));
  return parts;
}
export function unique(xs: unknown[]): void {
  check(new Set(xs.map((x) => canonical(x))).size === xs.length, 'CONFLICT');
}
export function requirement(r: Requirement): void {
  for (const n of [
    r.major,
    r.minMinor,
    ...(r.maxMinor === undefined ? [] : [r.maxMinor]),
  ])
    check(Number.isInteger(n) && n >= 0 && n <= 2147483647);
  check(r.maxMinor === undefined || r.maxMinor >= r.minMinor);
  check(!r.features.some((f) => r.optionalFeatures?.includes(f)));
}
const payloadShape = ajv.compile({
  $ref: schemas.capability.$id + '#/$defs/payload',
});
export function payloadSchema(s: PayloadSchema): void {
  check(payloadShape(s));
  const allowed: Record<string, string[]> = {
    object: ['properties', 'required', 'additionalProperties'],
    array: ['items', 'minItems', 'maxItems'],
    string: ['minLength', 'maxLength'],
    integer: ['minimum', 'maximum'],
    boolean: [],
    null: [],
  };
  check(
    Object.keys(s).every((k) =>
      ['type', 'enum', 'const', 'description', ...allowed[s.type]!].includes(k),
    ),
  );
  for (const [lo, hi] of [
    [s.minItems, s.maxItems],
    [s.minLength, s.maxLength],
    [s.minimum, s.maximum],
  ])
    check(lo === undefined || hi === undefined || lo <= hi);
  if (s.type === 'object') {
    check(s.additionalProperties === false && s.properties);
    check((s.required ?? []).every((k) => Object.hasOwn(s.properties!, k)));
    for (const child of Object.values(s.properties)) payloadSchema(child);
  }
  if (s.type === 'array') {
    check(s.items);
    payloadSchema(s.items);
  }
  const base = { ...s };
  delete base.enum;
  delete base.const;
  if (s.enum) {
    unique(s.enum);
    for (const x of s.enum) payload(base, x);
  }
  if (Object.hasOwn(s, 'const')) {
    payload(base, s.const);
    if (s.enum) check(s.enum.some((x) => canonical(x) === canonical(s.const)));
  }
}
export function payload(s: PayloadSchema, v: unknown): void {
  canonical(v);
  // Interpret the frozen finite payload vocabulary with own-key semantics.
  // JSON names such as __proto__ are data, not JavaScript prototype operations.
  const walk = (shape: PayloadSchema, value: unknown): void => {
    switch (shape.type) {
      case 'null':
        check(value === null);
        break;
      case 'boolean':
        check(typeof value === 'boolean');
        break;
      case 'integer':
        check(typeof value === 'number' && Number.isSafeInteger(value));
        check(shape.minimum === undefined || value >= shape.minimum);
        check(shape.maximum === undefined || value <= shape.maximum);
        break;
      case 'string':
        check(typeof value === 'string');
        {
          const length = Array.from(value).length;
          check(shape.minLength === undefined || length >= shape.minLength);
          check(shape.maxLength === undefined || length <= shape.maxLength);
        }
        break;
      case 'array':
        check(Array.isArray(value));
        check(shape.minItems === undefined || value.length >= shape.minItems);
        check(shape.maxItems === undefined || value.length <= shape.maxItems);
        for (const item of value) walk(shape.items!, item);
        break;
      case 'object':
        check(
          value !== null && typeof value === 'object' && !Array.isArray(value),
        );
        check((shape.required ?? []).every((k) => Object.hasOwn(value, k)));
        for (const key of Object.keys(value)) {
          check(Object.hasOwn(shape.properties!, key));
          walk(
            shape.properties![key]!,
            Object.getOwnPropertyDescriptor(value, key)!.value,
          );
        }
        break;
      default:
        fail('INVALID_ARGUMENT');
    }
    if (shape.enum)
      check(shape.enum.some((item) => canonical(item) === canonical(value)));
    if (Object.hasOwn(shape, 'const'))
      check(canonical(shape.const) === canonical(value));
  };
  walk(s, v);
}
export function manifest(bytes: string | Uint8Array): Manifest {
  const m = document<Manifest>('plugin', bytes);
  version(m.version);
  unique(m.provides.map((x) => [x.capabilityId, x.version]));
  unique([...m.requires, ...m.optionalRequires].map((x) => x.capabilityId));
  for (const r of [...m.requires, ...m.optionalRequires]) requirement(r);
  for (const dir of [m.publishedEvents, m.subscribedEvents]) {
    unique(dir.map((x) => x.eventType));
    for (const x of dir) version(x.version);
  }
  for (const x of m.provides) version(x.version);
  return m;
}
export function descriptor(bytes: string | Uint8Array): Descriptor {
  const d = document<Descriptor>('capability', bytes);
  version(d.version);
  unique(d.operations.map((x) => x.name));
  for (const o of d.operations) {
    payloadSchema(o.input);
    payloadSchema(o.output);
    check(o.kind !== 'stream' || o.idempotency === 'none');
  }
  return d;
}
