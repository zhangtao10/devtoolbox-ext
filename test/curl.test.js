import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCurl, parseCurl, toFetch } from '../lib/curl.js';

test('isCurl detects curl commands', () => {
  assert.equal(isCurl('  curl https://a.com'), true);
  assert.equal(isCurl('curl.exe "https://a.com"'), true);
  assert.equal(isCurl('{"curl": 1}'), false);
  assert.equal(isCurl('curly'), false);
});

test('simple GET', () => {
  assert.deepEqual(parseCurl('curl https://api.example.com/users?id=1'), {
    ok: true,
    method: 'GET',
    url: 'https://api.example.com/users?id=1',
    headers: [],
    body: undefined,
  });
});

test('Chrome "Copy as cURL (bash)" with continuations, headers, cookie and data-raw', () => {
  const r = parseCurl(`curl 'https://a.com/api' \\
  -H 'accept: application/json' \\
  -H 'content-type: application/json' \\
  -b 'sid=abc; theme=dark' \\
  --data-raw $'{"name":"it\\'s","n":1}' \\
  --compressed`);
  assert.equal(r.ok, true);
  assert.equal(r.method, 'POST');
  assert.equal(r.url, 'https://a.com/api');
  assert.deepEqual(r.headers, [
    ['accept', 'application/json'],
    ['content-type', 'application/json'],
    ['Cookie', 'sid=abc; theme=dark'],
  ]);
  assert.equal(r.body, `{"name":"it's","n":1}`);
});

test('Chrome "Copy as cURL (cmd)" with ^ continuations and escapes', () => {
  const r = parseCurl('curl ^"https://a.com/api^" ^\n  -H ^"x-token: 1^" ^\n  --data-raw ^"^{^\\^"a^\\^":1^}^"');
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://a.com/api');
  assert.deepEqual(r.headers, [['x-token', '1'], ['Content-Type', 'application/x-www-form-urlencoded']]);
  assert.equal(r.body, '{"a":1}');
});

test('-X, attached short options and combined flags', () => {
  const r = parseCurl(`curl -sSL -XPUT -H"a: 1" "https://a.com" -d 'x=1' -d y=2`);
  assert.equal(r.method, 'PUT');
  assert.deepEqual(r.headers, [['a', '1'], ['Content-Type', 'application/x-www-form-urlencoded']]);
  assert.equal(r.body, 'x=1&y=2');
});

test('-G moves data into query string', () => {
  const r = parseCurl('curl -G https://a.com/s?q=1 -d page=2 --data-urlencode "kw=a b"');
  assert.equal(r.method, 'GET');
  assert.equal(r.url, 'https://a.com/s?q=1&page=2&kw=a%20b');
  assert.equal(r.body, undefined);
});

test('--json, -u, -A, --url, ignored options with values', () => {
  const r = parseCurl(`curl --max-time 5 -o out.txt --url a.com/x --json '{"a":1}' -u user:pw -A ua`);
  assert.equal(r.url, 'http://a.com/x');
  assert.equal(r.method, 'POST');
  assert.equal(r.body, '{"a":1}');
  assert.deepEqual(r.headers, [
    ['Content-Type', 'application/json'],
    ['Accept', 'application/json'],
    ['Authorization', `Basic ${btoa('user:pw')}`],
    ['User-Agent', 'ua'],
  ]);
});

test('-I uses HEAD', () => {
  assert.equal(parseCurl('curl -I https://a.com').method, 'HEAD');
});

test('errors', () => {
  assert.equal(parseCurl('curl -H "a: 1"').ok, false);
  assert.match(parseCurl('curl https://a.com -d @body.json').message, /文件/);
  assert.match(parseCurl(`curl 'https://a.com`).message, /引号/);
});

test('toFetch separates restricted headers (set via declarativeNetRequest) from normal ones', () => {
  const r = parseCurl(`curl https://a.com -H 'Cookie: a=1' -H 'User-Agent: x' -H 'sec-ch-ua: y' -H 'Host: a.com' -H 'X-A: 1' -d '{}' -H 'Content-Type: application/json'`);
  const { url, init, restricted, dropped } = toFetch(r);
  assert.equal(url, 'https://a.com');
  assert.equal(init.method, 'POST');
  assert.equal(init.body, '{}');
  assert.equal(init.credentials, 'omit'); // 带 Cookie 时只发送 curl 中的 Cookie
  assert.deepEqual(init.headers, [['X-A', '1'], ['Content-Type', 'application/json']]);
  assert.deepEqual(restricted, [['Cookie', 'a=1'], ['User-Agent', 'x'], ['sec-ch-ua', 'y']]);
  assert.deepEqual(dropped, ['Host']);
});

test('toFetch includes browser cookies when curl has none', () => {
  const { init, restricted } = toFetch(parseCurl('curl https://a.com'));
  assert.equal(init.credentials, 'include');
  assert.deepEqual(restricted, []);
});
