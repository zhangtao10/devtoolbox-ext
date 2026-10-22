import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, formatDate } from '../lib/time.js';

test('seconds vs milliseconds auto-detect', () => {
  assert.equal(parseTime('1700000000').getTime(), 1700000000000);
  assert.equal(parseTime('1700000000123').getTime(), 1700000000123);
  assert.equal(parseTime('1700000000.5').getTime(), 1700000000500);
});

test('microseconds / nanoseconds', () => {
  assert.equal(parseTime('1700000000123456').getTime(), 1700000000123);
  assert.equal(parseTime('1700000000123456789').getTime(), 1700000000123);
});

test('date strings', () => {
  assert.equal(parseTime('2023-11-14T22:13:20Z').getTime(), 1700000000000);
  assert.equal(parseTime('2023-11-14 22:13:20', { tz: 'UTC' }).getTime(), 1700000000000);
  assert.equal(parseTime('2023-11-15 06:13:20', { tz: 'Asia/Shanghai' }).getTime(), 1700000000000);
});

test('invalid', () => {
  assert.equal(parseTime('abc'), null);
  assert.equal(parseTime(''), null);
});

test('formatDate in timezone', () => {
  const d = new Date(1700000000123);
  assert.equal(formatDate(d, 'Asia/Shanghai'), '2023-11-15 06:13:20.123');
  assert.equal(formatDate(d, 'UTC'), '2023-11-14 22:13:20.123');
});
