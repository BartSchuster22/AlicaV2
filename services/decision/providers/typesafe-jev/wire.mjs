// TypeSafe wire boundary only. Numeric tokens have an unforgeable class identity;
// JSON strings or {$decisionDecimal:...} objects cannot impersonate numeric fields.
import { fromLexical, invalid, units, SCALE } from '../../provider/decimal.mjs';
class WireNumber {
  constructor(source) { this.decimal = fromLexical(source); Object.freeze(this); }
}
export function wireDecimal(value) {
  if (!(value instanceof WireNumber)) invalid('CONTRACT_MISMATCH');
  return value.decimal;
}
export function wireInteger(value) {
  const n = units(wireDecimal(value));
  if (n < 0n || n % SCALE || n / SCALE > BigInt(Number.MAX_SAFE_INTEGER)) invalid('CONTRACT_MISMATCH');
  return Number(n / SCALE);
}
export function parseWire(text) {
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 131072) invalid();
    let p = 0, nodes = 0;
    const space = () => { while (p < text.length && /[\x20\t\r\n]/.test(text[p])) p++; };
    const string = () => {
      const start = p++;
      while (p < text.length) {
        const c = text[p++];
        if (c === '"') {
          const out = JSON.parse(text.slice(start, p));
          if (!out.isWellFormed() || out.length > 32768) invalid();
          return out;
        }
        if (c === '\\') p++;
      }
      invalid();
    };
    const value = depth => {
      if (++nodes > 8192 || depth > 20) invalid();
      space(); const c = text[p];
      if (c === '"') return string();
      if (c === '{' || c === '[') {
        p++; const object = c === '{', result = object ? Object.create(null) : [], keys = new Set();
        space(); if (text[p] === (object ? '}' : ']')) { p++; return result; }
        for (;;) {
          space();
          if (object) {
            if (text[p] !== '"') invalid();
            const key = string(); if (keys.has(key)) invalid(); keys.add(key);
            space(); if (text[p++] !== ':') invalid();
            result[key] = value(depth + 1);
          } else result.push(value(depth + 1));
          space(); const next = text[p++];
          if (next === (object ? '}' : ']')) return result;
          if (next !== ',') invalid();
        }
      }
      for (const [word, v] of [['true',true],['false',false],['null',null]]) {
        if (text.startsWith(word, p)) { p += word.length; return v; }
      }
      const m = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(p));
      if (!m) invalid(); p += m[0].length;
      return new WireNumber(m[0]);
    };
    const out = value(0); space(); if (p !== text.length) invalid(); return out;
  } catch { invalid('CONTRACT_MISMATCH'); }
}
export function wireCanonical(value) {
  if (value instanceof WireNumber) return value.decimal;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(wireCanonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + wireCanonical(value[k])).join(',') + '}';
}
// Normalize only arbitrary structured legend data. Fields with numeric semantics
// MUST use wireDecimal/wireInteger instead; this never relaxes their wire types.
export function legendValue(value) {
  if (value instanceof WireNumber) {
    const n = units(value.decimal);
    if (n % SCALE === 0n && n / SCALE >= BigInt(Number.MIN_SAFE_INTEGER) && n / SCALE <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(n / SCALE);
    return { $decisionDecimal: value.decimal };
  }
  if (Array.isArray(value)) return value.map(legendValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,legendValue(v)]));
  return value;
}
