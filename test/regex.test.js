import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRegex, PRESETS } from '../lib/regex.js';

test('collects all matches with index and groups', () => {
  const r = runRegex('(\\d+)-(?<w>[a-z]+)', 'g', 'x 12-ab 3-c');
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.matches.map((m) => [m.index, m.text, m.groups, m.named]),
    [
      [2, '12-ab', ['12', 'ab'], { w: 'ab' }],
      [8, '3-c', ['3', 'c'], { w: 'c' }],
    ]
  );
});

test('non-global returns first only', () => {
  assert.equal(runRegex('a', '', 'aaa').matches.length, 1);
});

test('zero-length matches do not loop forever', () => {
  assert.equal(runRegex('x*', 'g', 'ab').matches.length, 3);
});

test('replace', () => {
  assert.equal(runRegex('(\\w+)@', 'g', 'a@ b@', '[$1]').replaced, '[a] [b]');
});

test('invalid pattern', () => {
  const r = runRegex('(', 'g', 'x');
  assert.equal(r.ok, false);
  assert.ok(r.message);
});

test('presets are valid and match examples', () => {
  for (const p of PRESETS) {
    const re = new RegExp(p.pattern, p.flags ?? '');
    assert.ok(re.test(p.example), `${p.name} should match ${p.example}`);
  }
});
