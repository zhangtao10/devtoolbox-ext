import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codecs, decodeJWT } from '../lib/codec.js';

const roundtrip = (name, plain, encoded) => {
  assert.equal(codecs[name].encode(plain), encoded, `${name} encode`);
  assert.equal(codecs[name].decode(encoded), plain, `${name} decode`);
};

test('base64 utf8', () => roundtrip('base64', '你好, world', '5L2g5aW9LCB3b3JsZA=='));
test('base64url', () => roundtrip('base64url', 'ÿþ?', 'w7_Dvj8'));
test('url', () => roundtrip('url', 'a b&c=中', 'a%20b%26c%3D%E4%B8%AD'));
test('unicode', () => roundtrip('unicode', 'A中😀', 'A\\u4e2d\\ud83d\\ude00'));
test('html', () => {
  roundtrip('html', '<a href="x">&\'</a>', '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(codecs.html.decode('&#x4e2d;&#20013;&nbsp;&copy;'), '中中 ©');
});
test('hex', () => roundtrip('hex', 'Hi中', '4869e4b8ad'));
test('base64 decode invalid throws', () => {
  assert.throws(() => codecs.base64.decode('@@@'));
});

test('decodeJWT', () => {
  const t = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const r = decodeJWT(t);
  assert.deepEqual(r.header, { alg: 'HS256', typ: 'JWT' });
  assert.equal(r.payload.name, 'John Doe');
  assert.equal(r.signature, 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
});

import { hash } from '../lib/codec.js';
test('hash', async () => {
  assert.equal(await hash('md5', 'abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(await hash('md5', ''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(await hash('md5', '中文'), 'a7bac2239fcdcb3a067903d8077c4a07');
  assert.equal(await hash('SHA-1', 'abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(await hash('SHA-256', 'abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
