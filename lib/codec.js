// 常用编码 / 解码 / 哈希。所有文本按 UTF-8 处理。

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBytes(b64) {
  const s = b64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 === 1) throw new Error('不是合法的 Base64');
  const bin = atob(s.padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const HTML_ENC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const HTML_NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™',
  hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', middot: '·', yen: '¥', euro: '€', times: '×', divide: '÷',
};

export const codecs = {
  base64: {
    label: 'Base64',
    encode: (s) => bytesToBase64(enc.encode(s)),
    decode: (s) => dec.decode(base64ToBytes(s)),
  },
  base64url: {
    label: 'Base64 URL',
    encode: (s) => codecs.base64.encode(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    decode: (s) => codecs.base64.decode(s.trim().replace(/-/g, '+').replace(/_/g, '/')),
  },
  url: {
    label: 'URL (Component)',
    encode: (s) => encodeURIComponent(s),
    decode: (s) => decodeURIComponent(s.replace(/\+/g, ' ')),
  },
  uri: {
    label: 'URL (完整 URI)',
    encode: (s) => encodeURI(s),
    decode: (s) => decodeURI(s),
  },
  unicode: {
    label: 'Unicode \\uXXXX',
    encode: (s) =>
      s.replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')),
    decode: (s) =>
      s
        .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
  },
  html: {
    label: 'HTML 实体',
    encode: (s) => s.replace(/[&<>"']/g, (c) => HTML_ENC[c]),
    decode: (s) =>
      s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
        if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1));
        return HTML_NAMED[e] ?? m;
      }),
  },
  hex: {
    label: 'Hex (UTF-8)',
    encode: (s) => [...enc.encode(s)].map((b) => b.toString(16).padStart(2, '0')).join(''),
    decode: (s) => {
      const h = s.replace(/0x|\\x|[\s,:]/gi, '');
      if (!/^([0-9a-fA-F]{2})*$/.test(h)) throw new Error('不是合法的 Hex 字符串');
      return dec.decode(Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16)));
    },
  },
};

export function decodeJWT(token) {
  const parts = token.trim().split('.');
  if (parts.length < 2) throw new Error('JWT 至少需要 header.payload 两段');
  const part = (p, name) => {
    try {
      return JSON.parse(codecs.base64url.decode(p));
    } catch {
      throw new Error(`JWT ${name} 解析失败`);
    }
  };
  return { header: part(parts[0], 'header'), payload: part(parts[1], 'payload'), signature: parts[2] ?? '' };
}

// ---- MD5（WebCrypto 不提供，手写实现）----
function md5(bytes) {
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const len = bytes.length;
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (len * 8) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(len / 0x20000000), true);

  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let off = 0; off < padded.length; off += 64) {
    const M = Array.from({ length: 16 }, (_, i) => view.getUint32(off + i * 4, true));
    let [A, B, C, D] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) [F, g] = [(B & C) | (~B & D), i];
      else if (i < 32) [F, g] = [(D & B) | (~D & C), (5 * i + 1) % 16];
      else if (i < 48) [F, g] = [B ^ C ^ D, (3 * i + 5) % 16];
      else [F, g] = [C ^ (B | ~D), (7 * i) % 16];
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      const s = S[(i >> 4) * 4 + (i % 4)];
      B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((v, i) => out.setUint32(i * 4, v, true));
  return new Uint8Array(out.buffer);
}

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const HASHES = ['md5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

export async function hash(algo, text) {
  const bytes = enc.encode(text);
  if (algo === 'md5') return toHex(md5(bytes));
  return toHex(await crypto.subtle.digest(algo, bytes));
}
