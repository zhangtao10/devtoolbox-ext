import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJSON, diffJSON } from '../lib/json.js';

test('parseJSON ok', () => {
  assert.deepEqual(parseJSON('{"a":1}'), { ok: true, value: { a: 1 } });
});

test('parseJSON error reports line/col', () => {
  const r = parseJSON('{\n  "a": 1,\n  "b": }');
  assert.equal(r.ok, false);
  assert.equal(r.line, 3);
  assert.ok(r.column > 0);
  assert.ok(r.message);
});

test('parseJSON tolerates trailing comma & comments in loose mode', () => {
  const r = parseJSON('{ // c\n "a": 1, /* x */ "b": [1,2,], }', { loose: true });
  assert.deepEqual(r, { ok: true, value: { a: 1, b: [1, 2] } });
});

test('diff identical -> empty', () => {
  assert.deepEqual(diffJSON({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), []);
});

test('diff detects added, removed, changed with paths', () => {
  const d = diffJSON(
    { a: 1, b: { c: 2, d: 3 }, arr: [1, 2, 3] },
    { a: 2, b: { c: 2, e: 4 }, arr: [1, 2] }
  );
  assert.deepEqual(d, [
    { type: 'changed', path: '$.a', left: 1, right: 2 },
    { type: 'removed', path: '$.b.d', left: 3 },
    { type: 'added', path: '$.b.e', right: 4 },
    { type: 'removed', path: '$.arr[2]', left: 3 },
  ]);
});

test('diff type change', () => {
  assert.deepEqual(diffJSON({ a: [1] }, { a: { 0: 1 } }), [
    { type: 'changed', path: '$.a', left: [1], right: { 0: 1 } },
  ]);
});

test('diff quotes non-identifier keys', () => {
  assert.deepEqual(diffJSON({ 'a-b': 1 }, { 'a-b': 2 }), [
    { type: 'changed', path: '$["a-b"]', left: 1, right: 2 },
  ]);
});

import { lineDiff } from '../lib/json.js';
test('lineDiff aligns rows', () => {
  assert.deepEqual(lineDiff(['a', 'b', 'c'], ['a', 'x', 'c', 'd']), [
    { type: 'same', left: 'a', right: 'a' },
    { type: 'del', left: 'b' },
    { type: 'add', right: 'x' },
    { type: 'same', left: 'c', right: 'c' },
    { type: 'add', right: 'd' },
  ]);
});

// 参考实现：O(n*m) DP 求 LCS 长度
function lcsLen(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  return dp[0][0];
}

test('lineDiff is a valid and minimal edit script (randomized)', () => {
  let seed = 7;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  for (let t = 0; t < 300; t++) {
    const a = Array.from({ length: rnd(30) }, () => 'l' + rnd(6));
    const b = Array.from({ length: rnd(30) }, () => 'l' + rnd(6));
    const ops = lineDiff(a, b);
    assert.deepEqual(ops.filter((o) => o.type !== 'add').map((o) => o.left), a);
    assert.deepEqual(ops.filter((o) => o.type !== 'del').map((o) => o.right), b);
    assert.equal(ops.filter((o) => o.type === 'same').length, lcsLen(a, b), `case ${t}`);
  }
});

test('lineDiff handles large mostly-equal inputs quickly', () => {
  const a = Array.from({ length: 200000 }, (_, i) => 'line' + i);
  const b = a.map((x, i) => (i % 1000 ? x : x + '!'));
  const t = performance.now();
  const ops = lineDiff(a, b);
  assert.ok(performance.now() - t < 2000);
  assert.equal(ops.filter((o) => o.type === 'del').length, 200);
});

test('lineDiff degrades gracefully when budget is exceeded', () => {
  const a = Array.from({ length: 3000 }, (_, i) => 'a' + i);
  const b = Array.from({ length: 3000 }, (_, i) => 'b' + i);
  const ops = lineDiff(a, b, { budget: 1000 });
  assert.equal(ops.approx, true);
  assert.deepEqual(ops.filter((o) => o.type !== 'add').map((o) => o.left), a);
  assert.deepEqual(ops.filter((o) => o.type !== 'del').map((o) => o.right), b);
});
