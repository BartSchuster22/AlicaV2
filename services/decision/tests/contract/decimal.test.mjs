import test from 'node:test';
import assert from 'node:assert/strict';
import { decimal, units, format, fromLexical, wireJSON, parseNumericJSON, structured, SCALE, probability, near } from '../../provider/decimal.mjs';

test('canonical decimal grammar, precision and range reject rather than round', () => {
  for (const x of ['0','0.5','-0.5','2.625','0.000000000000000001','123456789012345678.123456789012345678']) assert.equal(format(units(decimal(x))), x);
  for (const x of ['-0','+1','01','1.0','1e-1','NaN','Infinity','.5','1.',' 1','0.0000000000000000001','9'.repeat(37), 0.5]) assert.throws(() => decimal(x));
  assert.equal(probability('0.5'), SCALE / 2n);
  assert.throws(() => probability('-0.1')); assert.throws(() => probability('1.1'));
  assert(near(units('0.999999'), SCALE)); assert(!near(units('0.999998'), SCALE));
});
test('provider lexical exponent conversion uses the original token exactly', () => {
  assert.equal(fromLexical('1.23456789012345678e-1'), '0.123456789012345678');
  assert.equal(fromLexical('1.2300e2'), '123');
  assert.equal(fromLexical('-0.0'), '0');
  assert.equal(fromLexical('1e-18'), '0.000000000000000001');
  for (const x of ['1e-19','1e101','1e36','+1','01','NaN']) assert.throws(() => fromLexical(x));
});
test('wire conversion distinguishes exact numbers from ordinary literal strings', () => {
  const value = { n: { $decisionDecimal: '0.123456789012345678' }, s: '0.123456789012345678' };
  assert.equal(wireJSON(value), '{"n":0.123456789012345678,"s":"0.123456789012345678"}');
  assert.deepEqual(parseNumericJSON('{"n":1.23456789012345678e-1,"s":"0.123456789012345678"}'), value);
  assert.throws(() => parseNumericJSON('{"n":1e-19}'), { code: 'CONTRACT_MISMATCH' });
  assert.throws(() => parseNumericJSON('invalid sensitive body'), { message: 'CONTRACT_MISMATCH' });
});
test('structured numeric markers and size/depth limits fail closed', () => {
  for (const value of [{ n: 0.5 },{ n: NaN },{ n: Number.MAX_SAFE_INTEGER + 1 },
    { $decisionDecimal: '0.5', extra: true },{ $decisionDecimal: '0.50' }, { text: 'x'.repeat(32769) }]) assert.throws(() => structured(value));
  let v = {}; for (let i = 0; i < 18; i++) v = { child: v };
  assert.throws(() => structured(v));
  let invoked = false;
  const accessor = Object.defineProperty({}, '$decisionDecimal', { enumerable: true, get() { invoked = true; return '0.5'; } });
  assert.throws(() => structured(accessor)); assert.equal(invoked, false);
});
