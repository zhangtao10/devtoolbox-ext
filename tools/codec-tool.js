import { codecs, decodeJWT, hash, HASHES } from '../lib/codec.js';
import { formatDate } from '../lib/time.js';
import { el, on, h, copy, debounce, store, showError } from './ui.js';

export function initCodec(section) {
  const input = el(section, 'input');
  const output = el(section, 'output');
  const errBox = el(section, 'error');
  let current = store.get('codec.type', 'base64');

  const seg = el(section, 'codecs');
  seg.replaceChildren(
    ...Object.entries(codecs).map(([k, c]) =>
      h('button', { 'data-codec': k, onclick: () => select(k) }, c.label)
    )
  );
  function select(k) {
    current = k;
    store.set('codec.type', k);
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.codec === k));
  }

  const run = (dir) => {
    try {
      output.value = codecs[current][dir](input.value);
      showError(errBox, null);
    } catch (e) {
      output.value = '';
      showError(errBox, `${dir === 'encode' ? '编码' : '解码'}失败：${e.message}`);
    }
  };
  on(section, 'encode', () => run('encode'));
  on(section, 'decode', () => run('decode'));
  on(section, 'swap', () => {
    input.value = output.value;
    output.value = '';
    updateHashes();
  });
  on(section, 'copy', () => output.value && copy(output.value));

  // 哈希
  const hashTable = el(section, 'hashes');
  const updateHashes = debounce(async () => {
    store.set('codec.input', input.value);
    const rows = await Promise.all(HASHES.map(async (a) => [a.toUpperCase(), await hash(a, input.value)]));
    hashTable.replaceChildren(
      ...rows.map(([a, v]) => h('tr', {}, h('td', {}, a), h('td', { title: '点击复制', onclick: () => copy(v) }, v)))
    );
  }, 150);
  input.addEventListener('input', updateHashes);

  // JWT
  const jwt = el(section, 'jwt');
  const jwtOut = el(section, 'jwt-out');
  const fmtTs = (s) => (typeof s === 'number' ? `${formatDate(new Date(s * 1000))}` : '');
  jwt.addEventListener('input', () => {
    if (!jwt.value.trim()) return jwtOut.replaceChildren();
    try {
      const { header, payload, signature } = decodeJWT(jwt.value);
      const notes = ['iat', 'nbf', 'exp']
        .filter((k) => typeof payload[k] === 'number')
        .map((k) => `${k}: ${fmtTs(payload[k])}`);
      if (typeof payload.exp === 'number') notes.push(payload.exp * 1000 < Date.now() ? '⚠️ 已过期' : '✓ 未过期');
      jwtOut.replaceChildren(
        h('div', { class: 'jwt-part' }, h('h3', {}, 'Header'), h('pre', {}, JSON.stringify(header, null, 2))),
        h(
          'div',
          { class: 'jwt-part' },
          h('h3', {}, 'Payload'),
          h('pre', {}, JSON.stringify(payload, null, 2)),
          notes.length ? h('div', { class: 'exp muted' }, notes.join(' · ')) : null
        ),
        h('div', { class: 'jwt-part' }, h('h3', {}, 'Signature（未校验）'), h('pre', {}, signature || '（无）'))
      );
    } catch (e) {
      jwtOut.replaceChildren(h('div', { class: 'error inline' }, e.message));
    }
  });

  input.value = store.get('codec.input', '');
  select(current);
  updateHashes();
}
