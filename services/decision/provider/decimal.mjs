// Decision-boundary arithmetic only. Never changes frozen ACAP numerical rules.
export const SCALE = 10n ** 18n;
export const TOLERANCE = SCALE / 1000000n;
export const DECIMAL_KEY = '$decisionDecimal';
export function invalid(code = 'INVALID_ARGUMENT') {
  const error = new Error(code);
  error.code = code;
  throw error;
}
export function units(value) {
  if (typeof value !== 'string' || value.length > 38 ||
      !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/.test(value) || value === '-0') invalid();
  const unsigned = value.startsWith('-') ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');
  if (fraction.length > 18 || whole.length + fraction.length > 36) invalid();
  return (BigInt(whole) * SCALE + BigInt(fraction.padEnd(18, '0'))) * (value.startsWith('-') ? -1n : 1n);
}
export function decimal(value) { units(value); return value; }
export function format(value) {
  const sign = value < 0n ? '-' : '';
  const n = value < 0n ? -value : value;
  const fraction = (n % SCALE).toString().padStart(18, '0').replace(/0+$/, '');
  return decimal(sign + (n / SCALE).toString() + (fraction ? '.' + fraction : ''));
}
export function probability(value) {
  const n = units(value);
  if (n < 0n || n > SCALE) invalid();
  return n;
}
export function near(a, b, tolerance = TOLERANCE) { return (a > b ? a - b : b - a) <= tolerance; }
// Parses the original numeric token, NOT the rounded JS numeric value.
export function fromLexical(source) {
  if (typeof source !== 'string' || source.length > 128) invalid();
  const m = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(source);
  if (!m) invalid();
  const exponent = Number(m[4] || '0');
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) invalid();
  let digits = m[2] + (m[3] || '');
  const point = m[2].length + exponent;
  let plain = point <= 0 ? '0.' + '0'.repeat(-point) + digits :
    point >= digits.length ? digits + '0'.repeat(point - digits.length) : digits.slice(0, point) + '.' + digits.slice(point);
  let [whole, fraction = ''] = plain.split('.');
  whole = whole.replace(/^0+(?=\d)/, '');
  fraction = fraction.replace(/0+$/, '');
  plain = whole + (fraction ? '.' + fraction : '');
  return decimal((m[1] && plain !== '0' ? '-' : '') + plain);
}
export function structured(value) {
  let nodes = 0, bytes = 0;
  function visit(v, depth) {
    if (++nodes > 4096 || depth > 16) invalid();
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'string') { bytes += Buffer.byteLength(v); if (bytes > 32768) invalid(); return; }
    if (typeof v === 'number') { if (!Number.isSafeInteger(v) || Object.is(v, -0)) invalid(); return; }
    if (typeof v !== 'object') invalid();
    if (Array.isArray(v)) { for (const item of v) visit(item, depth + 1); return; }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(v))) invalid();
    const keys = Object.keys(v);
    if (keys.includes(DECIMAL_KEY)) {
      const p = Object.getOwnPropertyDescriptor(v, DECIMAL_KEY);
      if (keys.length !== 1 || !p || !('value' in p)) invalid();
      decimal(p.value);
      return;
    }
    for (const k of keys) {
      bytes += Buffer.byteLength(k);
      if (bytes > 32768) invalid();
      const p = Object.getOwnPropertyDescriptor(v, k);
      if (!p || !('value' in p)) invalid();
      visit(p.value, depth + 1);
    }
  }
  visit(value, 0);
  return value;
}
// The reserved singleton is a numeric literal; an ordinary string stays a string.
export function wireJSON(value) {
  structured(value);
  return JSON.stringify(value, (_key, v) =>
    v && !Array.isArray(v) && typeof v === 'object' && Object.hasOwn(v, DECIMAL_KEY)
      ? JSON.rawJSON(decimal(v[DECIMAL_KEY])) : v);
}
export function parseNumericJSON(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 131072) invalid('CONTRACT_MISMATCH');
  try {
    const value = JSON.parse(text, (_key, v, context) => typeof v === 'number'
      ? { [DECIMAL_KEY]: fromLexical(context.source) } : v);
    structured(value);
    return value;
  } catch { invalid('CONTRACT_MISMATCH'); }
}
