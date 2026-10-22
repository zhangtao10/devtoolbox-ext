import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, formatAll } from '../lib/color.js';

test('parse hex variants', () => {
  assert.deepEqual(parseColor('#ff0000'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('#f00'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('00ff0080'), { r: 0, g: 255, b: 0, a: 128 / 255 });
});

test('parse rgb / rgba', () => {
  assert.deepEqual(parseColor('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3, a: 1 });
  assert.deepEqual(parseColor('rgba(1,2,3,0.5)'), { r: 1, g: 2, b: 3, a: 0.5 });
  assert.deepEqual(parseColor('rgb(1 2 3 / 50%)'), { r: 1, g: 2, b: 3, a: 0.5 });
});

test('parse hsl', () => {
  assert.deepEqual(parseColor('hsl(0, 100%, 50%)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('hsl(120 100% 25%)'), { r: 0, g: 128, b: 0, a: 1 });
});

test('parse hsv / cmyk / named', () => {
  assert.deepEqual(parseColor('hsv(240, 100%, 100%)'), { r: 0, g: 0, b: 255, a: 1 });
  assert.deepEqual(parseColor('cmyk(0%, 100%, 100%, 0%)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('rebeccapurple'), { r: 102, g: 51, b: 153, a: 1 });
});

test('invalid returns null', () => {
  assert.equal(parseColor('nope'), null);
  assert.equal(parseColor('#12'), null);
  assert.equal(parseColor('rgb(300,0,0)'), null);
});

test('formatAll outputs every format', () => {
  const out = formatAll({ r: 255, g: 87, b: 51, a: 1 });
  assert.equal(out.hex, '#FF5733');
  assert.equal(out.rgb, 'rgb(255, 87, 51)');
  assert.equal(out.hsl, 'hsl(11, 100%, 60%)');
  assert.equal(out.hsv, 'hsv(11, 80%, 100%)');
  assert.equal(out.cmyk, 'cmyk(0%, 66%, 80%, 0%)');
  assert.equal(out.int, '16734003');
});

test('formatAll with alpha', () => {
  const out = formatAll({ r: 0, g: 0, b: 0, a: 0.5 });
  assert.equal(out.hex, '#00000080');
  assert.equal(out.rgb, 'rgba(0, 0, 0, 0.5)');
  assert.equal(out.hsl, 'hsla(0, 0%, 0%, 0.5)');
});
