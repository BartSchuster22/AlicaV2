// Private interpreter for the approved, embedded schema vocabulary. No code
// generation or mutable filesystem schema reads occur inside a worker.
import { canonical, check, schemas } from '@alica/acap-contracts';
import { frameSchema, offerSchema } from './wire-schema.js';

type Shape = boolean | { [key: string]: unknown };
type Validator = (value: unknown) => boolean;
const documents = new Map<string, Shape>();
for (const doc of [...Object.values(schemas), frameSchema, offerSchema])
  documents.set(doc.$id, doc as Shape);
const cache = new WeakMap<object, Validator>();
const annotations = new Set(['$schema', '$id', '$comment', '$defs', 'title']);
const supported = new Set([
  ...annotations,
  '$ref',
  'type',
  'const',
  'enum',
  'oneOf',
  'anyOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'uniqueItems',
  'contains',
  'items',
  'properties',
  'required',
  'additionalProperties',
  'propertyNames',
]);
function equal(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}
function compile(shape: Shape, root: Shape): Validator {
  if (typeof shape === 'boolean') return () => shape;
  const prior = cache.get(shape);
  if (prior) return prior;
  for (const key of Object.keys(shape)) check(supported.has(key), 'INTERNAL');
  const rules: Validator[] = [];
  const compiled: Validator = (v) => rules.every((rule) => rule(v));
  cache.set(shape, compiled); // Resolve recursive value schemas without recursion at compile time.
  const child = (s: unknown) => compile(s as Shape, root);
  if (shape.$ref !== undefined) {
    const [url, fragment = ''] = String(shape.$ref).split('#');
    const doc = url ? documents.get(url) : root;
    check(doc, 'INTERNAL');
    let target: unknown = doc;
    for (const part of fragment.split('/').slice(1)) {
      check(target && typeof target === 'object', 'INTERNAL');
      const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
      check(Object.hasOwn(target, key), 'INTERNAL');
      target = (target as Record<string, unknown>)[key];
    }
    rules.push(compile(target as Shape, doc));
  }
  if (shape.type !== undefined) {
    const types: Record<string, Validator> = {
      null: (v) => v === null,
      boolean: (v) => typeof v === 'boolean',
      integer: (v) => typeof v === 'number' && Number.isSafeInteger(v),
      string: (v) => typeof v === 'string',
      array: Array.isArray,
      object: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
    };
    const rule = types[String(shape.type)];
    check(rule, 'INTERNAL');
    rules.push(rule);
  }
  if (Object.hasOwn(shape, 'const')) rules.push((v) => equal(v, shape.const));
  if (shape.enum)
    rules.push((v) => (shape.enum as unknown[]).some((x) => equal(v, x)));
  for (const kind of ['oneOf', 'anyOf', 'allOf'] as const) {
    if (!shape[kind]) continue;
    const branches = (shape[kind] as Shape[]).map(child);
    rules.push((v) =>
      kind === 'oneOf'
        ? branches.filter((test) => test(v)).length === 1
        : kind === 'anyOf'
          ? branches.some((test) => test(v))
          : branches.every((test) => test(v)),
    );
  }
  if (shape.not !== undefined) {
    const test = child(shape.not);
    rules.push((v) => !test(v));
  }
  if (shape.if !== undefined) {
    const test = child(shape.if),
      yes = child(shape.then ?? true),
      no = child(shape.else ?? true);
    rules.push((v) => (test(v) ? yes(v) : no(v)));
  }
  for (const [key, compare] of [
    ['minimum', (a: number, b: number) => a >= b],
    ['maximum', (a: number, b: number) => a <= b],
  ] as const)
    if (shape[key] !== undefined)
      rules.push(
        (v) => typeof v !== 'number' || compare(v, shape[key] as number),
      );
  const regex =
    shape.pattern === undefined
      ? undefined
      : new RegExp(String(shape.pattern), 'u');
  rules.push((v) => {
    if (typeof v !== 'string') return true;
    const length = Array.from(v).length;
    return (
      (shape.minLength === undefined ||
        length >= (shape.minLength as number)) &&
      (shape.maxLength === undefined ||
        length <= (shape.maxLength as number)) &&
      (!regex || regex.test(v))
    );
  });
  const item = shape.items === undefined ? undefined : child(shape.items);
  const contains =
    shape.contains === undefined ? undefined : child(shape.contains);
  rules.push((v) => {
    if (!Array.isArray(v)) return true;
    return (
      (shape.minItems === undefined ||
        v.length >= (shape.minItems as number)) &&
      (shape.maxItems === undefined ||
        v.length <= (shape.maxItems as number)) &&
      (!shape.uniqueItems ||
        new Set(v.map((x) => canonical(x))).size === v.length) &&
      (!item || v.every(item)) &&
      (!contains || v.some(contains))
    );
  });
  const properties = new Map(
    Object.entries((shape.properties ?? {}) as Record<string, Shape>).map(
      ([k, v]) => [k, child(v)],
    ),
  );
  const extra = child(shape.additionalProperties ?? true);
  const keyTest = child(shape.propertyNames ?? true);
  const required = (shape.required ?? []) as string[];
  rules.push((v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return true;
    return (
      required.every((k) => Object.hasOwn(v, k)) &&
      Object.entries(v).every(
        ([k, x]) => keyTest(k) && (properties.get(k) ?? extra)(x),
      )
    );
  });
  return compiled;
}
export const lanes = [
  'controlToBroker',
  'controlToProvider',
  'workToBroker',
  'workToProvider',
] as const;
export type Lane = (typeof lanes)[number];
const frameTests = new Map(
  lanes.map((lane) => [
    lane,
    compile(frameSchema.$defs[lane] as Shape, frameSchema),
  ]),
);
const offerTest = compile(offerSchema, offerSchema);
export function validateFrame(value: unknown, lane: Lane): void {
  check(frameTests.get(lane)?.(value));
}
export function validateOffer(value: unknown): void {
  check(offerTest(value));
}
